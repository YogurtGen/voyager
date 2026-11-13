import { readFile, mkdir, copyFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
  throw new Error("Invalid release version");
const output = path.join(root, "releases", version);
await mkdir(output, { recursive: true });
const names = [
  `Voyager-Setup-${version}-x64.exe`,
  `Voyager-${version}-x64.zip`,
];
for (const name of names)
  await copyFile(path.join(root, "dist", name), path.join(output, name));
const source = `Voyager-${version}-source.zip`;
const archived = spawnSync(
  "git",
  [
    "archive",
    "--format=zip",
    "--prefix=voyager/",
    "--output=" + path.join(output, source),
    "HEAD",
  ],
  { cwd: root, windowsHide: true, stdio: "inherit" },
);
if (archived.error) throw archived.error;
if (archived.status !== 0)
  throw new Error("Commit the reviewed source before archiving a release");
names.push(source);
const files = [];
for (const name of names) {
  const filename = path.join(output, name),
    hash = createHash("sha256");
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  files.push({
    name,
    bytes: (await stat(filename)).size,
    sha256: hash.digest("hex"),
  });
}
await writeFile(
  path.join(output, "SHA256SUMS.txt"),
  files.map((file) => `${file.sha256}  ${file.name}`).join("\n") + "\n",
);
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify({ version, files }, null, 2) + "\n",
);
console.log(JSON.stringify({ output, files }, null, 2));
