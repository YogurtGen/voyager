import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Opt-in Windows test: opens the user's original game and closes it normally.
// Run separately from WaterConsole; two input bridges must never share a game.
const executable = process.env.WATERCONSOLE_IDOL_PATH;
if (process.platform !== "win32" || !executable)
  throw new Error(
    "Set WATERCONSOLE_IDOL_PATH to the installed Idol Showdown.exe on Windows.",
  );
const helperPath = path.resolve("build/native/WaterConsole.InputBridge.exe");
const existing = JSON.parse(
  execFileSync(helperPath, ["--find", executable], {
    encoding: "utf8",
    windowsHide: true,
  }),
);
assert.equal(
  existing.pid,
  0,
  "Close the existing game before running the isolated native test.",
);
const folder = path.resolve(".local/native-safety");
await mkdir(folder, { recursive: true });
const probeSource = path.join(folder, "FixedKeyProbe.cs");
const probe = path.join(folder, "FixedKeyProbe.exe");
await writeFile(
  probeSource,
  `using System;using System.Runtime.InteropServices;class FixedKeyProbe {
[DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
static bool Down(int key){return (GetAsyncKeyState(key)&0x8000)!=0;}
static void Main(){Console.WriteLine((Down(0x27)?1:0)+","+(Down(0x66)?1:0));}}`,
);
const compiler = path.join(
  process.env.WINDIR,
  "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
);
execFileSync(
  compiler,
  ["/nologo", "/platform:x64", "/out:" + probe, probeSource],
  { windowsHide: true },
);
const keyState = () => {
  const values = execFileSync(probe, [], {
    windowsHide: true,
    encoding: "utf8",
  })
    .trim()
    .split(",");
  return { right: values[0] === "1", numpad6: values[1] === "1" };
};
const game = spawn(executable, [], {
  cwd: path.dirname(executable),
  stdio: "ignore",
});
await new Promise((resolve, reject) => {
  game.once("spawn", resolve);
  game.once("error", reject);
});
const bridge = spawn(helperPath, ["--pid", String(game.pid)], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const events = [],
  checks = [];
let buffer = "",
  timer;
bridge.stdout.on("data", (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\n")) >= 0) {
    try {
      events.push(JSON.parse(buffer.slice(0, end)));
    } catch {}
    buffer = buffer.slice(end + 1);
  }
});
const send = (value) => bridge.stdin.write(JSON.stringify(value) + "\n");
async function until(predicate, message, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(message);
}
const epoch = Date.now();
let frame = {
  type: "input",
  epoch,
  controls: "fight",
  players: [
    { slot: 1, buttons: ["right", "x"] },
    { slot: 2, buttons: ["right", "x"] },
  ],
};
try {
  await until(
    () => events.some((e) => e.type === "ready"),
    "Bridge did not start.",
  );
  for (let i = 0; i < 30 && !events.at(-1)?.focused; i++) {
    send({ type: "focus" });
    await delay(200);
  }
  assert.ok(
    events.at(-1)?.focused,
    "Select the game window to enable the native smoke test.",
  );
  const mark = events.length;
  timer = setInterval(() => send(frame), 50);
  send(frame);
  await until(
    () => events.slice(mark).some((e) => e.held === 4),
    "Independent P1/P2 buttons were not held.",
  );
  assert.deepEqual(keyState(), { right: true, numpad6: false });
  checks.push(
    "Unix-millisecond epoch accepted; simultaneous P1/P2 direction and attack held; Right Arrow does not become Numpad6.",
  );
  frame = {
    ...frame,
    players: [
      { slot: 1, buttons: [] },
      { slot: 2, buttons: ["right", "x"] },
    ],
  };
  const release = events.length;
  send(frame);
  await until(
    () => events.slice(release).some((e) => e.held === 2),
    "Releasing P1 disturbed P2.",
  );
  checks.push("P1 release preserves P2 held buttons.");
  clearInterval(timer);
  timer = undefined;
  const stale = events.length;
  send({ ...frame, epoch: epoch - 1 });
  await until(
    () => events.slice(stale).some((e) => e.held === 0),
    "Stale epoch did not neutralize keys.",
  );
  assert.deepEqual(keyState(), { right: false, numpad6: false });
  checks.push("Stale epoch rejected and all keys released.");
  send(frame);
  await delay(100);
  const watchdog = events.length;
  await until(
    () => events.slice(watchdog).some((e) => e.held === 0),
    "Watchdog did not release keys.",
  );
  assert.equal(keyState().right, false);
  checks.push(
    "Missing heartbeat releases held input after the 300 ms watchdog.",
  );
  timer = setInterval(() => send(frame), 50);
  send(frame);
  await delay(150);
  clearInterval(timer);
  timer = undefined;
  send({ type: "close-game" });
  bridge.stdin.end();
  await until(
    () => events.some((e) => e.type === "stopped" && e.held === 0),
    "EOF did not release keys.",
  );
  assert.equal(keyState().right, false);
  checks.push(
    "EOF releases input; owned game receives normal window-close request.",
  );
  await writeFile(
    path.join(folder, "report.json"),
    JSON.stringify(
      { passed: true, at: new Date().toISOString(), checks, events },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  clearInterval(timer);
  if (bridge.stdin.writable) {
    send({ type: "close-game" });
    send({ type: "shutdown" });
    bridge.stdin.end();
  }
  execFileSync(helperPath, ["--close-pid", String(game.pid)], {
    windowsHide: true,
    timeout: 3000,
  });
}
