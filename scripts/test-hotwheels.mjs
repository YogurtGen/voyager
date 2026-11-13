import { _electron, chromium, expect } from "playwright/test";
import electronPath from "electron";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

if (
  process.platform !== "win32" ||
  process.env.WATERCONSOLE_TEST_HOTWHEELS !== "1"
)
  throw new Error(
    "Opt-in keyboard fallback regression: open an original HOT WHEELS Quick Race Continue screen, then set WATERCONSOLE_TEST_HOTWHEELS=1. This isolated PC session disables virtual gamepads. Do not run another input bridge.",
  );
const output = path.resolve(".local/hotwheels-phone-test");
await mkdir(output, { recursive: true });
const helper = path.resolve("build/native/WaterConsole.InputBridge.exe");
const game = path.resolve(
  process.env.WATERCONSOLE_HOTWHEELS_PATH ||
    "E:/Program Files/Games Program/Epic Games/HOTWHEELSUNLEASHED/hotwheels/Binaries/Win64/EpicGamesStore/hotwheels-Win64-Shipping.exe",
);
const { pid } = JSON.parse(
  execFileSync(helper, ["--find", game], {
    encoding: "utf8",
    windowsHide: true,
  }),
);
assert.ok(
  pid,
  "Open the selected original game's local race before this opt-in test.",
);
const probeSource = path.join(output, "RacingKeyProbe.cs"),
  probe = path.join(output, "RacingKeyProbe.exe");
