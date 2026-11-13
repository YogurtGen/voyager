import { chromium, expect } from "playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const output = path.join(root, ".local", "voyager-theme-check");
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "index.html"),
  '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0"><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>',
);
await fs.writeFile(
  path.join(output, "entry.tsx"),
  `
import React from "react";
import {createRoot} from "react-dom/client";
import {LibraryWorkspace} from "../../src/renderer/library-workspace";
import {newLocalGame} from "../../src/shared/studio-model";
import {GAMES} from "../../src/shared/types";
import {transitionUI} from "../../src/renderer/scene-transition";
import "../../src/renderer/ui";
const game = newLocalGame();
game.title = "Voyager theme fixture";
game.inputMethod = "keyboard";
game.controller.theme = {...game.controller.theme, background:"#292019",button:"#7a3930",text:"#fff0db",accent:"#e3ae71"};
const state = {version:1,epoch:1,phase:"home",players:[],selectedGameId:game.id,heroMode:"detail",displayMode:"shared",profile:"menu",native:{available:false,status:"unavailable",controls:"menu",focused:false,gamepad:{available:false}},pairingLocked:false,search:"",libraryView:"all",favorites:[],recent:[],muted:true,serverTime:Date.now(),feedback:{sequence:0,sound:"move"},pending:[],pairing:{url:"http://127.0.0.1:8787/controller",code:"123456",expiresAt:Date.now()+120000},network:{address:"127.0.0.1",port:8787,interfaces:[],status:"online"},catalog:[...GAMES,{id:game.id,title:game.title,description:"Theme fixture",runtime:"native",local:true,availability:"available",minPlayers:1,maxPlayers:1,displayModes:["shared"],controllerProfile:"gamepad"}]};
const fixtures=Array.from({length:10},(_,i)=>({key:"fixture:"+i,store:i%2?"steam":"epic",storeId:String(100+i),name:i===1?"A longer installed game name for checking readable list rows":"Voyager imported game "+(i+1),directory:"X:/Fixture Library/Game "+i,executable:"X:/Fixture Library/Game "+i+"/game.exe",executables:["X:/Fixture Library/Game "+i+"/game.exe"],alreadyAdded:i===4,needsReview:false}));
window.waterconsole={getState:async()=>state,command:async()=>({ok:true}),onState:()=>()=>{},getFullscreen:async()=>false,toggleFullscreen:async()=>false,minimize(){},quit(){},library:async c=>{
 if(c.type==="list")return {ok:true,games:[game]};
 if(c.type==="storage")return {ok:true,config:{directory:"X:/Voyager fixture data"}};
 if(c.type==="capabilities")return {ok:true,config:{keyboard:true,gamepad:false}};
 if(c.type==="scan-stores")return {ok:true,scan:{games:fixtures,notes:[]}};
 if(c.type==="running-windows")return {ok:true,windows:Array.from({length:40},(_,i)=>({pid:42+i,title:"Voyager running game "+i+" · "+"Long multilingual title 航海者 ".repeat(5),executable:"X:/Fixture/"+"A very long folder name/".repeat(8)+"game-"+i+".exe"}))};
 return {ok:true};
}};
const studio=new URLSearchParams(location.search).has("studio");
function App(){const [open,setOpen]=React.useState(true),[initialStudio,setInitialStudio]=React.useState(studio);return open?<LibraryWorkspace gameId={studio?game.id:undefined} openStudio={initialStudio} state={state as any} onClose={()=>transitionUI(()=>{setInitialStudio(false);setOpen(false);},"panel")}/>:<button onClick={()=>transitionUI(()=>setOpen(true),"panel")}>Add game</button>;}
createRoot(document.getElementById("root")!).render(<App/>);
`,
);
const vite = await createServer({
  configFile: false,
  root: output,
  plugins: [react()],
  publicDir: path.join(root, "assets/public"),
  server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root] } },
  logLevel: "error",
});
await vite.listen();
let browser;
const errors = [],
  checks = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = vite.resolvedUrls.local[0];
  await page.goto(origin);
  await expect(
    page.getByRole("heading", { name: "Add a game", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".guide-card")).toBeVisible();
  await page.screenshot({ path: path.join(output, "01-add-game-guide.png") });
  await page
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await page.screenshot({ path: path.join(output, "02-add-game.png") });
  for (let i = 1; i < 5; i++) {
    await page.locator(".builder-steps>button").nth(i).click();
    await expect(page.locator(".builder-step-body")).toBeVisible();
    await page.screenshot({ path: path.join(output, `03-step-${i + 1}.png`) });
  }
  checks.push(
    "All five Add Game steps and its tutorial render with real source components",
  );
  await page.locator(".builder-steps>button").first().click();
  await page
    .getByRole("button", { name: "Scan Steam & Epic", exact: true })
    .click();
  await expect(page.locator(".store-game-row")).toHaveCount(10);
  await page.locator(".store-game-row").nth(1).click();
  await page.screenshot({ path: path.join(output, "04-store-picker.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: path.join(output, "05-store-picker-720.png") });
  const picker = await page.locator(".store-game-picker").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: innerHeight };
  });
  assert.ok(picker.top >= 8 && picker.bottom <= picker.height - 8);
  checks.push("Store importer selection and footer fit at 1280×720");
  await page.goto(origin);
  const tour=page.getByRole("button",{name:"Skip tutorial",exact:true});
  if(await tour.isVisible())await tour.click();
  await page.getByRole("button",{name:"Choose running game",exact:true}).click();
  const running=page.getByRole("dialog",{name:"Choose running game",exact:true});
  await expect(running.locator(".running-game-choice")).toHaveCount(40);
  for(const size of [{width:1024,height:640},{width:1280,height:720},{width:1600,height:1000}]) {
    await page.setViewportSize(size);
    const rows=await running.locator(".running-game-choice").evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,contained:[...el.querySelectorAll("strong,.running-game-file,small")].every(child=>{const c=child.getBoundingClientRect();return c.top>=r.top&&c.bottom<=r.bottom&&c.right<=r.right;})}}));
    assert.ok(rows.every((row,i)=>row.height>=88&&row.contained&&(!i||row.top>=rows[i-1].bottom+7)));
    await expect(running.getByRole("button",{name:"Cancel",exact:true})).toBeInViewport();
    await expect(running.locator("footer")).toBeInViewport();
    const bounds=await running.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth,bottom:el.getBoundingClientRect().bottom,height:innerHeight}));
    assert.ok(bounds.scroll<=bounds.width&&bounds.bottom<=bounds.height);
    await page.screenshot({path:path.join(output,`running-games-${size.width}.png`)});
  }
  await running.getByRole("textbox",{name:"Find a window"}).fill("running game 39 ·");
  await expect(running.locator(".running-game-choice")).toHaveCount(1);
  await running.locator(".running-game-choice").click();
  await expect(running).toHaveCount(0);
  checks.push("40 running-window rows keep title/process/path inside separate 88px rows, with search and footer usable at 640p/720p/1000p");
  await page.goto(origin + "?studio=1");
  await expect(page.locator(".controller-studio")).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Skip tutorial", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Skip tutorial", exact: true })
      .click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({
    path: path.join(output, "06-controller-studio.png"),
  });
  const canvas = await page
    .locator(".studio-surface")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(
    canvas,
    "rgb(41, 32, 25)",
    "Authored canvas color remains independent of the Voyager editor chrome",
  );
  const surfaces = await page
    .locator(
      ".game-builder,.controller-studio,.studio-palette,.studio-inspector,.builder-panel,.store-game-picker,.guide-card",
    )
    .evaluateAll((elements) =>
      elements.map((el) => ({
        class: el.className,
        color: getComputedStyle(el).backgroundColor,
      })),
    );
  assert.ok(
    surfaces.every(
      (row) =>
        !/^rgb\((\d+), (\d+), (\d+)\)$/.test(row.color) ||
        (() => {
          const [, r, g, b] = row.color
            .match(/^rgb\((\d+), (\d+), (\d+)\)$/)
            .map(Number);
          return b >= g || Math.max(r, g, b) - Math.min(r, g, b) < 4;
        })(),
    ),
    "App chrome must not retain the old green surface palette",
  );
  checks.push(
    "Studio navy chrome preserves a deliberately warm authored controller canvas",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: path.join(output, "07-controller-studio-720.png"),
  });
  await page.evaluate(() => {
    window.__panelChecks = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = function (update) {
      const kind = document.documentElement.dataset.sceneTransition,
        t = start(update);
      t.ready
        .then(() => window.__panelChecks.push({ kind, ready: true }))
        .catch((e) =>
          window.__panelChecks.push({ kind, ready: false, error: e.message }),
        );
      return t;
    };
  });
  await page
    .locator(".studio-editor-header")
    .getByRole("button", { name: /Game setup/ })
    .click();
  await expect(page.locator(".game-builder")).toBeVisible();
  await page.locator(".builder-steps>button").nth(3).click();
  await page.locator('[data-guide="open-studio"]').click();
  await expect(page.locator(".controller-studio")).toBeVisible();
  await page
    .locator(".studio-editor-header")
    .getByRole("button", { name: /Game setup/ })
    .click();
  await expect(page.locator(".game-builder")).toBeVisible();
  await page
    .locator(".builder-header")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add game", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await expect(page.locator(".game-builder")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  const panels = await page.evaluate(() => window.__panelChecks);
  assert.ok(panels.some((t) => t.kind === "studio" && t.ready));
  assert.ok(panels.some((t) => t.kind === "panel" && t.ready));
  assert.deepEqual(
    panels.filter((t) => !t.ready),
    [],
  );
  checks.push(
    "Controller Studio and Add/Edit game animate in both directions without rejected snapshots",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify({ checks, errors, surfaces }, null, 2),
  );
  checks.forEach((check) => console.log("PASS " + check));
  console.log("Screenshots: " + output);
} finally {
  await browser?.close();
  await vite.close();
}
