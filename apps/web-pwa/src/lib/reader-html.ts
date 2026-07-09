function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "LI",
  "OL",
  "P",
  "SPAN",
  "STRONG",
  "U",
  "UL",
]);

const ALLOWED_ATTRS = new Set(["class", "id", "title", "href"]);

function isSafeUrl(value: string) {
  if (!value.trim()) return false;
  try {
    const url = new URL(value, "https://reader.local");
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeWithDomParser(content: string) {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return null;
  }

  const doc = new window.DOMParser().parseFromString(
    `<template>${content}</template>`,
    "text/html",
  );
  const template = doc.querySelector("template");
  if (!template) return "";

  const walker = doc.createTreeWalker(
    template.content,
    window.NodeFilter.SHOW_ELEMENT,
  );
  const elements: Element[] = [];
  while (walker.nextNode()) elements.push(walker.currentNode as Element);

  for (const element of elements) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(doc.createTextNode(element.textContent || ""));
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_ATTRS.has(name) || name.startsWith("on")) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" && !isSafeUrl(attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
  }

  return template.innerHTML;
}

function sanitizeReaderHtml(content: string) {
  const parsed = sanitizeWithDomParser(content);
  if (parsed !== null) return parsed;

  return content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<\/?(?:object|embed|link|meta)[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "");
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

  return sanitizeReaderHtml(content).replace(
    /<(p|div)(\s[^>]*)?>/gi,
    (match, tag, attrs = "") =>
      `<${tag.toLowerCase()} data-idx="${idx++}"${attrs}>`,
  );
}
