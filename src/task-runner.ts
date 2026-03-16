/**
 * Runs an OpenClaw agent task and feeds progress + result back into the TaskQueue.
 * Triggers the pushtts webhook only when the task produces real content.
 */

import { randomUUID } from "node:crypto";
import type { CoreConfig } from "./core-bridge.js";
import { loadCoreAgentDeps } from "./core-bridge.js";
import { buildOralSummary, isInlineable } from "./result-narrator.js";
import type { TaskQueue } from "./task-queue.js";
import { pushWebhook } from "./webhook-pusher.js";

type Logger = {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
};

export type RunTaskOptions = {
  taskId: string;
  agent: string;
  prompt: string;
  timeoutMs: number;
  coreConfig: CoreConfig;
  queue: TaskQueue;
  pushttsUrl: string;
  triggerWord: string;
  logger: Logger;
};

export async function runTask(opts: RunTaskOptions): Promise<void> {
  const { taskId, agent, prompt, timeoutMs, coreConfig, queue, pushttsUrl, triggerWord, logger } =
    opts;

  queue.markRunning(taskId);
  queue.appendProgress(taskId, `任务开始：agent=${agent}`);

  try {
    const core = await loadCoreAgentDeps();
    const agentDir = core.resolveAgentDir(coreConfig, agent);
    const workspaceDir = core.resolveAgentWorkspaceDir(coreConfig, agent);
    await core.ensureAgentWorkspace({ dir: workspaceDir });

    const storePath = core.resolveStorePath(coreConfig.session?.store, { agentId: agent });
    const store = core.loadSessionStore(storePath);

    const sessionId = `mydazy-${taskId.slice(0, 8)}`;
    const sessionFile = core.resolveSessionFilePath(sessionId, store, { agentId: agent });
    const runId = randomUUID();

    queue.appendProgress(taskId, `调用 agent: ${agent}`);

    const result = await core.runEmbeddedPiAgent({
      sessionId,
      sessionFile,
      workspaceDir,
      config: coreConfig,
      prompt,
      timeoutMs,
      runId,
      agentDir,
      lane: "mydazy-mcp",
    });

    if (result.meta?.aborted) {
      queue.markError(taskId, "agent run was aborted");
      logger.warn(`[mydazy-mcp] task ${taskId} aborted`);
      return;
    }

    // Collect text from all non-error payloads
    const rawText = (result.payloads ?? [])
      .filter((p) => !p.isError && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
      .trim();

    const oralSummary = buildOralSummary(rawText || "任务完成，无详细内容。");

    // Mark done — pushes to queue slot
    queue.markDone(taskId, rawText, oralSummary);
    queue.appendProgress(taskId, "任务完成，结果已入队");

    // Only push notification when the agent produced actual content.
    if (!rawText) {
      logger.info(`[mydazy-mcp] task ${taskId} done but no result content, skipping push`);
      return;
    }

    const trimmed = oralSummary.trim();
    const inlineResult = isInlineable(trimmed) ? trimmed : undefined;

    await pushWebhook(
      pushttsUrl,
      {
        type: "tts",
        text: triggerWord,
        inline_result: inlineResult,
        has_queue: !inlineResult,
      },
      logger,
    );

    logger.info(`[mydazy-mcp] task ${taskId} done, webhook pushed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    queue.markError(taskId, msg);
    logger.error(`[mydazy-mcp] task ${taskId} error: ${msg}`);
  }
}
