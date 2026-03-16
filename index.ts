import type {
  GatewayRequestHandlerOptions,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk/mydazy-mcp";
import { MydazyMcpConfigSchema, mydazyMcpConfigSchema } from "./src/config.js";
import { McpClient } from "./src/mcp-client.js";
import { buildOralSummary, isInlineable } from "./src/result-narrator.js";
import { pushWebhook } from "./src/webhook-pusher.js";

type MydazyRuntime = {
  client: McpClient;
};

const mydazyMcpPlugin = {
  id: "mydazy-mcp",
  name: "MyDazy MCP",
  description:
    "Connect OpenClaw agents to xiaozhi-esp32 devices via the xiaozhi hosted MCP relay and push TTS notifications.",
  configSchema: mydazyMcpConfigSchema,

  register(api: OpenClawPluginApi) {
    const config = mydazyMcpConfigSchema.parse(api.pluginConfig);

    // Parse once to validate; will throw early if required fields are missing
    MydazyMcpConfigSchema.parse(config);

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
        const triggerWord = config.devices[0]?.triggerWord ?? "小龙虾有结果了";

        const result = await pushWebhook(
          config.pushttsUrl,
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
            const deviceId = typeof params?.deviceId === "string" ? params.deviceId : "broadcast";
            respond(true, { hasPending: queue.hasPending(deviceId) });
          }
        } catch (err) {
          respond(false, { error: err instanceof Error ? err.message : String(err) });
        }
      },
    );
  },
};

export default mydazyMcpPlugin;
