import { chromium, expect } from "playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd(),
  output = path.resolve("test-results/voyager-stress");
await mkdir(output, { recursive: true });
const vite = await createServer({
  configFile: false,
  root: path.resolve(".local/voyager-motion-check"),
  plugins: [react()],
  publicDir: path.resolve("assets/public"),
  server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root] } },
  logLevel: "error",
});
await vite.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [],
  errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(vite.resolvedUrls.local[0] + "?debug=1");
  for (const count of [200, 1000]) {
    const began = performance.now();
    await page
      .getByLabel("Demo data", { exact: true })
      .selectOption(`${count} games`);
    await expect(page.locator(".collection-index button")).toHaveCount(count);
    await expect(page.locator(".collection-disc[data-active]")).toHaveCount(1);
    const loadMs = performance.now() - began;
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
      window.__stressObserver?.disconnect();
      cancelAnimationFrame(window.__stressFrame);
      window.__frames = [];
      window.__longTasks = [];
      window.__stressActive = true;
      window.__stressObserver = new PerformanceObserver((l) =>
        window.__longTasks.push(...l.getEntries().map((e) => e.duration)),
      );
      window.__stressObserver.observe({ type: "longtask", buffered: false });
      let last = performance.now();
      function frame(now) {
        window.__frames.push(now - last);
        last = now;
        if (window.__stressActive)
          window.__stressFrame = requestAnimationFrame(frame);
      }
      window.__stressFrame = requestAnimationFrame(frame);
    });
    const next = await page
      .getByRole("button", { name: "Next game", exact: true })
      .boundingBox();
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await page.mouse.up();
    await page.waitForTimeout(1000);
    const motion = await page.evaluate(() => {
      window.__stressActive = false;
      cancelAnimationFrame(window.__stressFrame);
      window.__stressObserver.disconnect();
      const frames = window.__frames.slice(1).sort((a, b) => a - b);
      return {
        frames: frames.length,
        frameP95: frames[Math.floor(frames.length * 0.95)],
        maxFrame: frames.at(-1),
        longTasks: window.__longTasks,
        discNodes: document.querySelectorAll(".collection-disc").length,
        domNodes: document.querySelectorAll("*").length,
        selected: document.querySelector(".collection-step-controls b")
          .textContent,
        heapMB: performance.memory?.usedJSHeapSize / 1024 / 1024,
      };
    });
    assert.ok(motion.discNodes <= 26);
    await page
      .getByRole("button", { name: "Enter game lobby", exact: true })
      .click();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.sceneTransition||"")).toBe("");
    const labels = await page
      .locator(".lobby-orbit-labels text")
      .evaluateAll((nodes) =>
        nodes.map((el) => ({
          title: el.querySelector("textPath").textContent,
          full: el.getAttribute("aria-label").slice(5),
          length: el.getComputedTextLength(),
          allocated: el.textLength.baseVal.value,
        })),
      );
    assert.ok(labels.length <= 5);
    labels.forEach((label) => {
      assert.equal(label.title, label.full);
      assert.ok(
        Math.abs(label.length - label.allocated) < 1,
        JSON.stringify(label),
      );
    });
    const startId = await page.locator(".game-lobby-copy h1").textContent();
    await page.getByRole("button", { name: "Next game", exact: true }).click();
    await expect(page.locator(".game-lobby-copy h1")).not.toHaveText(startId);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.sceneTransition||"")).toBe("");
    const overlap = await page.evaluate(() => {
      const controls = document
          .querySelector(".trailer-controls")
          .getBoundingClientRect(),
        arc = document.querySelector(".lobby-game-orbit");
      return {
        controlsY: controls.y,
        mask: getComputedStyle(arc).maskImage,
        scroll: scrollY,
        videoElements: document.querySelectorAll("video").length,
      };
    });
    assert.equal(overlap.scroll, 0);
    assert.equal(overlap.mask, "none");
    assert.ok(overlap.videoElements <= 1);
    await page.getByTestId("fixture-controls").evaluate(el=>el.style.visibility="hidden");
    await page.screenshot({ path: path.join(output, `lobby-${count}.png`) });
    await page.getByTestId("fixture-controls").evaluate(el=>el.style.visibility="");
    results.push({ count, loadMs, motion, labels, overlap });
    await page.getByRole("button", { name: "Collection", exact: true }).click();
    await page
      .getByLabel("Find a game", { exact: true })
      .fill(`Expedition ${count}`);
    await expect(page.locator(".collection-index button")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await expect(page.locator(".collection-index button")).toHaveCount(count);
  }
  assert.deepEqual(errors, []);
  const file = process.argv.includes("--baseline")
    ? "baseline.json"
    : "report.json";
  await writeFile(
    path.join(output, file),
    JSON.stringify(
      {
        results,
        errors,
        note: "Synthetic catalogs with missing artwork; browser component harness, no real game launches or video decoding. Timing is specific to this machine/run.",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      results.map((r) => ({ count: r.count, loadMs: r.loadMs, ...r.motion })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await vite.close();
}
