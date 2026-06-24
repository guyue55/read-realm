function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReaderHtml(content: string): string {
  const hasHtmlParagraphs = /<p\b|<div\b/i.test(content);
  let idx = 0;

  if (!hasHtmlParagraphs) {
    return content
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return "";
        return `<p data-idx="${idx++}">${escapeHtml(trimmed)}</p>`;
      })
      .filter(Boolean)
      .join("");
  }

  return content.replace(/<p(\s[^>]*)?>/gi, (match, attrs = "") => {
    return `<p data-idx="${idx++}"${attrs}>`;
  });
}
