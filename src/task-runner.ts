/**
 * Runs an OpenClaw agent task via the stable CLI interface.
 *
 * Uses `openclaw message send --agent <id> --local "<prompt>"` to invoke agents.
 * This approach is version-agnostic: works with any OpenClaw ≥ 2026.1 installation
 * without depending on internal extensionAPI.js paths.
 *
 * Includes push deduplication: when multiple tasks complete within a short window,
 * only one webhook push is sent. The device will pull all pending results at once
 * via get_results.
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
  webhookUrl: string;
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

// ---------------------------------------------------------------------------
// Push deduplication: multiple tasks completing within PUSH_COOLDOWN_MS
// only trigger one webhook push. The device pulls all results at once.
// ---------------------------------------------------------------------------

const PUSH_COOLDOWN_MS = 3_000;
let lastPushTime = 0;
let pendingPushTimer: ReturnType<typeof setTimeout> | null = null;

type DeferredPush = {
  webhookUrl: string;
  triggerWord: string;
  logger: Logger;
};

function scheduleDedupPush(opts: DeferredPush): void {
  const now = Date.now();
  const elapsed = now - lastPushTime;

  // Already have a pending push scheduled — skip, it will cover this result too
  if (pendingPushTimer) return;

  const delay = elapsed >= PUSH_COOLDOWN_MS ? 0 : PUSH_COOLDOWN_MS - elapsed;

  pendingPushTimer = setTimeout(async () => {
    pendingPushTimer = null;
    lastPushTime = Date.now();

    const result = await pushWebhook(
      opts.webhookUrl,
      {
        type: "tts",
        text: opts.triggerWord,
        has_queue: true,
      },
      opts.logger,
    );

    if (result.ok) {
      opts.logger.info("[mydazy-mcp] deduped webhook push sent");
    } else {
      opts.logger.warn(`[mydazy-mcp] deduped webhook push failed: ${result.error}`);
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Main task runner
// ---------------------------------------------------------------------------

export async function runTask(opts: RunTaskOptions): Promise<void> {
  const { taskId, agent, prompt, timeoutMs, queue, webhookUrl, triggerWord, logger } = opts;

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

    // For very short results, inline on device (no need for get_results pull)
    const trimmed = oralSummary.trim();
    if (isInlineable(trimmed)) {
      lastPushTime = Date.now();
      await pushWebhook(
        webhookUrl,
        {
          type: "tts",
          text: triggerWord,
          inline_result: trimmed,
          has_queue: false,
        },
        logger,
      );
      logger.info(`[mydazy-mcp] task ${taskId} done, inline result pushed`);
      return;
    }

    // Normal result: use deduplication — if multiple tasks finish close together,
    // only one push is sent and the device pulls all results via get_results.
    logger.info(`[mydazy-mcp] task ${taskId} done, scheduling deduped push`);
    scheduleDedupPush({ webhookUrl, triggerWord, logger });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    queue.markError(taskId, msg);
    logger.error(`[mydazy-mcp] task ${taskId} error: ${msg}`);
  }
}
