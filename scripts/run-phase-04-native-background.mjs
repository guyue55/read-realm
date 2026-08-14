#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(
  repoRoot,
  "apps/web-pwa/node_modules/@playwright/test",
));
const origin = process.env.PHASE04_ORIGIN ?? "http://127.0.0.1:3104";
const chromePath = process.env.PHASE04_CHROME_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const bookId = "phase04-native-background-book";
const visibilityKey = "phase04-native-background-observation";

async function reservePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error("NATIVE_BACKGROUND_DEBUG_PORT_UNAVAILABLE");
  return port;
}

async function waitForEndpoint(endpoint) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("NATIVE_BACKGROUND_CHROME_ENDPOINT_TIMEOUT");
}

async function withBrowserCdp(endpoint, callback) {
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = ++nextId;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(`${method}:${JSON.stringify(message.error)}`));
      else resolvePromise(message.result);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
  try {
    return await callback(send);
  } finally {
    socket.close();
  }
}

async function setReaderWindowState(endpoint, windowState) {
  return withBrowserCdp(endpoint, async (send) => {
    const targets = await send("Target.getTargets");
    const target = targets.targetInfos.find((candidate) => (
      candidate.type === "page" && candidate.url.includes(`#/reader/${bookId}`)
    ));
    if (!target) throw new Error("NATIVE_BACKGROUND_READER_TARGET_NOT_FOUND");
    const window = await send("Browser.getWindowForTarget", { targetId: target.targetId });
    await send("Browser.setWindowBounds", {
      windowId: window.windowId,
      bounds: { windowState },
    });
    let confirmed = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      confirmed = await send("Browser.getWindowBounds", { windowId: window.windowId });
      if (confirmed.bounds.windowState === windowState) break;
      await delay(100);
    }
    if (confirmed?.bounds.windowState !== windowState) {
      throw new Error(
        `NATIVE_BACKGROUND_WINDOW_STATE_NOT_CONFIRMED:${windowState}:${confirmed?.bounds.windowState}`,
      );
    }
    return { windowId: window.windowId, windowState: confirmed.bounds.windowState };
  });
}

