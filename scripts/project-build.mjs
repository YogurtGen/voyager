import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const generated = new Set([
  "assets/icon.png",
  "assets/icon.ico",
  "assets/voyager-mark.svg",
]);
const outputs = [
  "build/electron/main.cjs",
  "build/electron/preload.cjs",
  "build/server/entry.cjs",
  "build/renderer/host.html",
  "build/native/WaterConsole.InputBridge.exe",
  "build/native/WaterConsole.UserBridge.exe",
];
async function modified(root, relative) {
  if (generated.has(relative.replaceAll(path.sep, "/"))) return 0;
  const file = path.join(root, relative);
  let info;
  try {
    info = await stat(file);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
  if (!info.isDirectory()) return info.mtimeMs;
  const entries = await readdir(file, { withFileTypes: true });
  const times = await Promise.all(
    entries
      .filter((entry) => !entry.isSymbolicLink())
      .map((entry) => modified(root, path.join(relative, entry.name))),
  );
  return Math.max(info.mtimeMs, ...times);
}
export async function needsProjectBuild(root) {
  let built;
  try {
    built = Math.min(
      ...(await Promise.all(
        outputs.map(
          async (file) => (await stat(path.join(root, file))).mtimeMs,
        ),
      )),
    );
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
  const inputs = [
    "src",
    "assets",
    "toolkit/native",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "scripts/build.mjs",
    "scripts/build-native.mjs",
    "scripts/make-icon.mjs",
    "scripts/notices.mjs",
  ];
  return (
    Math.max(
      ...(await Promise.all(inputs.map((file) => modified(root, file)))),
    ) > built
  );
}
