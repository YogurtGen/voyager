import { chromium, expect } from "playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd(),
  output = path.resolve(".local/voyager-binding-check");
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "index.html"),
  '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>',
);
await writeFile(
  path.join(output, "entry.tsx"),
  `
import React from "react";
import {createRoot} from "react-dom/client";
import {VisualBinding} from "../../src/renderer/visual-binding";
import {newLocalGame} from "../../src/shared/studio-model";
import "../../src/renderer/ui";
const initial=newLocalGame();initial.inputMethod="keyboard";
initial.controller.theme={...initial.controller.theme,background:"#292019",button:"#7a3930",text:"#fff0db",accent:"#e3ae71"};
function App(){const[game,setGame]=React.useState(initial);window.__bindingGame=game;const mode=game.controller.modes[0],control=mode.controls.find(c=>c.kind==="button")!;
return <div className="builder-overlay"><VisualBinding game={game} modeId={mode.id} controlId={control.id} initialSlot={1} onClose={()=>{}} onCommit={fn=>setGame(current=>{const next=structuredClone(current);fn(next);return next;})}/></div>;}
createRoot(document.getElementById("root")!).render(<App/>);`,
);
const vite = await createServer({
  configFile: false,
  root: output,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root] } },
  logLevel: "error",
});
await vite.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [],
  errors = [],
  palettes = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(vite.resolvedUrls.local[0]);
  await expect(
    page.getByRole("dialog", { name: "Visual input binding" }),
  ).toBeVisible();
  const theme = await page.evaluate(
    () => window.__bindingGame.controller.theme,
  );
  const key = page.getByRole("button", { name: "Bind Z", exact: true });
  const before = (await key.getAttribute("class")).includes("assigned");
  await key.click();
  if (before) await expect(key).not.toHaveClass(/assigned/);
  else await expect(key).toHaveClass(/assigned/);
  checks.push(
    "Keyboard assignments still toggle through the real draft callback",
  );
  for (const model of ["keyboard", "xbox", "playstation"]) {
    await page.getByLabel("Visual model", { exact: true }).selectOption(model);
    const palette = await page
      .locator(".visual-binding-overlay")
      .evaluate((el) => {
        const read = (selector, property) =>
          [...el.querySelectorAll(selector)].map(
            (node) => getComputedStyle(node)[property],
          );
        return {
          surface: read(".hardware-scroll,.hardware-info", "backgroundColor"),
          keys: read(
            ".hardware-key:not(.shared):not(.is-shared) > rect,.hardware-key:not(.shared):not(.is-shared) > circle",
            "fill",
          ),
          shell: read(".hardware-keyboard-shell", "fill"),
          stops: read(".hardware-shell-start,.hardware-shell-end", "stopColor"),
          callouts: read(".hardware-callouts text", "fill"),
        };
      });
    assert.deepEqual(palette.surface, ["rgb(11, 18, 38)", "rgb(22, 36, 61)"]);
    for (const color of [
      ...palette.keys,
      ...palette.shell,
      ...palette.stops,
      ...palette.callouts,
    ]) {
      const values = color.match(/\d+/g)?.map(Number);
      assert.ok(
        values && values[2] >= values[1],
        `${model}: legacy green ${color}`,
      );
    }
    palettes.push({ model, ...palette });
    await page.screenshot({ path: path.join(output, `${model}-1600.png`) });
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: path.join(output, `${model}-720.png`) });
    await page.setViewportSize({ width: 1600, height: 1000 });
  }
  assert.deepEqual(
    await page.evaluate(() => window.__bindingGame.controller.theme),
    theme,
  );
  checks.push(
    "Keyboard, Xbox and PlayStation diagrams use Voyager navy/blue, including shells, callouts and info panels at 720p/1000p",
  );
  checks.push(
    "Authored phone controller colors remain unchanged by editor theming",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify({ checks, palettes, errors }, null, 2),
  );
  checks.forEach((check) => console.log("PASS " + check));
} finally {
  await browser.close();
  await vite.close();
}
