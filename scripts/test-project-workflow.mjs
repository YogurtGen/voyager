import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  utimes,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { needsProjectBuild } from "./project-build.mjs";
import { projectRoot, projectIsRunning } from "./launch-project.mjs";

const testsRoot = path.join(projectRoot, ".local/tests");
await mkdir(testsRoot, { recursive: true });
const root = await mkdtemp(path.join(testsRoot, "project-workflow-"));
const checks = [];
async function file(relative, content, timestamp) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
  if (timestamp) await utimes(filename, timestamp, timestamp);
  return filename;
}
function cli(args, ok = true) {
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "toolkit/game.mjs"), ...args],
    {
      cwd: projectRoot,
      env: { ...process.env, VOYAGER_LIBRARY_DIR: path.join(root, "data") },
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
    },
  );
  if (result.error) throw result.error;
  if (ok) assert.equal(result.status, 0, result.stderr);
  else assert.notEqual(result.status, 0, "Expected import to be rejected");
  return result;
}
try {
  const old = new Date(Date.now() - 20000),
    built = new Date(Date.now() - 10000);
  await file("src/example.ts", "old", old);
  await utimes(path.join(root, "src"), old, old);
  assert.equal(await needsProjectBuild(root), true);
  for (const output of [
    "build/electron/main.cjs",
    "build/electron/preload.cjs",
    "build/server/entry.cjs",
    "build/renderer/host.html",
    "build/native/WaterConsole.InputBridge.exe",
    "build/native/WaterConsole.UserBridge.exe",
  ])
    await file(output, "built", built);
  assert.equal(await needsProjectBuild(root), false);
  await file("assets/icon.ico", "regenerated icon");
  await utimes(path.join(root, "assets"), old, old);
  assert.equal(await needsProjectBuild(root), false);
  await file("src/example.ts", "edited");
  assert.equal(await needsProjectBuild(root), true);
  await file("src/example.ts", "old", old);
  await file("src/deleted.ts", "removed", old);
  await rm(path.join(root, "src/deleted.ts"));
  assert.equal(await needsProjectBuild(root), true);
  await utimes(path.join(root, "src"), old, old);
  await rm(path.join(root, "build/electron/preload.cjs"));
  assert.equal(await needsProjectBuild(root), true);
  checks.push(
    "Rebuilds after source edits, additions/deletions or missing output; skips unchanged builds and generated icon changes",
  );

  assert.equal(await projectIsRunning(root), false);
  const marker = await file(
    ".local/project-session.json",
    JSON.stringify({ pid: process.pid }),
  );
  assert.equal(await projectIsRunning(root), true);
  await writeFile(marker, JSON.stringify({ pid: -1 }));
  assert.equal(await projectIsRunning(root), false);
  await writeFile(marker, "{");
  assert.equal(await projectIsRunning(root), false);
  checks.push(
    "Session guard recognizes a live process and ignores invalid/missing session records",
  );

  assert.equal(
    await projectIsRunning(),
    false,
    "Close Voyager before running workflow import tests",
  );
  const draft = path.join(root, "custom-game.json");
  cli(["--template", draft]);
  const original = await readFile(draft, "utf8");
  cli(["--template", draft], false);
  assert.equal(await readFile(draft, "utf8"), original);
  const game = JSON.parse(original);
  game.title = "AI controller fixture";
  game.description = "A test fixture, never a real installed game";
  const mode = game.controller.modes[0];
  game.controller.modes = [mode];
  mode.controls = mode.controls.slice(0, 3);
  mode.controls[1].label = "Jump";
  mode.controls[1].actions = ["jump"];
  for (const slot of [1, 2, 3, 4]) {
    const pad = game.bindings.gamepad[slot][mode.id];
    const keyboard = game.bindings.keyboard[slot][mode.id];
    pad.jump = [{ kind: "button", code: "a" }];
    keyboard.jump = [{ kind: "key", code: "Space" }];
    game.bindings.gamepad[slot] = { [mode.id]: pad };
    game.bindings.keyboard[slot] = { [mode.id]: keyboard };
  }
  await writeFile(draft, JSON.stringify(game));
  cli([draft]);
  const catalogFile = path.join(root, "data/library/catalog.json");
  const first = await readFile(catalogFile, "utf8");
  const saved = JSON.parse(first).games[0];
  assert.equal(saved.revision, 1);
  assert.equal(saved.title, game.title);
  assert.equal(saved.controller.modes[0].controls[1].label, "Jump");
  assert.deepEqual(saved.bindings.gamepad[1].menu.jump, [
    { kind: "button", code: "a" },
  ]);
  checks.push(
    "AI-created game and custom phone action mappings persist through the real LibraryStore",
  );

  saved.title = "Updated AI controller fixture";
  await writeFile(draft, JSON.stringify(saved));
  cli([draft]);
  const updated = await readFile(catalogFile, "utf8");
  assert.equal(JSON.parse(updated).games[0].revision, 2);
  assert.equal(
    await readFile(
      path.join(root, "data/library/catalog.previous.json"),
      "utf8",
    ),
    first,
  );
  assert.match(cli([draft], false).stderr, /changed in another editor/);
  assert.equal(await readFile(catalogFile, "utf8"), updated);
  saved.revision = 2;
  saved.bindings.gamepad[1].menu.jump = [
    { kind: "button", code: "invalid-button" },
  ];
  await writeFile(draft, JSON.stringify(saved));
  cli([draft], false);
  assert.equal(await readFile(catalogFile, "utf8"), updated);
  checks.push(
    "Updates preserve backups; stale revisions and invalid mappings leave the catalog untouched",
  );
  console.log(JSON.stringify({ checks, passed: checks.length }, null, 2));
} finally {
  assert.ok(path.resolve(root).startsWith(path.resolve(testsRoot) + path.sep));
  await rm(root, { recursive: true, force: true });
}
