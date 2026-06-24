import { describe, expect, it, vi } from "vitest";

vi.mock("@reader/storage-core", () => ({
  db: {
    aiUserConfigs: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@reader/ai-core", () => ({
  DEFAULT_AI_CONFIG: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-3.5-turbo",
    format: "openai",
  },
  decryptAIConfig: vi.fn(),
  encryptAIConfig: vi.fn(),
  generateDeviceFingerprint: vi.fn(() => "device"),
  hasAIConfig: vi.fn((config) => Boolean(config?.apiKey)),
}));

vi.mock("./api", () => ({
  apiUrl: vi.fn((path: string) => `http://127.0.0.1:4000${path}`),
}));

describe("isAIAvailable", () => {
  it("checks the configured backend api base url for server AI status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ available: true, source: "server" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { isAIAvailable } = await import("./ai-config");
    const status = await isAIAvailable();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/ai/status");
    expect(status).toEqual({ available: true, source: "server" });
  });
});
