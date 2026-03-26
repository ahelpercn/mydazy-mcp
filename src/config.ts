import { z } from "zod";

export const MydazyMcpConfigSchema = z.object({
  /**
   * Xiaozhi hosted MCP relay WebSocket URL.
   * e.g. wss://api.xiaozhi.me/mcp/?token=<JWT>
   */
  mcpServerUrl: z.string().url(),

  /**
   * mydazy webhook URL for push notifications.
   * Obtained from mydazy mini-program → Bot page.
   */
  webhookUrl: z.string().url(),

  /** Trigger word pushed to device when results are ready. Must be ≤10 chars. */
  triggerWord: z.string().min(1).max(10).default("小龙虾有结果了"),

  /** Default OpenClaw agent to route tasks to */
  defaultAgent: z.string().default("main"),

  /** Max queued result entries before old ones are dropped */
  maxQueueSize: z.number().int().min(1).max(200).default(50),

  /** Timeout for agent task execution in milliseconds */
  taskTimeoutMs: z.number().int().min(5000).default(120_000),

  /** Reconnect delay on WS disconnect (ms) */
  reconnectDelayMs: z.number().int().min(500).default(5_000),
});

export type MydazyMcpConfig = z.infer<typeof MydazyMcpConfigSchema>;

export const mydazyMcpConfigSchema = {
  parse(value: unknown): MydazyMcpConfig {
    const raw =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return MydazyMcpConfigSchema.parse(raw);
  },
  uiHints: {
    mcpServerUrl: {
      label: "MCP 地址",
      help: "小程序「设备」页面获取的 MCP 地址",
      sensitive: true,
    },
    webhookUrl: {
      label: "Webhook 地址",
      help: "小程序「Bot」页面获取的 Webhook 地址",
      sensitive: true,
    },
    triggerWord: {
      label: "播报触发词（≤10 字）",
      help: "任务完成后推送到设备的触发词，如 小龙虾有结果了",
    },
    defaultAgent: {
      label: "Default Agent",
      help: "OpenClaw agent ID that handles tasks without an explicit agent param.",
    },
    taskTimeoutMs: { label: "Task Timeout (ms)", advanced: true },
    maxQueueSize: { label: "Max Queue Size", advanced: true },
    reconnectDelayMs: { label: "WS Reconnect Delay (ms)", advanced: true },
  },
};
