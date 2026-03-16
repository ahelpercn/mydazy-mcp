/**
 * Runs an OpenClaw agent task via the stable CLI interface.
 *
 * Uses `openclaw message send --agent <id> --local "<prompt>"` to invoke agents.
 * This approach is version-agnostic: works with any OpenClaw ≥ 2026.1 installation
 * without depending on internal extensionAPI.js paths.
 *
 * Triggers the pushtts webhook only when the task produces real content.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { buildOralSummary, isInlineable } from "./result-narrator.js";
import type { TaskQueue } from "./task-queue.js";
import { pushWebhook } from "./webhook-pusher.js";

const execAsync = promisify(exec);

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
  queue: TaskQueue;
  pushttsUrl: string;
  triggerWord: string;
  logger: Logger;
};

/** Safely shell-escape a single argument by wrapping in single quotes */
function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Resolve the openclaw binary path.
 * Checks OPENCLAW_BIN env first, then common install locations.
 */
function resolveOpenClawBin(): string {
  if (process.env.OPENCLAW_BIN?.trim()) return process.env.OPENCLAW_BIN.trim();
  // Common global install paths (npm / Homebrew / pnpm)
  const candidates = [
    "/opt/homebrew/bin/openclaw",
    "/usr/local/bin/openclaw",
    `${process.env.HOME}/.npm-global/bin/openclaw`,
    `${process.env.HOME}/Library/pnpm/openclaw`,
    "openclaw", // fallback: rely on PATH
  ];
  // Return first existing path (simple stat check avoided for startup speed)
  return candidates[0]; // openclaw gateway already ran us, so Homebrew path is correct on Mac
}

export async function runTask(opts: RunTaskOptions): Promise<void> {
  const { taskId, agent, prompt, timeoutMs, queue, pushttsUrl, triggerWord, logger } = opts;

  queue.markRunning(taskId);
  queue.appendProgress(taskId, `任务开始：agent=${agent}`);

  try {
    const bin = resolveOpenClawBin();
    const escapedPrompt = shellEscape(prompt);

    // `openclaw message send --agent <id> --local` runs the agent in-process
    // and writes the final reply to stdout. Stable across OpenClaw versions.
    const cmd = `${bin} message send --agent ${shellEscape(agent)} --local ${escapedPrompt}`;

    logger.info(`[mydazy-mcp] running: openclaw message send --agent ${agent}`);
    queue.appendProgress(taskId, `调用 agent: ${agent}`);

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: { ...process.env },
    });

    if (stderr?.trim()) {
      logger.warn(`[mydazy-mcp] agent stderr: ${stderr.trim().slice(0, 200)}`);
    }

    const rawText = stdout.trim();
    const oralSummary = buildOralSummary(rawText || "任务完成，无详细内容。");

    queue.markDone(taskId, rawText, oralSummary);
    queue.appendProgress(taskId, "任务完成，结果已入队");

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
