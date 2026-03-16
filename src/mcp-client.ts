/**
 * MCP WebSocket client that connects OUTBOUND to the xiaozhi hosted relay.
 *
 * Protocol: JSON-RPC 2.0 wrapped in xiaozhi session envelope:
 *   { session_id, type: "mcp", payload: { jsonrpc: "2.0", id?, method, params? } }
 *
 * Notifications (no id) are server→client.
 * Requests (with id) require a response.
 *
 * Tools exposed:
 *   send_task        – queue an agent task
 *   get_results      – drain the result queue for this session
 *   task_status      – poll a task by ID
 *   list_agents      – list available agents
 *   push_notification – immediately push a tts notification to all devices
 */

import { WebSocket } from "ws";
import type { MydazyMcpConfig } from "./config.js";
import type { CoreConfig } from "./core-bridge.js";
import { buildOralSummary } from "./result-narrator.js";
import { TaskQueue } from "./task-queue.js";
import { runTask } from "./task-runner.js";
import { pushWebhook } from "./webhook-pusher.js";

type Logger = {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
};

/** xiaozhi envelope wrapper */
type XiaozhiEnvelope = {
  session_id: string;
  type: "mcp";
  payload: JsonRpcMessage;
};

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

// ---------------------------------------------------------------------------
// Tool definitions (returned on tools/list)
// ---------------------------------------------------------------------------

