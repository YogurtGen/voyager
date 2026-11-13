import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../website/", import.meta.url));
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "site.css"), "utf8");
const source = JSON.parse(readFileSync(path.join(root, "SOURCE.json"), "utf8"));
for (const file of ["site.css", "site.js"]) {
  const digest = createHash("sha256")
    .update(readFileSync(path.join(root, file)))
    .digest("hex");
  assert.equal(
    digest,
    source.sha256[file],
    `${file} must match the requested WaterConsole source`,
  );
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML IDs");
for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const target = match[1];
  if (target.startsWith("#")) {
    if (target.length > 1)
      assert(ids.includes(target.slice(1)), `Missing anchor ${target}`);
    continue;
  }
  if (/^https?:/.test(target)) continue;
  assert(
    existsSync(path.resolve(root, target.split("?")[0])),
    `Missing resource ${target}`,
  );
}
for (const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g))
  assert(
    existsSync(path.resolve(root, match[1])),
    `Missing CSS asset ${match[1]}`,
  );
const actions = [
  ...html.matchAll(
    /<div class="(?:hero-actions hero-in|download-actions)">([\s\S]*?)<\/div>/g,
  ),
];
assert.equal(actions.length, 2, "Hero and download actions must be present");
for (const [, content] of actions) {
  assert(
    content.includes("YogurtGen/voyager/releases/latest"),
    "Download must target Voyager",
  );
  assert(
    content.includes("https://yapp.ink/fensulix") &&
      content.includes("Support us"),
    "Support us must remain beside download",
  );
}
assert.equal(
  (html.match(/href="https:\/\/yapp.ink\/fensulix"/g) || []).length,
  3,
);
assert(
  !html.includes("disc-carousel") && !html.includes("space-canvas"),
  "The previous custom concept must be removed",
);
assert(
  html.includes("Version 0.1.0") && !html.includes("Version 0.5.2"),
  "Release metadata must describe Voyager",
);
assert(
  /\.studio-release\s*>\s*img\s*\{[^}]*height:\s*auto/.test(css),
  "Studio screenshot must preserve its natural ratio",
);
execFileSync(process.execPath, ["--check", path.join(root, "site.js")], {
  stdio: "pipe",
});
const workflow = readFileSync(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8",
);
assert(
  workflow.includes("node scripts/build-website.mjs") &&
    workflow.includes("path: ${{ steps.site.outputs.directory }}"),
);
console.log(
  "PASS exact WaterConsole CSS/JS identity, assets, anchors, Voyager links/version, adjacent support, natural screenshot ratio, script syntax and Pages artifact scope.",
);
