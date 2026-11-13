import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  indexAt,
  offsetOf,
  poseOf,
  springOf,
  springStep,
  releaseTarget,
} from "../website/disc-motion.js";

const root = fileURLToPath(new URL("../website/", import.meta.url));
const html = readFileSync(path.join(root, "index.html"), "utf8");
const normalizedHtml = html.replace(/\s+/g, " ");
const css = readFileSync(path.join(root, "site.css"), "utf8");
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
    existsSync(path.resolve(root, target)),
    `Missing local resource ${target}`,
  );
}
for (const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g))
  assert(
    existsSync(path.resolve(root, match[1])),
    `Missing CSS asset ${match[1]}`,
  );
assert(
  !/https?:\/\/[^"'\s]*21st/.test(html + css),
  "Third-party preview dependencies must not ship",
);
assert(!html.includes("—"), "Unexpected em dash in product copy");
assert.equal(
  (html.match(/data-support\s+href="https:\/\/yapp.ink\/fensulix"/g) || [])
    .length,
  3,
  "All support links must use the configured destination",
);
assert.equal(
  [...html.matchAll(/<div class="actions">([\s\S]*?)<\/div>/g)].filter(
    (match) =>
      /Download for\s+Windows/.test(match[1]) &&
      match[1].includes('class="button button-support"'),
  ).length,
  2,
  "Support must remain next to the hero and section downloads",
);
assert(
  normalizedHtml.includes("only Controller Lab is included") &&
    normalizedHtml.includes("Website simulation."),
  "Bundled content and simulated input must be clear",
);
for (const name of ["site.js", "space.js", "disc-motion.js"])
  execFileSync(process.execPath, ["--check", path.join(root, name)], {
    stdio: "pipe",
  });
for (const file of [
  "assets/collection.webp",
  "assets/controller-lab.webp",
  "assets/controller-studio.webp",
])
  assert(
    statSync(path.join(root, file)).size < 200000,
    "Screenshot exceeds its transfer budget",
  );
const workflow = readFileSync(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8",
);
assert(
  workflow.includes("path: website"),
  "Pages must upload only the public website",
);
const options = {
  spacing: 1.02,
  rise: 0.24,
  depth: 0.42,
  yaw: 22,
  fan: -10,
  roll: 110,
};
for (let position = -300; position <= 300; position += 0.25) {
  const index = indexAt(position, 3, true);
  assert(index >= 0 && index < 3);
  for (let item = 0; item < 3; item++) {
    const offset = offsetOf(item, position, 3, true);
    assert(Math.abs(offset) <= 1.5);
    const pose = poseOf(offset, offset, options);
    assert([pose.x, pose.y, pose.z, pose.yaw].every(Number.isFinite));
  }
}
const spring = springOf(0.22, 0.9);
let position = 0,
  velocity = 0;
for (let i = 0; i < 240; i++)
  [position, velocity] = springStep(
    position,
    velocity,
    1,
    spring.omega,
    spring.slide,
    1 / 60,
  );
assert(
  Math.abs(position - 1) < 0.001 && Math.abs(velocity) < 0.001,
  "Carousel spring must settle",
);
assert(
  Math.abs(releaseTarget(0, 1000, 3, true)) <= 3,
  "Rapid swipe must have a bounded destination",
);
console.log(
  "PASS website assets, anchors, support placement, content boundaries, module syntax, screenshot budgets, deployment scope and carousel navigation/spring checks.",
);
