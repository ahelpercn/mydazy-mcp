/**
 * Converts agent markdown output into a short, spoken-word oral summary.
 *
 * Rules:
 *  - Strip common markdown symbols (headers, bold, code fences, links)
 *  - Collapse whitespace
 *  - Truncate at a sentence boundary ≤ MAX_CHARS
 *  - Prepend a spoken prefix so the device reads naturally
 */

const MAX_CHARS = 120;

const ORAL_PREFIXES = ["好的，来汇报一下，", "收到，汇报进展：", "小龙虾来报告，"];

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
      .replace(/\n{2,}/g, " ")
      .replace(/\n/g, " ")
      // Collapse spaces
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/** Truncate at the last sentence-ending punctuation ≤ limit chars */
function truncateAtSentence(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  const chunk = text.slice(0, limit);
  // CJK and ASCII sentence endings
  const lastEnd = Math.max(
    chunk.lastIndexOf("。"),
    chunk.lastIndexOf("！"),
    chunk.lastIndexOf("？"),
    chunk.lastIndexOf("."),
    chunk.lastIndexOf("!"),
    chunk.lastIndexOf("?"),
  );
  if (lastEnd > 10) {
    return chunk.slice(0, lastEnd + 1);
  }
  // Fall back to word boundary or hard cut
  const lastSpace = chunk.lastIndexOf(" ");
  return lastSpace > 10 ? chunk.slice(0, lastSpace) : chunk;
}

/**
 * Build an oral summary from raw agent output.
 *
 * @param rawResult  Full agent markdown response
 * @param prefixIdx  Which spoken prefix to use (deterministic per taskId, optional)
 */
export function buildOralSummary(rawResult: string, prefixIdx = 0): string {
  const plain = stripMarkdown(rawResult);
  if (!plain) {
    return "完成了，没有更多内容。";
  }

  const prefix = ORAL_PREFIXES[prefixIdx % ORAL_PREFIXES.length]!;
  const budget = MAX_CHARS - prefix.length;
  const body = truncateAtSentence(plain, budget);
  return `${prefix}${body}`;
}

/** Quick helper: is text short enough to inline on the device (≤8 chars)? */
export function isInlineable(text: string): boolean {
  return text.trim().length <= 8;
}
