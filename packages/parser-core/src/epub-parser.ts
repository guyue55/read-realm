import JSZip from "jszip";
import DOMPurify from "isomorphic-dompurify";
import { DOMParser } from "@xmldom/xmldom";
import type { ParsedBook, ParsedChapter } from "./txt-parser";

export async function parseEpubBook(
  filename: string,
  buffer: ArrayBuffer,
): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Find container.xml to get rootfile (OPF)
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile)
    throw new Error("Invalid EPUB: Missing META-INF/container.xml");

  const containerXml = await containerFile.async("text");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "text/xml");
  const rootfile = containerDoc.getElementsByTagName("rootfile")[0];
  if (!rootfile) throw new Error("Invalid EPUB: No rootfile in container.xml");

  const opfPath = rootfile.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: rootfile missing full-path");

  const opfDir = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // 2. Parse OPF
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error("Invalid EPUB: OPF file not found");
  const opfXml = await opfFile.async("text");
  const opfDoc = parser.parseFromString(opfXml, "text/xml");

  // Extract Title
  const titleNode = opfDoc.getElementsByTagNameNS("*", "title")[0];
  const title = titleNode ? titleNode.textContent || filename : filename;

  // Extract Manifest & Spine
  const manifestItems = opfDoc.getElementsByTagNameNS("*", "item");
  const manifest: Record<string, string> = {};
  for (let i = 0; i < manifestItems.length; i++) {
    const item = manifestItems[i];
    if (!item) continue;
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest[id] = href;
  }

  const spineItems = opfDoc.getElementsByTagNameNS("*", "itemref");
  const chapters: ParsedChapter[] = [];

  // 3. Read HTML content
  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    if (!item) continue;
    const idref = item.getAttribute("idref");
    if (!idref || !manifest[idref]) continue;

    const chapterPath = opfDir + manifest[idref];
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) continue;

    const rawHtml = await chapterFile.async("text");

    // 4. Sanitize HTML
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "div",
        "span",
        "br",
        "b",
        "i",
        "strong",
        "em",
      ],
      ALLOWED_ATTR: [],
    });

    chapters.push({
      index: i,
      title: `Chapter ${i + 1}`, // Fallback title, proper ToC parsing is deferred to P1
      content: cleanHtml,
    });
  }

  return {
    title: title.replace(/\.[^/.]+$/, ""),
    chapters,
  };
}
