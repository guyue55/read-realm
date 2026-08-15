import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toastSource = readFileSync(
  new URL("./AppToast.tsx", import.meta.url),
  "utf8",
);
const stateSource = readFileSync(
  new URL("./StatePanel.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../../app/layout.tsx", import.meta.url),
  "utf8",
);
const offlineSource = readFileSync(
  new URL("../OfflineBadge.tsx", import.meta.url),
  "utf8",
);

describe("shared feedback contract", () => {
  it("keeps toasts above the mobile navigation and exposes one live region", () => {
    expect(toastSource).toContain(
      "bottom-[calc(88px+env(safe-area-inset-bottom))]",
    );
    expect(toastSource).toContain(
      'role={tone === "danger" ? "alert" : "status"}',
    );
    expect(toastSource).toContain(
      'aria-live={tone === "danger" ? "assertive" : "polite"}',
    );
    expect(toastSource).toContain("min-h-11 min-w-11");
    expect(toastSource).toContain("pointer-events-none flex max-w-xl");
    expect(toastSource).toContain("pointer-events-auto -mr-2");
    expect(toastSource).toContain("X");
    expect(toastSource).not.toMatch(/[🍃💡⚠️🌧️☁️🌀]/u);
    expect(layoutSource).toContain("<AppToastProvider>");
    expect(offlineSource).toContain("useAppToast");
    expect(offlineSource).not.toContain("<AppToast");
  });

  it("uses one state panel for loading, empty and error states", () => {
    expect(stateSource).toContain('kind: "loading" | "empty" | "error"');
    expect(stateSource).toContain(
      'role={kind === "error" ? "alert" : "status"}',
    );
    expect(stateSource).toContain("LoaderCircle");
    expect(stateSource).toContain("CircleAlert");
    expect(stateSource).toContain("Inbox");
    expect(stateSource).not.toContain("rounded-full");
  });
});
