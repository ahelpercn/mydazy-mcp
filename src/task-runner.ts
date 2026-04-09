/**
 * Runs an OpenClaw agent task via the stable CLI interface.
 *
 * Uses `openclaw agent --agent <id> --local --message "<prompt>"` to invoke agents.
 * This approach is version-agnostic: works with any OpenClaw ≥ 2026.1 installation
 * without depending on internal extensionAPI.js paths.
 *
 * Each voice task uses its own explicit session id so it does not contend with
 * the user's main chat session or concurrent gateway activity.
 *
 * Includes push deduplication: when multiple tasks complete within a short window,
 * only one webhook push is sent. The device will pull all pending results at once
 * via get_results.
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { buildOralSummary, isInlineable } from "./result-narrator";
import type { TaskQueue } from "./task-queue";
import { pushWebhook } from "./webhook-pusher";

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

const isWin = process.platform === "win32";

/** Safely shell-escape a single argument (platform-aware) */
function shellEscape(str: string): string {
  if (isWin) {
    // Windows cmd: double-quote wrapping, escape internal quotes and special chars
    const escaped = str
      .replace(/"/g, '\\"')
      .replace(/%/g, "%%")     // % is variable expansion in cmd
      .replace(/!/g, "^^!");   // ! is expansion in delayed mode
    return '"' + escaped + '"';
  }
  // Unix: single-quote wrapping
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function buildTaskSessionId(taskId: string): string {
  return `mydazy-task-${taskId}`;
}

/**
 * Resolve the openclaw binary path.
 * Checks OPENCLAW_BIN env first, then common install locations.
 */
function resolveOpenClawBin(): string {
  if (process.env.OPENCLAW_BIN?.trim()) return process.env.OPENCLAW_BIN.trim();

  const home = process.env.HOME || process.env.USERPROFILE || "";
  const binName = isWin ? "openclaw.cmd" : "openclaw";

  // Derive from the same node that runs the gateway
  const nodeBinDir = process.execPath ? dirname(process.execPath) : "";
  const candidates: string[] = [
    nodeBinDir ? join(nodeBinDir, binName) : "",
  ];

  if (isWin) {
    // Windows common paths (npm global uses .cmd, official installer uses .exe)
    candidates.push(
      join(home, "AppData", "Roaming", "npm", binName),
      join(home, "AppData", "Local", "pnpm", binName),
      join(home, ".local", "bin", "openclaw.exe"),
      join(home, ".local", "bin", "openclaw.cmd"),
    );
  } else {
    // macOS / Linux common paths
    candidates.push(
      "/opt/homebrew/bin/openclaw",
      "/usr/local/bin/openclaw",
      join(home, ".npm-global", "bin", "openclaw"),
      join(home, "Library", "pnpm", "openclaw"),
      join(home, ".local", "bin", "openclaw"),
    );
  }

  for (const candidate of candidates.filter(Boolean)) {
    if (existsSync(candidate)) return candidate;
  }
  return isWin ? "openclaw.cmd" : "openclaw";
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
    const sessionId = buildTaskSessionId(taskId);

    // `openclaw agent --local` executes a single embedded agent turn
    // and writes the final reply to stdout.
    const cmd = `${bin} agent --agent ${shellEscape(agent)} --session-id ${shellEscape(sessionId)} --local --message ${escapedPrompt}`;

    logger.info(`[mydazy-mcp] running: openclaw agent --agent ${agent}`);
    queue.appendProgress(taskId, `调用 agent: ${agent} (session=${sessionId})`);

    // Ensure the child process can find node (critical for LaunchAgent/daemon
    // environments where nvm/nvm-windows is not in PATH).
    const nodeBinDir = process.execPath ? dirname(process.execPath) : "";
    const childEnv = { ...process.env };
    const pathSep = isWin ? ";" : ":";
    if (nodeBinDir && !childEnv.PATH?.includes(nodeBinDir)) {
      childEnv.PATH = `${nodeBinDir}${pathSep}${childEnv.PATH ?? ""}`;
    }

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: childEnv,
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
    await pushWebhook(
      webhookUrl,
      {
        type: "tts",
        text: "任务失败了",
        has_queue: false,
      },
      logger,
    ).catch(() => {});
  }
}
