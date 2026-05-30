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
  let ncxHref: string | null = null;
  let navHref: string | null = null;

  for (let i = 0; i < manifestItems.length; i++) {
    const item = manifestItems[i];
    if (!item) continue;
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type");
    const properties = item.getAttribute("properties");

    if (id && href) manifest[id] = href;
    if (href) {
      if (mediaType === "application/x-dtbncx+xml" || id === "ncx") {
        ncxHref = href;
      }
      if (properties === "nav") {
        navHref = href;
      }
    }
  }

  // Parse NCX / Nav ToC Map
  const tocMap: Record<string, string> = {};
  
  if (ncxHref) {
    try {
      const ncxPath = opfDir + ncxHref;
      const ncxFile = zip.file(ncxPath);
      if (ncxFile) {
        const ncxXml = await ncxFile.async("text");
        const ncxDoc = parser.parseFromString(ncxXml, "text/xml");
        const navPoints = ncxDoc.getElementsByTagName("navPoint");
        for (let i = 0; i < navPoints.length; i++) {
          const np = navPoints[i];
          if (!np) continue;
          const labelNode = np.getElementsByTagName("navLabel")[0]?.getElementsByTagName("text")[0];
          const contentNode = np.getElementsByTagName("content")[0];
          if (labelNode && contentNode) {
            const titleText = labelNode.textContent?.trim();
            const src = contentNode.getAttribute("src");
            if (titleText && src) {
              const cleanSrc = src.split("#")[0];
              if (cleanSrc) {
                const srcFilename = cleanSrc.includes("/") ? cleanSrc.substring(cleanSrc.lastIndexOf("/") + 1) : cleanSrc;
                tocMap[srcFilename] = titleText;
                tocMap[cleanSrc] = titleText;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse EPUB NCX catalog:", e);
    }
  }

  if (Object.keys(tocMap).length === 0 && navHref) {
    try {
      const navPath = opfDir + navHref;
      const navFile = zip.file(navPath);
      if (navFile) {
        const navHtml = await navFile.async("text");
        const navDoc = parser.parseFromString(navHtml, "text/xml");
        const aNodes = navDoc.getElementsByTagName("a");
        for (let i = 0; i < aNodes.length; i++) {
          const a = aNodes[i];
          if (!a) continue;
          const href = a.getAttribute("href");
          const labelText = a.textContent?.trim();
          if (href && labelText) {
            const cleanHref = href.split("#")[0];
            if (cleanHref) {
              const hrefFilename = cleanHref.includes("/") ? cleanHref.substring(cleanHref.lastIndexOf("/") + 1) : cleanHref;
              tocMap[hrefFilename] = labelText;
              tocMap[cleanHref] = labelText;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse EPUB3 Nav HTML catalog:", e);
    }
  }

  const spineItems = opfDoc.getElementsByTagNameNS("*", "itemref");
  const chapters: ParsedChapter[] = [];

  // 3. Read HTML content
  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    if (!item) continue;
    const idref = item.getAttribute("idref");
    if (!idref || !manifest[idref]) continue;

    const rawHref = manifest[idref];
    const chapterPath = opfDir + rawHref;
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

    const rawHrefFilename = rawHref.includes("/") ? rawHref.substring(rawHref.lastIndexOf("/") + 1) : rawHref;
    let chapterTitle = tocMap[rawHref] || tocMap[rawHrefFilename];

    if (!chapterTitle) {
      try {
        const chDoc = parser.parseFromString(rawHtml, "text/xml");
        const h1Node = chDoc.getElementsByTagName("h1")[0] || chDoc.getElementsByTagName("h2")[0];
        if (h1Node && h1Node.textContent?.trim()) {
          chapterTitle = h1Node.textContent.trim();
        } else {
          const titleNode = chDoc.getElementsByTagName("title")[0];
          if (titleNode && titleNode.textContent?.trim()) {
            chapterTitle = titleNode.textContent.trim();
          }
        }
      } catch {
        // Ignore parse error and keep undefined
      }
    }

    if (!chapterTitle) {
      chapterTitle = `Chapter ${i + 1}`;
    }

    chapters.push({
      index: i,
      title: chapterTitle,
      content: cleanHtml,
    });
  }

  return {
    title: title.replace(/\.[^/.]+$/, ""),
    chapters,
  };
}
