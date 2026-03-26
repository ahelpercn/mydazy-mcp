import type {
  GatewayRequestHandlerOptions,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/mydazy-mcp";
import { MydazyMcpConfigSchema, mydazyMcpConfigSchema } from "./src/config";
import { McpClient } from "./src/mcp-client";
import { buildOralSummary, isInlineable } from "./src/result-narrator";
import { pushWebhook } from "./src/webhook-pusher";

type MydazyRuntime = {
  client: McpClient;
};

const mydazyMcpPlugin = {
  id: "mydazy-mcp",
  name: "MyDazy MCP",
  description:
    "Connect OpenClaw agents to MyDazy devices via MCP relay with TTS push notifications.",
  configSchema: mydazyMcpConfigSchema,

  register(api: OpenClawPluginApi) {
    // ----------------------------------------------------------------
    // Graceful config validation: if required fields are missing or
    // the plugin is disabled, skip registration silently so Gateway
    // doesn't crash on a fresh/incomplete install.
    // ----------------------------------------------------------------
    const raw =
      api.pluginConfig && typeof api.pluginConfig === "object"
        ? (api.pluginConfig as Record<string, unknown>)
        : {};

    if (raw.enabled === false) {
      api.logger.info(
        "[mydazy-mcp] Plugin disabled — skipping. Run `npx openclaw-mydazy-mcp setup` to configure.",
      );
      return;
    }

    const parsed = MydazyMcpConfigSchema.safeParse(raw);
    if (!parsed.success) {
      const missing = parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ");
      api.logger.warn(
        `[mydazy-mcp] Config incomplete (${missing}) — plugin not loaded. Run \`npx openclaw-mydazy-mcp setup\` to configure.`,
      );
      return;
    }

    const config = parsed.data;

    let runtime: MydazyRuntime | null = null;

    const ensureRuntime = (): MydazyRuntime => {
      if (runtime) return runtime;
      const client = new McpClient(config, api.logger);
      runtime = { client };
      return runtime;
    };

    // ------------------------------------------------------------------
    // Service: manage WS connection lifecycle
    // ------------------------------------------------------------------
    api.registerService({
      id: "mydazy-mcp",
      start: async () => {
        try {
          const rt = ensureRuntime();
          rt.client.start();
          api.logger.info("[mydazy-mcp] MCP client started");
        } catch (err) {
          api.logger.error(
            `[mydazy-mcp] failed to start: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
      stop: async () => {
        if (!runtime) return;
        runtime.client.stop();
        runtime = null;
        api.logger.info("[mydazy-mcp] MCP client stopped");
      },
    });

    // ------------------------------------------------------------------
    // Gateway method: mydazy-mcp.push — agent-initiated notification
    // ------------------------------------------------------------------
    api.registerGatewayMethod(
      "mydazy-mcp.push",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        const text = typeof params?.text === "string" ? params.text.trim() : "";
        if (!text) {
          respond(false, { error: "text required" });
          return;
        }
        const oral = buildOralSummary(text);
        const trimmed = oral.trim();
        const inlineResult = isInlineable(trimmed) ? trimmed : undefined;
        const triggerWord = config.triggerWord;
        if (!inlineResult) {
          ensureRuntime().client.getQueue().enqueueNotification(oral);
        }

        const result = await pushWebhook(
          config.webhookUrl,
          {
            type: "tts",
            text: triggerWord,
            inline_result: inlineResult,
            has_queue: !inlineResult,
          },
          api.logger,
        );

        if (result.ok) {
          respond(true, { pushed: true, oral });
        } else {
          respond(false, { error: result.error });
        }
      },
    );

    // ------------------------------------------------------------------
    // Gateway method: mydazy-mcp.status — queue status
    // ------------------------------------------------------------------
    api.registerGatewayMethod(
      "mydazy-mcp.status",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          const rt = ensureRuntime();
          const queue = rt.client.getQueue();
          const taskId = typeof params?.taskId === "string" ? params.taskId : "";
          if (taskId) {
            const task = queue.get(taskId);
            respond(true, task ?? { found: false });
          } else {
            respond(true, { hasPending: queue.hasPending() });
          }
        } catch (err) {
          respond(false, { error: err instanceof Error ? err.message : String(err) });
        }
      },
    );
  },
};

export default mydazyMcpPlugin;
