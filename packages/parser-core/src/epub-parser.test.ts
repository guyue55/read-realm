import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseEpubBook } from "./epub-parser";

async function fixedEpub(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" /></rootfiles>
</container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>固定 EPUB</dc:title></metadata>
  <manifest>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml" />
    <item id="c2" href="chapter-2.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine><itemref idref="c1" /><itemref idref="c2" /></spine>
</package>`,
  );
  zip.file(
    "OEBPS/chapter-1.xhtml",
    `<html><head><title>第一章</title></head><body>
      <h1 onclick="steal()">第一章</h1><p>清晨，林舟。</p>
      <script>window.stolen = true</script>
      <a href="javascript:steal()">危险链接</a>
    </body></html>`,
  );
  zip.file(
    "OEBPS/chapter-2.xhtml",
    `<html><head><title>第二章</title></head><body><h1>第二章</h1><p>傍晚，林舟。</p></body></html>`,
  );
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
  });
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

describe("epub parser", () => {
  it("parses a fixed two-chapter EPUB without retaining executable markup", async () => {
    const parsed = await parseEpubBook("fixed.epub", await fixedEpub());

    expect(parsed.title).toBe("固定 EPUB");
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters.map((chapter) => chapter.title)).toEqual([
      "第一章",
      "第二章",
    ]);
    expect(parsed.chapters[0]?.content).toContain("清晨，林舟。");
    expect(parsed.chapters[1]?.content).toContain("傍晚，林舟。");
    expect(parsed.chapters[0]?.content).not.toMatch(/script|onclick|javascript:/i);
  });
});