await writeFile(
  probeSource,
  `using System;using System.Runtime.InteropServices;class RacingKeyProbe { [DllImport("user32.dll")]static extern short GetAsyncKeyState(int k); static void Main(){int[] keys={0x57,0x41,0x44,0x20,0xa0,0x52};Console.WriteLine(string.Join(",",Array.ConvertAll(keys,k=>(GetAsyncKeyState(k)&0x8000)!=0?"1":"0")));}}`,
);
execFileSync(
  path.join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/csc.exe"),
  ["/nologo", "/platform:x64", "/out:" + probe, probeSource],
  { windowsHide: true },
);
const keys = () =>
  execFileSync(probe, [], { windowsHide: true, encoding: "utf8" })
    .trim()
    .split(",")
    .map((x) => x === "1");
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_DISABLE_GAMEPAD: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: path.resolve(`.local/hotwheels-session-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.WATERCONSOLE_DISABLE_NATIVE;
const desktop = await _electron.launch({
  executablePath: process.env.WATERCONSOLE_EXECUTABLE || electronPath,
  args: process.env.WATERCONSOLE_EXECUTABLE ? [] : ["."],
  env,
});
const host = await desktop.firstWindow();
const state = () => host.evaluate(() => window.waterconsole.getState());
const command = (c) => host.evaluate((c) => window.waterconsole.command(c), c);
const checks = [],
  errors = [];
host.on("pageerror", (e) => errors.push(e.message));
let browser, touch;
try {
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .waitFor();
  assert.equal((await state()).native.games["hotwheels-unleashed"], true);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const phones = [];
  for (const name of ["Phone driver", "Spectator"]) {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto((await state()).pairing.url);
    await page.getByLabel("Your name", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: "Connect to console", exact: true })
      .click();
    await expect.poll(async () => (await state()).pending.length).toBe(1);
    assert.equal(
      (
        await command({
          type: "approve",
          requestId: (await state()).pending[0].id,
        })
      ).ok,
      true,
    );
    await page
      .getByRole("button", { name: "Enter controller", exact: true })
      .click();
    phones.push({ context, page });
  }
  assert.equal(
    (await command({ type: "startGame", gameId: "hotwheels-unleashed" })).ok,
    true,
  );
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].minimize(),
  );
  await command({ type: "nativeFocus" });
  await expect.poll(async () => (await state()).native.focused).toBe(true);
  const driver = phones[0].page;
  await driver.getByRole("button", { name: "Race", exact: true }).waitFor();
  await driver.screenshot({ path: path.join(output, "phone-menu.png") });
  const menuTouch = await phones[0].context.newCDPSession(driver);
  const confirmRect = await driver
    .getByRole("button", { name: "Confirm", exact: true })
    .boundingBox();
  assert.ok(confirmRect);
  await menuTouch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        x: confirmRect.x + confirmRect.width / 2,
        y: confirmRect.y + confirmRect.height / 2,
        id: 1,
      },
    ],
  });
  await delay(90);
  await menuTouch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await delay(6500);
  await expect(
    phones[1].page.getByRole("heading", { name: "Player 2 needs PC setup." }),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Race", exact: true }).tap();
  await expect.poll(async () => (await state()).native.controls).toBe("race");
  await driver.screenshot({
    path: path.join(output, "phone-race-landscape.png"),
  });
  await driver.setViewportSize({ width: 393, height: 852 });
  await driver.screenshot({
    path: path.join(output, "phone-race-portrait.png"),
  });
  await driver.setViewportSize({ width: 844, height: 390 });
  checks.push(
    "The original HOT WHEELS PID attaches with its racing profile; P2 has a driver setup notice; phone has console controls in both orientations.",
  );
  touch = await phones[0].context.newCDPSession(driver);
  async function hold(labels) {
    const points = [];
    for (const label of labels) {
      const rect = await driver
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      assert.ok(
        rect && rect.width >= 30 && rect.height >= 30,
        `${label} touch target missing`,
      );
      points.push({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        id: points.length + 1,
      });
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points,
    });
  }
  const release = () =>
    touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  await hold(["Throttle", "Steer right", "Boost"]);
  await expect.poll(keys).toEqual([true, false, true, false, true, false]);
  await delay(2200);
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-File",
      path.resolve("scripts/capture-hotwheels.ps1"),
      "-Name",
      "phone-driving",
    ],
    { windowsHide: true },
  );
  await release();
  await expect.poll(keys).toEqual([false, false, false, false, false, false]);
  await hold(["Brake"]);
  await expect.poll(keys).toEqual([false, false, false, true, false, false]);
  await release();
  await expect.poll(keys).toEqual([false, false, false, false, false, false]);
  checks.push(
    "Real multitouch reaches Windows as independent throttle + steering + boost; brake maps to Space and every release returns neutral.",
  );
  await hold(["Throttle"]);
  await expect.poll(keys).toEqual([true, false, false, false, false, false]);
  await driver.getByRole("button", { name: "Menus", exact: true }).tap();
  await expect.poll(keys).toEqual([false, false, false, false, false, false]);
  await release();
  await driver.getByRole("button", { name: "Race", exact: true }).tap();
  await hold(["Throttle"]);
  await expect.poll(keys).toEqual([true, false, false, false, false, false]);
  await phones[0].context.close();
  await expect.poll(keys).toEqual([false, false, false, false, false, false]);
  checks.push(
    "Changing controller mode and closing the driver browser both release the actual native throttle key.",
  );
  await command({ type: "stopGame" });
  assert.equal((await state()).phase, "home");
  assert.equal(
    JSON.parse(
      execFileSync(helper, ["--find", game], {
        encoding: "utf8",
        windowsHide: true,
      }),
    ).pid,
    pid,
  );
  checks.push(
    "Returning Home detaches the pre-existing game without forcibly closing it.",
  );
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    testedAt: new Date().toISOString(),
    gameId: "hotwheels-unleashed",
    executable: process.env.WATERCONSOLE_EXECUTABLE
      ? "packaged app"
      : "development app",
    checks,
    errors,
    limits: [
      "Chrome emulated phone, not a physical Android Wi-Fi test",
      "Epic sign-in had already completed; offline launch not established",
      "Single phone driver; native split-screen not supported by this adapter",
    ],
  };
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  try {
    await touch?.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
  } catch {}
  try {
    await command({ type: "stopGame" });
  } catch {}
  await browser?.close();
  await desktop.close();
}
