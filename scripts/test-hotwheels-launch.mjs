import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createInterface } from "node:readline/promises";

if (
  process.platform !== "win32" ||
  process.env.WATERCONSOLE_TEST_HOTWHEELS !== "1"
)
  throw new Error(
    "Interactive opt-in Windows launch test: set WATERCONSOLE_TEST_HOTWHEELS=1 with the original game closed and Epic sign-in ready. Reach the game Home menu before acknowledging the terminal prompt.",
  );
const helper = path.resolve("build/native/WaterConsole.InputBridge.exe");
const game = path.resolve(
  process.env.WATERCONSOLE_HOTWHEELS_PATH ||
    "E:/Program Files/Games Program/Epic Games/HOTWHEELSUNLEASHED/hotwheels/Binaries/Win64/EpicGamesStore/hotwheels-Win64-Shipping.exe",
);
const find = () =>
  JSON.parse(
    execFileSync(helper, ["--find", game], {
      encoding: "utf8",
      windowsHide: true,
    }),
  ).pid;
assert.equal(
  find(),
  0,
  "Close the original game normally before testing owned launch.",
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: path.resolve(`.local/hotwheels-launch-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.WATERCONSOLE_DISABLE_NATIVE;
const desktop = await _electron.launch({
  executablePath: process.env.WATERCONSOLE_EXECUTABLE || electronPath,
  args: process.env.WATERCONSOLE_EXECUTABLE ? [] : ["."],
  env,
});
const host = await desktop.firstWindow();
const command = (c) => host.evaluate((c) => window.waterconsole.command(c), c);
const state = () => host.evaluate(() => window.waterconsole.getState());
try {
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .waitFor();
  assert.equal(
    (await command({ type: "startGame", gameId: "hotwheels-unleashed" })).ok,
    true,
  );
  assert.ok(find());
  assert.equal((await state()).profile, "racing");
  assert.equal((await state()).native.gameId, "hotwheels-unleashed");
  const readiness = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await readiness.question(
      "On the PC, pass Press any button and wait for the original game Home menu. Then press Enter here to test Stop: ",
    );
  } finally {
    readiness.close();
  }
  await command({ type: "nativeFocus" });
  const stopped = await command({ type: "stopGame" });
  assert.equal(stopped.ok, true, stopped.error);
  assert.equal(
    find(),
    0,
    "Home must wait until the original game process exits.",
  );
  assert.equal((await state()).phase, "home");
  assert.equal((await state()).native.focused, false);
  const report = {
    passed: true,
    testedAt: new Date().toISOString(),
    executable: process.env.WATERCONSOLE_EXECUTABLE
      ? "packaged app"
      : "development app",
    checks: [
      "WaterConsole starts the original game through the fixed official Epic URI and selects the racing profile",
      "Stopping the owned HOT WHEELS game releases driving input, confirms its normal exit dialog, verifies the original PID is gone, then returns Home",
    ],
    limits: [
      "Epic session was already authenticated; this is not an offline cold-start test",
      "A failed/focus-interrupted exit keeps the controller attached instead of claiming Home",
    ],
  };
  await mkdir("research/validation", { recursive: true });
  await writeFile(
    "research/validation/hotwheels-launch.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  try {
    await command({ type: "stopGame" });
  } catch {}
  await desktop.close();
}
