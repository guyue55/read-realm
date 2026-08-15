export function normalizePublicLibraryBrowserRelativePath(value: string) {
  const normalized = value.normalize("NFC");
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  if (
    normalized !== normalized.trim() ||
    normalized.length === 0 ||
    normalized.length > 1024 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.includes("\\") ||
    hasControlCharacter
  ) {
    return undefined;
  }
  const segments = normalized.split("/");
  const filename = segments.at(-1) ?? "";
  if (
    segments.length > 13 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment !== segment.trim() ||
        segment.length > 255,
    ) ||
    filename.length <= 4 ||
    !filename.toLocaleLowerCase("en-US").endsWith(".txt")
  ) {
    return undefined;
  }
  return segments.join("/");
}
