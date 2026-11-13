import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const dataDir = path.resolve(`.local/voyager-navigation-${Date.now()}`);
const output = path.resolve("test-results/voyager-navigation");
await mkdir(dataDir, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(
  path.join(dataDir, "presentation.json"),
  JSON.stringify({
    settings: {
      music: false,
      startupSound: false,
      trailers: false,
      motion: "full",
    },
    games: {},
  }),
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_DATA_DIR: dataDir,
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DISABLE_NATIVE: "1",
  VOYAGER_TEST_NO_TRAILER_FETCH: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.WATERCONSOLE_WINDOWED;
const app = await _electron.launch({
  executablePath: electronPath,
  args: ["."],
  env,
  timeout: 35000,
});
const checks = [],
  errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("dialog", { name: "Voyager opening" }),
  ).toHaveCount(0, { timeout: 20000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await expect.poll(()=>app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
  checks.push("Application starts fullscreen without an environment override");
  const nativeWindow = await app.evaluate(({BrowserWindow,screen}) => {
    const win=BrowserWindow.getAllWindows()[0];
    return {bounds:win.getBounds(),display:screen.getDisplayMatching(win.getBounds()).bounds,handle:win.getNativeWindowHandle().readBigUInt64LE().toString()};
  });
  assert.deepEqual(nativeWindow.bounds,nativeWindow.display,"Fullscreen must cover display bounds, including the taskbar area");
  const nativeProbe = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class VoyagerWindowProbe { [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int n); }'; [VoyagerWindowProbe]::GetWindowLongPtr([IntPtr]::new(${nativeWindow.handle}), -16).ToInt64()`;
  const nativeStyle=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(nativeProbe,"utf16le").toString("base64")],{windowsHide:true});
  assert.equal(Number(nativeStyle.stdout.trim()) & 0x00040000,0,"WS_THICKFRAME must be absent from the native window");
  checks.push("Native Windows thick frame is absent and startup covers the entire display");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(false),
  );
  await new Promise((resolve,reject)=>{
    const child=spawn(electronPath,["."],{env,windowsHide:true,stdio:"ignore"});
    const timer=setTimeout(()=>{child.kill();reject(new Error("Second launcher did not hand off to existing Voyager"));},15000);
    child.on("error",e=>{clearTimeout(timer);reject(e)});
    child.on("exit",code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`Second launch exited ${code}`))});
  });
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
  checks.push("Normal launcher restores fullscreen in an already-running windowed instance");
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setFullScreen(false));
  for (const [width, height] of [
    [1024, 640],
    [1280, 720],
    [1920, 1080],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, s) =>
        BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height),
      { width, height },
    );
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("button", { name: "Continue to Home", exact: true }),
    ).toBeInViewport();
    await expect(page.locator(".qr-wrap")).toBeInViewport();
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 1300);
    await page.evaluate(() => window.scrollTo(1000, 1000));
    const geometry = await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      client: document.documentElement.clientHeight,
      scroll: document.documentElement.scrollHeight,
      card: document
        .querySelector(".voyager-pair-panel")
        .getBoundingClientRect()
        .toJSON(),
    }));
    assert.equal(geometry.x, 0);
    assert.equal(geometry.y, 0);
    assert.equal(geometry.scroll, geometry.client);
    assert.ok(
      geometry.card.bottom <= height && geometry.card.top >= 0,
      "Entire QR card must fit without clipping",
    );
    await page.screenshot({ path: path.join(output, `qr-${width}.png`) });
  }
  checks.push(
    "QR card, code and Continue fit a single unscrollable page at 1024×640, 720p and 1080p",
  );
  await page.evaluate(() => {
    window.__pairTransition = null;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (update) => {
      const transition = original(update);
      transition.ready
        .then(() => {
          if (document.documentElement.dataset.sceneTransition === "pair-home")
            window.__pairTransition = {
              qr: getComputedStyle(
                document.documentElement,
                "::view-transition-old(voyager-qr)",
              ).animationName,
              shelf: getComputedStyle(
                document.documentElement,
                "::view-transition-new(voyager-shelf)",
              ).animationName,
            };
        })
        .catch(() => {});
      return transition;
    };
  });
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  await expect(page.locator(".voyager-collection")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__pairTransition))
    .toEqual({ qr: "voyager-flow-out", shelf: "voyager-flow-in" });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  checks.push(
    "QR to collection uses named fade/lift animations and settles without a pending transition",
  );
  await page.evaluate(() => {
    window.__navMoves = [];
    let last;
    window.waterconsole.onState((s) => {
      if (last !== undefined && last !== s.selectedGameId)
        window.__navMoves.push({ id: s.selectedGameId, at: performance.now() });
      last = s.selectedGameId;
    });
  });
  const clear = () =>
    page.evaluate(() => {
      window.__navMoves = [];
    });
  const moves = () => page.evaluate(() => window.__navMoves);
  const noTail = async () => {
    const a = await moves();
    await page.waitForTimeout(700);
    assert.equal(
      (await moves()).length,
      a.length,
      "No queued navigation may continue after release",
    );
  };
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
  await clear();
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight");
  const burst = await moves();
  assert.ok(burst.length <= 3, JSON.stringify(burst));
  await noTail();
  checks.push(
    "25 rapid key presses are bounded and do not queue later movement",
  );
  await clear();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1100);
  await page.keyboard.up("ArrowRight");
  const held = await moves();
  assert.ok(held.length >= 3 && held.length <= 4, JSON.stringify(held));
  for (let i = 1; i < held.length; i++)
    assert.ok(held[i].at - held[i - 1].at >= 290);
  await noTail();
  checks.push(
    "Held keyboard moves around three games per second and stops on release",
  );
  await clear();
  const next = page.getByRole("button", { name: "Next game", exact: true });
  const rect = await next.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  const pointer = await moves();
  assert.ok(
    pointer.length >= 3 && pointer.length <= 4,
    JSON.stringify(pointer),
  );
  await noTail();
  checks.push("Held pointer button repeats safely and stops on release");
  await page
    .getByRole("button", { name: "Enter game lobby", exact: true })
    .click();
  await expect(page.locator(".lobby-game-orbit")).toBeVisible();
  const dot = () =>
    page.locator(".lobby-orbit-dot").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  const before = await dot(),
    oldAngle = await page
      .locator(".lobby-game-orbit")
      .getAttribute("data-angle");
  await page.evaluate(() => {
    const real = document.startViewTransition.bind(document);
    window.__orbitTransitions = [];
    document.startViewTransition = (update) => {
      const t = real(update);
      t.ready
        .then(() =>
          window.__orbitTransitions.push({
            ring: getComputedStyle(
              document.documentElement,
              "::view-transition-new(voyager-orbit-labels)",
            ).animationName,
            disc: getComputedStyle(
              document.documentElement,
              "::view-transition-new(voyager-disc)",
            ).animationName,
            step: document.documentElement.style.getPropertyValue(
              "--game-disc-step",
            ),
          }),
        )
        .catch(() => {});
      return t;
    };
  });
  await page.getByRole("button", { name: "Next game", exact: true }).click();
  await expect
    .poll(() => page.locator(".lobby-game-orbit").getAttribute("data-angle"))
    .not.toBe(oldAngle);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  assert.deepEqual(await dot(), before);
  const transition = await page.evaluate(() =>
    window.__orbitTransitions.at(-1),
  );
  assert.equal(transition.ring, "voyager-ring-turn");
  assert.equal(transition.disc, "voyager-disc-in");
  assert.equal(transition.step, "45deg");
  const half = await page.locator(".lobby-disc").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      center: r.y + r.height / 2,
      visible: (innerHeight - r.y) / r.height,
    };
  });
  assert.ok(Math.abs(half.center - 1086) < 2);
  assert.ok(half.visible > 0.45 && half.visible < 0.55);
  checks.push(
    "Half-disc stays centered; fixed dot and rotating labels use the 45° crossfade transition",
  );
  await page.screenshot({ path: path.join(output, "half-disc-lobby.png") });
  const ico = await readFile("assets/icon.ico"),
    count = ico.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256);
  assert.deepEqual(sizes, [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]);
  for (let i = 0; i < count; i++) {
    const start = ico.readUInt32LE(6 + i * 16 + 12),
      length = ico.readUInt32LE(6 + i * 16 + 8);
    assert.ok(start + length <= ico.length);
    assert.equal(ico.readUInt32BE(start + 16), sizes[i]);
  }
  checks.push(
    "ICO contains ten independently rendered native sizes, including 16/24/32px taskbar frames",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      { checks, burst, held, pointer, transition, errors },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${checks.length} fullscreen, QR, navigation, orbit and icon checks`,
  );
} finally {
  await app.close();
}