async function prepareReader(debugPort) {
  const stage = (name) => process.stderr.write(`NATIVE_BACKGROUND_PREPARE_STAGE=${name}\n`);
  const endpoint = `http://127.0.0.1:${debugPort}`;
  stage("connect");
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  let page = context.pages().find((candidate) => candidate.url().startsWith(origin));
  if (!page) page = context.pages()[0] ?? await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  stage("seed");
  await page.goto(`${origin}/#/library`);
  await page.evaluate(async ({ targetBookId }) => {
    localStorage.setItem("reader-settings", JSON.stringify({
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "pagination",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    }));
    const database = await new Promise((resolvePromise, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolvePromise(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolvePromise, reject) => {
      const transaction = database.transaction(
        ["books", "chapters", "progress", "bookmarks"],
        "readwrite",
      );
      for (const name of ["books", "chapters", "progress", "bookmarks"]) {
        transaction.objectStore(name).clear();
      }
      const now = "2026-08-15T00:00:00.000Z";
      transaction.objectStore("books").put({
        id: targetBookId,
        title: "真实后台恢复纵切",
        sourceType: "upload",
        format: "txt",
        status: "reading",
        tags: [],
        chapterCount: 1,
        toc: [{ index: 0, title: "后台第一章" }],
        parseStatus: "parsed",
        cacheStatus: "chapters_full",
        sourceAvailability: "full_cached",
        createdAt: now,
        updatedAt: now,
      });
      transaction.objectStore("chapters").put({
        id: `${targetBookId}-chapter-0`,
        bookId: targetBookId,
        index: 0,
        title: "后台第一章",
        content: `后台开篇锚点 ${"可复算的安静阅读正文。".repeat(1_200)} 后台收束锚点`,
      });
      transaction.objectStore("progress").put({
        bookId: targetBookId,
        chapterId: `${targetBookId}-chapter-0`,
        chapterIndex: 0,
        offset: 0,
        paragraphIndex: 0,
        characterOffset: 0,
        percentage: 0,
        updatedAt: now,
      });
      transaction.oncomplete = resolvePromise;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { targetBookId: bookId });
  await page.goto(`${origin}/#/reader/${bookId}`);
  await page.getByRole("heading", { name: "后台第一章" }).waitFor({ timeout: 15_000 });
  await page.locator("[data-page-indicator]:visible").waitFor({ timeout: 15_000 });
  stage("reader-ready");
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });

  await page.evaluate(async ({ targetBookId, observationKey }) => {
    const record = (source, extra = {}) => {
      const samples = JSON.parse(localStorage.getItem(observationKey) || "[]");
      samples.push({
        source,
        state: document.visibilityState,
        hidden: document.hidden,
        focus: document.hasFocus(),
        wall: Date.now(),
        ...extra,
      });
      localStorage.setItem(observationKey, JSON.stringify(samples));
    };
    localStorage.removeItem(observationKey);
    record("reader-ready");

    const lockDatabase = await new Promise((resolvePromise, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolvePromise(request.result);
      request.onerror = () => reject(request.error);
    });
    const lockTransaction = lockDatabase.transaction("progress", "readwrite");
    const store = lockTransaction.objectStore("progress");
    let hold = true;
    const keepAlive = () => {
      const request = store.get(targetBookId);
      request.onsuccess = () => {
        if (hold) keepAlive();
      };
    };
    keepAlive();
    lockTransaction.oncomplete = () => {
      lockDatabase.close();
      record("progress-lock-released");
    };

    const readPersistedProgress = async () => {
      const database = await new Promise((resolvePromise, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onsuccess = () => resolvePromise(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolvePromise, reject) => {
          const request = database.transaction("progress", "readonly")
            .objectStore("progress").get(targetBookId);
          request.onsuccess = () => resolvePromise(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    };
    const observePersistedProgress = async () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const progress = await readPersistedProgress();
        if ((progress?.characterOffset ?? 0) > 0) {
          record("progress-persisted", {
            chapterIndex: progress.chapterIndex,
            paragraphIndex: progress.paragraphIndex,
            characterOffset: progress.characterOffset,
          });
          return;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      record("progress-persist-timeout");
    };
    document.addEventListener("visibilitychange", () => {
      record("visibilitychange");
      if (document.visibilityState === "hidden") {
        hold = false;
        void observePersistedProgress();
      }
    });
  }, { targetBookId: bookId, observationKey: visibilityKey });

  stage("progress-locked");
  const nextPage = page.locator('button[aria-label="下一页"]:visible').first();
  await nextPage.click();
  await page.locator("[data-page-indicator]:visible").filter({ hasText: "2 /" })
    .waitFor({ timeout: 5_000 });
  const targetAnchor = await page.locator("[data-page-index]:visible").evaluateAll((nodes) => {
    const active = nodes.find((node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.left >= -2 && bounds.left < window.innerWidth;
    });
    if (!active) throw new Error("NATIVE_BACKGROUND_TARGET_PAGE_NOT_VISIBLE");
    return {
      chapterIndex: 0,
      paragraphIndex: Number(active.getAttribute("data-start-paragraph") ?? 0),
      characterOffset: Number(active.getAttribute("data-start-character") ?? 0),
    };
  });
  if (targetAnchor.characterOffset <= 0) {
    throw new Error("NATIVE_BACKGROUND_TARGET_ANCHOR_NOT_ADVANCED");
  }
  stage("anchor-advanced");
  process.stdout.write(`PHASE04_NATIVE_PREPARED=${JSON.stringify({ targetAnchor })}\n`);
  process.exit(0);
}

async function readRestoredObservation(endpoint) {
  const browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes(`#/reader/${bookId}`));
  if (!page) throw new Error("NATIVE_BACKGROUND_READER_PAGE_MISSING_AFTER_RESTORE");
  const result = await page.evaluate(async ({ targetBookId, observationKey }) => {
    let progress = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const database = await new Promise((resolvePromise, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onsuccess = () => resolvePromise(request.result);
        request.onerror = () => reject(request.error);
      });
      progress = await new Promise((resolvePromise, reject) => {
        const request = database.transaction("progress", "readonly")
          .objectStore("progress").get(targetBookId);
        request.onsuccess = () => resolvePromise(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      if ((progress?.characterOffset ?? 0) > 0) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
    const visiblePages = [...document.querySelectorAll("[data-page-index]")]
      .filter((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.left >= -2 && bounds.left < window.innerWidth;
      })
      .map((node) => ({
        start: Number(node.getAttribute("data-start-character") ?? 0),
        end: Number(node.getAttribute("data-end-character") ?? 0),
      }));
    return {
      route: location.hash,
      heading: document.querySelector("h1")?.textContent ?? null,
      state: document.visibilityState,
      samples: JSON.parse(localStorage.getItem(observationKey) || "[]"),
      progress,
      visiblePages,
    };
  }, { targetBookId: bookId, observationKey: visibilityKey });
  await browser.close();
  return result;
}

async function runNativeBackground() {
  if (process.platform !== "darwin") throw new Error("NATIVE_BACKGROUND_REQUIRES_DARWIN");
  if (!existsSync(chromePath)) throw new Error("NATIVE_BACKGROUND_CHROME_NOT_FOUND");
  const debugPort = await reservePort();
  const endpoint = `http://127.0.0.1:${debugPort}`;
  const profile = mkdtempSync(join(tmpdir(), "phase04-native-background-"));
  const chrome = spawn(chromePath, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    `${origin}/#/library`,
  ], { detached: true, stdio: "ignore" });
  try {
    await waitForEndpoint(endpoint);
    const prepare = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--prepare", String(debugPort)], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60_000,
    });
    const preparedLine = prepare.stdout.split(/\r?\n/)
      .find((line) => line.startsWith("PHASE04_NATIVE_PREPARED="));
    if (prepare.status !== 0 || !preparedLine) {
      throw new Error(`NATIVE_BACKGROUND_PREPARE_FAILED:${prepare.status}:${prepare.stdout}:${prepare.stderr}`);
    }
    const prepared = JSON.parse(preparedLine.slice("PHASE04_NATIVE_PREPARED=".length));
    const minimizeRequestedAt = Date.now();
    const minimized = await setReaderWindowState(endpoint, "minimized");
    await delay(1_200);
    const restoreRequestedAt = Date.now();
    const restored = await setReaderWindowState(endpoint, "normal");
    await delay(800);
    const observation = await readRestoredObservation(endpoint);
    const visibilityEvents = observation.samples.filter((sample) => (
      sample.source === "reader-ready" || sample.source === "visibilitychange"
    ));
    const visibilitySequence = visibilityEvents.map((sample) => sample.state);
    const hiddenEvent = visibilityEvents.find((sample) => sample.state === "hidden");
    const visibleEvent = visibilityEvents.find((sample, index) => (
      index > 0 && sample.state === "visible"
    ));
    const persistedSample = observation.samples.find((sample) => (
      sample.source === "progress-persisted"
    ));
    const progress = observation.progress;
    const semanticAnchorVisible = observation.visiblePages.some(({ start, end }) => (
      start <= progress.characterOffset && progress.characterOffset < end
    ));
    const sample = {
      scenario: "native-background",
      platform: process.platform,
      detachedDuringBackground: true,
      windowStateSequence: ["normal", minimized.windowState, restored.windowState],
      visibilitySequence,
      progressFlushedWhileHidden: Boolean(
        persistedSample
        && persistedSample.state === "hidden"
        && persistedSample.characterOffset === progress.characterOffset
        && progress.characterOffset >= prepared.targetAnchor.characterOffset
      ),
      semanticAnchorVisible,
      restoreMs: visibleEvent ? visibleEvent.wall - restoreRequestedAt : null,
      hiddenObservedAfterMs: hiddenEvent ? hiddenEvent.wall - minimizeRequestedAt : null,
      chapterIndex: progress.chapterIndex,
      paragraphIndex: progress.paragraphIndex,
      characterOffset: progress.characterOffset,
    };
    process.stdout.write(`PHASE04_READER_SAMPLE=${JSON.stringify(sample)}\n`);
  } finally {
    if (chrome.pid) {
      try { process.kill(-chrome.pid, "SIGTERM"); } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
      await delay(500);
      try { process.kill(-chrome.pid, "SIGKILL"); } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
    rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--prepare") {
  await prepareReader(Number(process.argv[3]));
} else {
  await runNativeBackground();
}
