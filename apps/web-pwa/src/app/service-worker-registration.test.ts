import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("离线服务注册", () => {
  it("应在生产环境幂等注册根作用域的 Service Worker", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/ServiceWorkerRegistration.tsx"),
      "utf8",
    );

    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain('.getRegistration("/")');
    expect(source).toContain('register(SERVICE_WORKER_URL, { scope: "/" })');
    expect(source).toContain('const SERVICE_WORKER_URL = "/sw.js"');
  });
});
