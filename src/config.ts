import { z } from "zod";

const DeviceConfigSchema = z.object({
  id: z.string().min(1),
  webhookUrl: z.string().url(),
  /** Trigger word pushed to device when results are ready. Must be ≤10 chars. */
  triggerWord: z.string().min(1).max(10).default("小龙虾有结果了"),
  enabled: z.boolean().default(true),
});

export const MydazyMcpConfigSchema = z.object({
  /**
   * Xiaozhi hosted MCP relay WebSocket URL.
   * e.g. wss://api.xiaozhi.me/mcp/?token=<JWT>
   */
  mcpServerUrl: z.string().url(),

  /**
   * mydazy pushtts webhook URL.
   * e.g. http://www.mydazy.com/ota/pushtts?token=<token>
   */
  pushttsUrl: z.string().url(),

  /** Default OpenClaw agent to route tasks to */
  defaultAgent: z.string().default("main"),

  /** Registered xiaozhi / MCP-capable devices */
  devices: z.array(DeviceConfigSchema).default([]),

  /** Max queued result entries per device before old ones are dropped */
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
      label: "MCP Relay URL",
      help: "Xiaozhi hosted MCP WebSocket, e.g. wss://api.xiaozhi.me/mcp/?token=...",
      sensitive: true,
    },
    pushttsUrl: {
      label: "PushTTS Webhook URL",
      help: "mydazy push endpoint, e.g. http://www.mydazy.com/ota/pushtts?token=...",
      sensitive: true,
    },
    defaultAgent: {
      label: "Default Agent",
      help: "OpenClaw agent ID that handles tasks without an explicit agent param.",
    },
    "devices[].id": { label: "Device ID" },
    "devices[].webhookUrl": {
      label: "Device Webhook URL (legacy)",
      help: "Per-device push URL. Leave empty to use the global pushttsUrl.",
    },
    "devices[].triggerWord": {
      label: "Trigger Word (≤10 chars)",
      help: "Word TTS-spoken on device when results are ready, e.g. 小龙虾有结果了",
    },
    taskTimeoutMs: { label: "Task Timeout (ms)", advanced: true },
    maxQueueSize: { label: "Max Queue Size per Device", advanced: true },
    reconnectDelayMs: { label: "WS Reconnect Delay (ms)", advanced: true },
  },
};
