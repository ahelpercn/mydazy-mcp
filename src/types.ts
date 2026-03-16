// Core types for mydazy-mcp extension.

export type TaskStatus = "pending" | "running" | "done" | "error";

export type Task = {
  id: string;
  agent: string;
  prompt: string;
  status: TaskStatus;
  /** Intermediate progress lines accumulated during agent execution */
  progress: string[];
  /** Raw agent result (may contain markdown) */
  result?: string;
  /** Oral-formatted result ready for device TTS */
  oralSummary?: string;
  createdAt: number;
  startedAt?: number;
  doneAt?: number;
  /** Which device originated this task (for routing result back) */
  sourceDevice?: string;
  errorMessage?: string;
};

export type QueueEntry = {
  taskId: string;
  /** Pre-formatted oral text for device TTS */
  oralText: string;
  /** Short inline result (≤8 chars) — device plays this directly without pulling MCP */
  inlineResult?: string;
  priority: "normal" | "urgent";
  enqueuedAt: number;
};

/** Shape of the webhook body sent to xiaozhi devices */
export type DeviceWebhookPayload = {
  type: "tts";
  /** ≤10 chars trigger word, e.g. "小龙虾有结果了" */
  text: string;
  /** Present when result ≤8 chars — device plays this and skips get_results */
  inline_result?: string;
  /** true = device should call MCP get_results to fetch full oral summary */
  has_queue: boolean;
};

export type DeviceConfig = {
  id: string;
  webhookUrl: string;
  /** ≤10 chars, e.g. "小龙虾有结果了" */
  triggerWord: string;
  enabled: boolean;
};
