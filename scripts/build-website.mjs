import {
  cpSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const source = fileURLToPath(new URL("../website/", import.meta.url));
const files = [];
function inventory(directory, prefix = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    assert(
      !entry.isSymbolicLink(),
      "Website artifacts cannot contain symlinks",
    );
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory())
      inventory(path.join(directory, entry.name), relative);
    else files.push(relative);
  }
}
inventory(source);
const hash = createHash("sha256");
for (const relative of files.sort())
  hash
    .update(relative.replaceAll("\\", "/"))
    .update(readFileSync(path.join(source, relative)));
const version = hash.digest("hex").slice(0, 12);
const directory = `.local/website-${version}`;
const output = fileURLToPath(new URL(`../${directory}/`, import.meta.url));
cpSync(source, output, { recursive: true });
for (const name of ["index.html", "site.css", "site.js"]) {
  let text = readFileSync(path.join(output, name), "utf8");
  if (name === "index.html")
    text = text.replace(
      /(\b(?:src|href)=")((?:assets\/|site\.(?:css|js))[^"?]*)(")/g,
      `$1$2?v=${version}$3`,
    );
  if (name === "site.css")
    text = text.replace(
      /url\((['"]?)(assets\/[^)'"?]+)\1\)/g,
      `url($1$2?v=${version}$1)`,
    );
  if (name === "site.js")
    text = text.replace(
      /(["'])(\.\/(?:space|disc-motion)\.js)\1/g,
      `$1$2?v=${version}$1`,
    );
  writeFileSync(path.join(output, name), text);
}
const html = readFileSync(path.join(output, "index.html"), "utf8");
assert(
  html.includes(`site.css?v=${version}`) &&
    html.includes(`site.js?v=${version}`),
  "Versioned entrypoints are required",
);
for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  if (/^https?:/.test(match[1])) continue;
  assert(
    existsSync(path.join(output, match[1].split("?")[0])),
    `Missing built asset ${match[1]}`,
  );
}
assert(
  readFileSync(path.join(output, "site.js"), "utf8").includes(
    `./space.js?v=${version}`,
  ),
  "Lazy shader must share the build version",
);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `directory=${directory}\nversion=${version}\n`,
  );
console.log(
  JSON.stringify({ directory, version, files: files.length, status: "PASS" }),
);
