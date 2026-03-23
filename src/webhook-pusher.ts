/**
 * Fires the mydazy webhook to notify a device that results are ready.
 *
 * Payload schema:
 *   { type: "tts", text: "小龙虾有结果了", inline_result?: string, has_queue: boolean }
 *
 * - text          ≤10 chars trigger word the device will speak
 * - inline_result present when the full result fits in ≤8 chars (device speaks directly)
 * - has_queue     true = device should call MCP get_results for the full summary
 */

import type { DeviceWebhookPayload } from "./types";

export type PushResult = { ok: true } | { ok: false; error: string };

export async function pushWebhook(
  url: string,
  payload: DeviceWebhookPayload,
  logger?: { warn(msg: string): void },
): Promise<PushResult> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const bodyText = await resp.text().catch(() => "");
    if (!resp.ok) {
      const err = `HTTP ${resp.status}: ${bodyText.slice(0, 120)}`;
      logger?.warn(`[mydazy-mcp] webhook push failed: ${err}`);
      return { ok: false, error: err };
    }
    // API returns HTTP 200 even for business errors; check code field
    try {
      const json = JSON.parse(bodyText) as { code?: number; msg?: string };
      if (json.code !== undefined && json.code !== 200) {
        const err = json.msg ?? `code ${json.code}`;
        logger?.warn(`[mydazy-mcp] webhook push rejected: ${err}`);
        return { ok: false, error: err };
      }
    } catch {
      // non-JSON body — treat HTTP 200 as success
    }
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger?.warn(`[mydazy-mcp] webhook push error: ${err}`);
    return { ok: false, error: err };
  }
}
