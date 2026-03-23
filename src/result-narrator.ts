/**
 * Converts agent markdown output into clean plain text for device TTS.
 *
 * Strategy: strip markdown formatting so the device-side LLM can understand
 * the full content and narrate it naturally. No truncation — let the device
 * LLM decide what to emphasize and how to summarize.
 */

/** Strip markdown and flatten to plain text */
function stripMarkdown(text: string): string {
  return (
    text
      // Code fences
      .replace(/```[\s\S]*?```/g, "")
      // Inline code
      .replace(/`[^`]*`/g, "")
      // Headers
      .replace(/^#{1,6}\s+/gm, "")
      // Bold / italic
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
      // Markdown links: [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Bare URLs
      .replace(/https?:\/\/\S+/g, "")
      // HTML tags
      .replace(/<[^>]+>/g, "")
      // Leading bullets / numbering
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      // Extra blank lines
      .replace(/\n{2,}/g, "\n")
      // Collapse spaces (but keep single newlines for readability)
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

/**
 * Build a clean text version of the agent result for device TTS.
 *
 * The device-side LLM will receive this full text and narrate it
 * in its own conversational style — no artificial truncation or prefixes.
 *
 * @param rawResult  Full agent markdown response
 */
export function buildOralSummary(rawResult: string): string {
  const plain = stripMarkdown(rawResult);
  if (!plain) {
    return "任务完成，没有更多内容。";
  }
  return plain;
}

/** Quick helper: is text short enough to inline on the device (≤8 chars)? */
export function isInlineable(text: string): boolean {
  return text.trim().length <= 8;
}
