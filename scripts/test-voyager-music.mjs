import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const dataDir = path.resolve(".local", `voyager-music-${Date.now()}`);
const output = path.resolve("test-results/voyager-music");
await mkdir(dataDir, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(
  path.join(dataDir, "presentation.json"),
  JSON.stringify({
    settings: { music: true, musicVolume: 0.5, startupSound: false, trailers: false, motion: "reduced" },
    games: {},
  }),
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: dataDir,
  VOYAGER_TEST_NO_TRAILER_FETCH: "1",
  WATERCONSOLE_DISABLE_NATIVE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: electronPath, args: ["."], env, timeout: 35000 });
const checks = [], errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", e => errors.push(e.message));
  const track = name => page.locator(`audio[data-track="${name}"]`);
  const read = name => track(name).evaluate(a => ({ time: a.currentTime, duration: a.duration, paused: a.paused, loop: a.loop, volume: a.volume, src: a.currentSrc }));
  async function ready(name) {
    await expect.poll(async () => {
      const a = await read(name);
      return !a.paused && a.time > 0 && a.volume > 0 && Number.isFinite(a.duration);
    }).toBe(true);
  }
  async function uninterrupted(name, label, action) {
    await ready(name);
    const before = await read(name);
    await track(name).evaluate(a => {
      window.__musicInterruptions = [];
      const record = e => window.__musicInterruptions.push(e.type);
      window.__musicRemoveProbe?.();
      for (const event of ["pause", "emptied", "loadstart"]) a.addEventListener(event, record);
      window.__musicRemoveProbe = () => {
        for (const event of ["pause", "emptied", "loadstart"]) a.removeEventListener(event, record);
      };
    });
    await action();
    await page.waitForTimeout(450);
    const after = await read(name);
    const interruptions = await page.evaluate(() => {
      window.__musicRemoveProbe();
      return window.__musicInterruptions;
    });
    assert.equal(after.src, before.src, `${label}: source must stay attached`);
    assert.equal(after.paused, false, `${label}: music must keep playing`);
    assert.ok(after.time > before.time + 0.2, `${label}: music clock must advance`);
    assert.deepEqual(interruptions, [], `${label}: no pause/reload is allowed`);
    checks.push(label);
  }
  async function loopBoundary(name) {
    await ready(name);
    const state = await read(name);
    assert.equal(state.loop, true);
    await track(name).evaluate(a => { a.currentTime = a.duration - 0.35; });
    await expect.poll(async () => {
      const a = await read(name);
      return !a.paused && a.time < 3 && a.volume > 0;
    }, { timeout: 6000 }).toBe(true);
    checks.push(`${name}: reaches the end and loops without stopping`);
  }
  await expect(page.getByRole("dialog", { name: "Voyager opening" })).toHaveCount(0, { timeout: 20000 });
  await ready("pair");
  await uninterrupted("pair", "QR track survives visibility changes", async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
  });
  await loopBoundary("pair");
  await page.getByRole("button", { name: "Continue to Home", exact: true }).click();
  await ready("library");
  await uninterrupted("library", "Collection navigation keeps its music clock", async () => {
    await page.getByRole("button", { name: "Next game", exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Previous game", exact: true }).click();
  });
  await uninterrupted("library", "Audio settings and volume changes keep music playing", async () => {
    await page.getByRole("button", { name: "Session settings", exact: true }).click();
    await page.getByRole("button", { name: "Audio & appearance", exact: true }).click();
    await page.getByRole("slider", { name: "Music volume", exact: true }).press("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
  });
  await uninterrupted("library", "Add phones overlay keeps collection music", async () => {
    await page.getByRole("button", { name: "Add phones", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Bring everyone in" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
  });
  await uninterrupted("library", "Add game workspace keeps collection music", async () => {
    await page.getByRole("button", { name: "Add game", exact: true }).click();
    const workspace = page.getByRole("dialog", { name: "Add game", exact: true });
    await expect(workspace).toBeVisible();
    const tutorial = page.getByRole("button", { name: "Skip tutorial", exact: true });
    if (await tutorial.isVisible()) await tutorial.click();
    await page.waitForTimeout(450);
    await workspace.getByRole("button", { name: "Close", exact: true }).click();
    await expect(workspace).toHaveCount(0);
  });
  await loopBoundary("library");
  await page.getByRole("button", { name: "Enter game lobby", exact: true }).click();
  await expect.poll(() => track("library").evaluate(a => a.paused && a.volume === 0)).toBe(true);
  checks.push("Entering a game lobby fades and pauses collection music to make room for its trailer");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "report.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS ${checks.length} music continuity/loop checks`);
} finally {
  await app.close();
}
