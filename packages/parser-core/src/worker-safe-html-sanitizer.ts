import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const allowedTags = new Set([
  "html", "head", "body", "title",
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "br",
  "b", "i", "strong", "em", "u", "s", "sub", "sup", "img", "a",
  "blockquote", "pre", "code", "ul", "ol", "li", "table", "thead",
  "tbody", "tr", "td", "th", "hr", "dl", "dt", "dd",
]);

const dangerousTags = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "textarea", "select", "option", "link", "meta", "base", "svg", "math",
]);

const allowedAttributes = new Set(["src", "alt", "href", "title", "class", "id"]);

function isSafeUrl(value: string, attribute: "href" | "src") {
  const normalized = value.trim().replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("#") || normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) {
    return true;
  }
  if (attribute === "href" && (normalized.startsWith("http://") || normalized.startsWith("https://"))) return true;
  return attribute === "src" && /^data:image\/(?:png|gif|jpe?g|webp);base64,/.test(normalized);
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

export function sanitizeWorkerSafeHtml(rawHtml: string) {
  const document = new DOMParser({
    errorHandler: { warning: () => undefined, error: () => undefined, fatalError: () => undefined },
  }).parseFromString(rawHtml, "text/xml");
  const elements = Array.from(document.getElementsByTagName("*"));
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (!element?.parentNode) continue;
    const tag = element.tagName.toLowerCase().replace(/^.*:/, "");
    if (dangerousTags.has(tag)) {
      element.parentNode.removeChild(element);
      continue;
    }
    if (!allowedTags.has(tag)) {
      unwrapElement(element);
      continue;
    }
    for (let attributeIndex = element.attributes.length - 1; attributeIndex >= 0; attributeIndex -= 1) {
      const attribute = element.attributes.item(attributeIndex);
      if (!attribute) continue;
      const name = attribute.name.toLowerCase().replace(/^.*:/, "");
      if (
        !allowedAttributes.has(name) ||
        name.startsWith("on") ||
        ((name === "href" || name === "src") && !isSafeUrl(attribute.value, name))
      ) {
        element.removeAttributeNode(attribute);
      }
    }
  }
  return new XMLSerializer().serializeToString(document);
}
