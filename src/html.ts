/**
 * Archive text uses a deliberately small markup subset: `[label](https://…)`
 * links, `**bold**`, `*italic*` and `` `code` ``. Blank lines separate
 * paragraphs in block contexts. Everything else stays literal text.
 *
 * Mirrored by LINK_MARKUP and plainText() in scripts/archive-content.mjs, which
 * renders the same markup as plain text for the downloadable files; change both
 * together. check-content.mjs exercises both renderers on the same samples.
 */
// `*` and a backtick are excluded from the target so emphasis can never reach
// into a URL.
const LINK_MARKUP = /\[([^\]\n]+)\]\((https?:\/\/[^\s)*`]+)\)/g;
const CODE_SPAN = /`([^`\n]+)`/g;
const BOLD = /\*\*([^*\n]+)\*\*/g;
const ITALIC = /\*([^*\n]+)\*/g;

/** Archive fields are plain text, including inside HTML attributes. */
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/**
 * Escapes the value first, so malformed or hostile text can never become
 * markup; only the recognised syntax is then turned into elements. Code spans
 * are lifted out first so their contents stay literal, and restored last.
 */
function inline(value: string) {
  const code: string[] = [];
  let out = value.replace(CODE_SPAN, (_, span: string) => {
    code.push(span);
    return `\u0000${code.length - 1}\u0000`;
  });
  out = out
    .replace(BOLD, "<strong>$1</strong>")
    .replace(ITALIC, "<em>$1</em>")
    .replace(
      LINK_MARKUP,
      (_, label: string, url: string) =>
        `<a href="${url}" target="_blank" rel="noopener">${label}</a>`,
    );
  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => {
    return `<code>${code[Number(index)]}</code>`;
  });
}

/** Inline markup only, for text that already sits inside its own element. */
export function richText(value: string) {
  return inline(escapeHtml(value)).replace(/\n/g, "<br />");
}

/** Block markup: a blank line starts a new paragraph, a newline is a break. */
export function richBlocks(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => `<p>${inline(escapeHtml(block)).replace(/\n/g, "<br />")}</p>`)
    .join("");
}
