function detectBom(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return null;
}

export function detectAndDecode(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    const bomEncoding = detectBom(bytes);
    if (bomEncoding) {
      return new TextDecoder(bomEncoding).decode(buffer);
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder("gb18030").decode(buffer);
    }
  } catch {
    throw new Error("ENCODING_DETECT_FAILED");
  }
}