const MCP_TOOLS = [
  {
    name: "send_task",
    description:
      "【触发条件】用户说出小龙虾（或同音谐音：小笼虾、小龙侠、小龙下、小龙霞、晓龙虾、小隆虾）后接任何需要电脑协助完成的指令时调用。任务在后台执行，完成后有结果会推送通知。调用后立即告知用户好的小龙虾收到了。",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "去掉触发前缀后的完整任务指令" },
      },
    },
  },
  {
    name: "get_results",
    description:
      "【触发条件】收到推送触发词（小龙虾有结果了，或同音谐音）后立即调用，获取已完成任务的口语化结果并朗读给用户。也可在用户询问结果怎么样、有什么消息时调用。返回内容已是口播格式，直接朗读即可。",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "最多返回条数（默认 5）" },
      },
    },
  },
  {
    name: "task_status",
    description:
      "查询指定任务的当前执行状态（pending/running/done/error）。用户询问任务做到哪了时调用。",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string", description: "send_task 返回的 taskId" },
      },
    },
  },
  {
    name: "push_notification",
    description:
      "立即向设备推送一条 TTS 消息（不创建 agent 任务）。文本 ≤10 字将直接朗读；适合发送简短提醒。",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "要播报的消息（建议 ≤120 字）" },
      },
    },
  },
  {
    name: "check_service",
    description:
      "【触发条件】用户询问有没有开通小龙虾服务、小龙虾服务是否可用、小龙虾在线吗等确认服务状态时调用。返回服务名称、在线状态及可用工具列表，让用户知道小龙虾服务已就绪。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// McpClient class
// ---------------------------------------------------------------------------

/** Interval for WS-level ping to prevent relay idle-timeout (ms) */
const PING_INTERVAL_MS = 20_000;

export class McpClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId = "";
  /** true when relay sends bare JSON-RPC (no xiaozhi envelope) */
  private useBareMode = false;
  private readonly queue: TaskQueue;

  constructor(
    private readonly config: MydazyMcpConfig,
    private readonly coreConfig: CoreConfig,
    private readonly logger: Logger,
  ) {
    this.queue = new TaskQueue(config);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "shutdown");
      this.ws = null;
    }
  }

  /** Expose queue for gateway method handlers */
  getQueue(): TaskQueue {
    return this.queue;
  }

  // ---------------------------------------------------------------------------
  // WebSocket connection
  // ---------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;

    this.logger.info(`[mydazy-mcp] connecting to ${this.config.mcpServerUrl}`);
    const ws = new WebSocket(this.config.mcpServerUrl);
    this.ws = ws;

    ws.on("open", () => {
      this.logger.info("[mydazy-mcp] relay connected");
      this.startPing(ws);
    });

    ws.on("message", (data) => {
      try {
        this.handleMessage(data.toString());
      } catch (e) {
        this.logger.warn(
          `[mydazy-mcp] message handler error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });

    ws.on("close", (code, reason) => {
      this.logger.warn(
        `[mydazy-mcp] relay disconnected (${code} ${reason.toString()}), reconnecting in ${this.config.reconnectDelayMs}ms`,
      );
      this.clearPing();
      this.ws = null;
      this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      this.logger.error(`[mydazy-mcp] ws error: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Ping / keepalive
  // ---------------------------------------------------------------------------

  private startPing(ws: WebSocket): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        // Send both WS-level ping and JSON-level ping for relay keepalive
        ws.ping();
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.config.reconnectDelayMs);
  }

  // ---------------------------------------------------------------------------
  // Message dispatch
  // ---------------------------------------------------------------------------

  private handleMessage(raw: string): void {
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.logger.warn("[mydazy-mcp] invalid JSON from relay");
      return;
    }

    // Brief log for every relay message (type + first 80 chars)
    const msgType = typeof envelope.type === "string" ? envelope.type : "unknown";
    this.logger.info(`[mydazy-mcp] ← type=${msgType} ${raw.slice(0, 80)}`);

    // JSON-level ping from relay — respond with pong
    if (envelope.type === "ping") {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "pong" }));
      }
      return;
    }

    // === bare JSON-RPC 2.0 (relay forwards device messages directly) ===
    if (envelope.jsonrpc === "2.0") {
      this.useBareMode = true;
      const rpc = envelope as unknown as JsonRpcMessage;
      // Notification (no id) — ignore
      if (rpc.id === undefined) return;
      if (!rpc.method) {
        this.sendError(rpc.id, -32600, "invalid request: no method");
        return;
      }
      this.dispatch(rpc.id, rpc.method, (rpc.params as Record<string, unknown>) ?? {}).catch(
        (e) => {
          this.logger.error(
            `[mydazy-mcp] dispatch error: ${e instanceof Error ? e.message : String(e)}`,
          );
        },
      );
      return;
    }

    // === xiaozhi envelope format ===
    if (envelope.type !== "mcp") return;

    this.useBareMode = false;
    const typedEnvelope = envelope as unknown as XiaozhiEnvelope;

    const rpc = typedEnvelope.payload;
    if (!rpc || rpc.jsonrpc !== "2.0") return;

    // Notification (no id) — ignore for now
    if (rpc.id === undefined) return;

    this.sessionId = typedEnvelope.session_id;

    if (!rpc.method) {
      this.sendError(rpc.id, -32600, "invalid request: no method");
      return;
    }

    this.dispatch(rpc.id, rpc.method, rpc.params ?? {}).catch((e) => {
      this.logger.error(
        `[mydazy-mcp] dispatch error: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }

  private async dispatch(
    id: string | number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    switch (method) {
      case "initialize":
        this.sendResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "mydazy-mcp", version: "2026.3.12" },
        });
        break;

      case "ping":
        // MCP spec ping — respond with empty result
        this.sendResult(id, {});
        break;

      case "tools/list":
        this.sendResult(id, { tools: MCP_TOOLS });
        break;

      case "tools/call":
        await this.handleToolCall(id, params);
        break;

      default:
        this.sendError(id, -32601, `method not found: ${method}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  private async handleToolCall(
    id: string | number,
    params: Record<string, unknown>,
  ): Promise<void> {
    const name = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments as Record<string, unknown>) ?? {};

    switch (name) {
      case "send_task":
        await this.toolSendTask(id, args);
        break;
      case "get_results":
        this.toolGetResults(id, args);
        break;
      case "task_status":
        this.toolTaskStatus(id, args);
        break;
      case "push_notification":
        await this.toolPushNotification(id, args);
        break;
      case "check_service":
        this.toolCheckService(id);
        break;
      default:
        this.sendError(id, -32601, `unknown tool: ${name}`);
    }
  }

  private async toolSendTask(id: string | number, args: Record<string, unknown>): Promise<void> {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      this.sendToolError(id, "prompt is required");
      return;
    }
    // Always route through defaultAgent ("main"); let OpenClaw dispatch internally.
    const agent = this.config.defaultAgent;

    // Normalise empty sessionId → "broadcast" so slot keys stay consistent
    // with toolGetResults() which also uses || "broadcast".
    const task = this.queue.create({ agent, prompt, sourceDevice: this.sessionId || "broadcast" });
    const triggerWord = this.config.devices[0]?.triggerWord ?? "小龙虾有结果了";

    // Acknowledge receipt immediately; task runs in background.
    this.sendToolText(id, `好的，小龙虾收到了 ✅\n任务正在后台执行，有结果会通知你。`);

    // Fire-and-forget: push notification only when task produces a real result.
    runTask({
      taskId: task.id,
      agent,
      prompt,
      timeoutMs: this.config.taskTimeoutMs,
      coreConfig: this.coreConfig,
      queue: this.queue,
      pushttsUrl: this.config.pushttsUrl,
      triggerWord,
      logger: this.logger,
    }).catch((e) => {
      this.logger.error(
        `[mydazy-mcp] runTask error: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }

  private toolGetResults(id: string | number, args: Record<string, unknown>): void {
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 20) : 5;
    const deviceId = this.sessionId || "broadcast";
    const entries = this.queue.consumeForDevice(deviceId, limit);

    if (entries.length === 0) {
      this.sendToolText(id, "暂时没有新的结果，稍后再试。");
      return;
    }

    const lines = entries.map((e, i) => `${i + 1}. [${e.taskId.slice(0, 8)}] ${e.oralText}`);
    this.sendToolText(id, lines.join("\n\n"));
  }

  private toolTaskStatus(id: string | number, args: Record<string, unknown>): void {
    const taskId = typeof args.task_id === "string" ? args.task_id : "";
    if (!taskId) {
      this.sendToolError(id, "task_id is required");
      return;
    }
    const task = this.queue.get(taskId);
    if (!task) {
      this.sendToolText(id, `任务 ${taskId} 未找到。`);
      return;
    }
    const statusEmoji: Record<string, string> = {
      pending: "⏳",
      running: "🔄",
      done: "✅",
      error: "❌",
    };
    const emoji = statusEmoji[task.status] ?? "❓";
    let text = `${emoji} 状态: ${task.status}\ntaskId: ${task.id}\nagent: ${task.agent}`;
    if (task.status === "running" && task.progress.length > 0) {
      text += `\n进度: ${task.progress[task.progress.length - 1]}`;
    }
    if (task.status === "done" && task.oralSummary) {
      text += `\n结果: ${task.oralSummary}`;
    }
    if (task.status === "error" && task.errorMessage) {
      text += `\n错误: ${task.errorMessage}`;
    }
    this.sendToolText(id, text);
  }

  private async toolPushNotification(
    id: string | number,
    args: Record<string, unknown>,
  ): Promise<void> {
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!text) {
      this.sendToolError(id, "text is required");
      return;
    }

    const oral = buildOralSummary(text);
    const trimmed = oral.trim();
    const isShort = trimmed.length <= 8;

    const result = await pushWebhook(
      this.config.pushttsUrl,
      {
        type: "tts",
        text: this.config.devices[0]?.triggerWord ?? "小龙虾有结果了",
        inline_result: isShort ? trimmed : undefined,
        has_queue: !isShort,
      },
      this.logger,
    );

    if (result.ok) {
      this.sendToolText(id, `✅ 推送成功：${oral}`);
    } else {
      this.sendToolText(id, `❌ 推送失败：${result.error}`);
    }
  }

  private toolCheckService(id: string | number): void {
    const toolNames = MCP_TOOLS.map((t) => t.name).join("、");
    const wsState = this.ws?.readyState;
    const online = wsState === WebSocket.OPEN;
    const statusLabel = online ? "在线" : "连接中";
    this.sendToolText(
      id,
      `✅ 小龙虾服务已开通，当前${statusLabel}。\n` +
        `可用工具（${MCP_TOOLS.length} 个）：${toolNames}。\n` +
        `默认 agent：${this.config.defaultAgent}，` +
        `设备数：${this.config.devices.length}。`,
    );
  }

  // ---------------------------------------------------------------------------
  // Send helpers
  // ---------------------------------------------------------------------------

  private send(payload: JsonRpcMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn("[mydazy-mcp] cannot send: ws not open");
      return;
    }
    if (this.useBareMode) {
      // Relay forwards bare JSON-RPC — respond in kind
      this.ws.send(JSON.stringify(payload));
    } else {
      // Wrap in xiaozhi session envelope
      const envelope: XiaozhiEnvelope = {
        session_id: this.sessionId,
        type: "mcp",
        payload,
      };
      this.ws.send(JSON.stringify(envelope));
    }
  }

  private sendResult(id: string | number, result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  private sendError(id: string | number, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  private sendToolText(id: string | number, text: string): void {
    this.sendResult(id, {
      content: [{ type: "text", text }],
    });
  }

  private sendToolError(id: string | number, message: string): void {
    this.sendResult(id, {
      content: [{ type: "text", text: `❌ ${message}` }],
      isError: true,
    });
  }
}
