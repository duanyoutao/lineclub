/**
 * Findings may embed `[label](https://…)` links. Mirrored by LINK_MARKUP in
 * scripts/archive-content.mjs, which renders the same markup as plain text for
 * the downloadable files; change both together.
 */
const LINK_MARKUP = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

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
 * Escapes archive text, then turns `[label](https://…)` into a link. Everything
 * that is not a valid http(s) link in that exact form stays literal text, so a
 * record can never inject markup or a `javascript:` target.
 */
export function richText(value: string) {
  return escapeHtml(value).replace(
    LINK_MARKUP,
    (_, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener">${label}</a>`,
  );
}
