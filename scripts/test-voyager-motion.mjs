import { chromium, expect } from "playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd(),
  output = path.join(root, ".local/voyager-motion-check");
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "index.html"),
  '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>',
);
await writeFile(
  path.join(output, "entry.tsx"),
  `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {VoyagerLibrary, Starfield, StartupReveal} from "../../src/renderer/voyager";
import {Brand} from "../../src/renderer/ui";
import {transitionUI} from "../../src/renderer/scene-transition";
import {GAMES, EMPTY_LIBRARY_FILTERS} from "../../src/shared/types";
import {DEFAULT_PRESENTATION} from "../../src/shared/presentation";
import "../../src/renderer/voyager-review.css";
const base = [...GAMES];
const longTitle = "The Legend of Heroes: Trails through Daybreak II — Digital Deluxe Edition · 航海者の記録 🚀".padEnd(120, " II").slice(0,120);
const longDescription = ("Explore a distant system with your crew. Choose your route, prepare your ship and uncover the story beyond the outer colonies. ").repeat(20).slice(0,2000);
const worst = base.map((g,i)=>({...g, title:i===0?longTitle:i===1?"Batman™: Arkham Knight":i===2?"星の旅人 — 遠い世界への航海":g.title,description:i<2?longDescription:g.description}));
const state0 = {version:1,epoch:1,phase:"home",players:[],selectedGameId:base[0].id,heroMode:"featured",displayMode:"shared",profile:"menu",native:{available:true,status:"ready",controls:"menu",focused:false,games:Object.fromEntries(base.map(g=>[g.id,true])),gamepad:{available:true}},pairingLocked:false,search:"",libraryView:"all",libraryFilters:EMPTY_LIBRARY_FILTERS,favorites:[],recent:[],muted:true,serverTime:Date.now(),feedback:{sequence:0,sound:"move"},pending:[],pairing:{url:"http://127.0.0.1:8787/controller",code:"123456",expiresAt:Date.now()+120000},network:{address:"127.0.0.1",port:8787,interfaces:[],status:"online"},catalog:base};
window.waterconsole={library:async()=>({ok:true,games:[]}),command:async()=>({ok:true})};
function Artwork({gameId}) { const g=base.find(g=>g.id===gameId);return gameId.includes("missing")?<div className="custom-art-placeholder"><strong>No artwork</strong></div>:<img draggable="false" alt="" src={"/assets/"+(g?.controllerProfile==="racing"?"racing-track":g?.controllerProfile==="speedstorm"?"speedway-circuit":g?.controllerProfile==="brawlhalla"?"brawl-arena":"lab-world")+".svg"}/>; }
function App(){
 const debug = new URLSearchParams(location.search).has("debug");
 const [state,setState]=useState(state0),[mode,setMode]=useState("Demo data"),[motion,setMotion]=useState("full"),[opening,setOpening]=useState(new URLSearchParams(location.search).has("opening")),[added,setAdded]=useState(false);
 const value={settings:{...DEFAULT_PRESENTATION,motion,startupSound:false,music:false},games:{}};
 document.documentElement.dataset.motion=motion;
 function fixture(name){let catalog=name==="Empty"?[]:name==="One"?[base[0]]:/^\\d+ games$/.test(name)?Array.from({length:parseInt(name)},(_,i)=>({...base[i%base.length],id:"missing-"+i,title:i%4===0?"Batman™: Arkham Knight · The Complete Collection — Expedition "+(i+1):"Voyager Archive · Expedition "+(i+1)})):name==="Worst case"?worst:base;setMode(name);setState({...state0,catalog,selectedGameId:catalog[0]?.id||""});}
 function send(c){const update=()=>setState(s=> c.type==="browseGame"?{...s,selectedGameId:c.gameId}:c.type==="selectGame"?{...s,selectedGameId:c.gameId,heroMode:"detail"}:c.type==="navigate"?{...s,heroMode:"featured"}:c.type==="setSearch"?{...s,search:c.query}:c.type==="setView"?{...s,libraryView:c.view}:c.type==="setFilters"?{...s,libraryFilters:c.filters}:c.type==="toggleFavorite"?{...s,favorites:s.favorites.includes(c.gameId)?s.favorites.filter(id=>id!==c.gameId):[...s.favorites,c.gameId]}:s);if(c.type==="selectGame"||c.type==="navigate")transitionUI(update,"disc");else update();}
 window.__fixtureSend=send;
 return <>
  <Starfield/>
  <header className="host-header" style={{height:74,padding:"12px 28px",position:"relative"}}><Brand/></header>
  <VoyagerLibrary state={state as any} value={value as any} send={send} onAdd={()=>setAdded(true)} onEdit={()=>{}} onMedia={()=>{}} onPlayers={()=>{}} openPair={()=>{}} Artwork={Artwork} suspended={false}/>
  {debug&&<aside data-testid="fixture-controls" style={{position:"fixed",zIndex:999,bottom:6,left:8,background:"#10192a",border:"1px solid #344a6b",padding:8,borderRadius:8,fontSize:11,display:"flex",gap:8}}>
   <label>Demo data <select aria-label="Demo data" value={mode} onChange={e=>fixture(e.target.value)}>{["Demo data","Worst case","Empty","One","200 games","1000 games"].map(x=><option key={x}>{x}</option>)}</select></label>
   <label>Motion <select aria-label="Fixture motion" value={motion} onChange={e=>setMotion(e.target.value)}><option>full</option><option>reduced</option></select></label>
   <button onClick={()=>setOpening(true)}>Replay opening</button>
  </aside>}
  {added&&<div role="status" style={{position:"fixed",top:8,right:8}}>Add game clicked</div>}
  {opening&&<StartupReveal ready value={value as any} muted onDone={()=>setOpening(false)}/>}
 </>;
}
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
const origin = vite.resolvedUrls.local[0];
if (process.argv.includes("--serve")) {
  console.log(
    `Clean preview: ${origin}\nOptional test controls: ${origin}?debug=1\nNo real library or native launch.`,
  );
  await new Promise(() => {});
}
let browser;
const checks = [],
  errors = [];
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  async function capture(filename) {
    const controls = page.getByTestId("fixture-controls");
    if (await controls.count())
      await controls.evaluate((el) => (el.style.visibility = "hidden"));
    try {
      await page.screenshot({ path: path.join(output, filename) });
    } finally {
      if (await controls.count())
        await controls.evaluate((el) => (el.style.visibility = ""));
    }
  }
  await page.goto(origin + "?opening=1&debug=1");
  await expect(
    page.locator('.liquid-logo[data-renderer="webgl2"]'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".liquid-logo canvas")
        .evaluate((c) => c.width > 0 && c.height > 0),
    )
    .toBe(true);
  await expect(page.locator(".liquid-logo-wordmark")).toHaveAttribute("data-visible", "false");
  for (const [i, delay] of [350, 650, 1100].entries()) {
    await page.waitForTimeout(delay);
    await capture(`opening-${i + 1}.png`);
  }
  await expect(page.locator(".liquid-logo-wordmark")).toHaveAttribute("data-visible", "false");
  await expect(page.locator(".liquid-logo-wordmark")).toHaveAttribute("data-visible", "true", { timeout: 8000 });
  await expect.poll(()=>page.locator(".liquid-logo-wordmark").evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);
  await capture("opening-wordmark.png");
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog", { name: "Voyager opening" })).toBeVisible();
  assert.equal(
    await page.getByRole("button", { name: /Skip intro|^Mute$/ }).count(),
    0,
  );
  await expect(
    page.getByRole("dialog", { name: "Voyager opening" }),
  ).toHaveCount(0, { timeout: 12000 });
  checks.push(
    "WebGL2 logo plays before the wordmark appears; wordmark fades in and holds before automatic exit without Mute/Skip controls",
  );
  const active = () => page.locator(".collection-disc[data-active]");
  await page.evaluate(() => {
    window.__sceneChecks = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = function (update) {
      const kind = document.documentElement.dataset.sceneTransition,
        result = start(update);
      result.ready
        .then(() =>
          window.__sceneChecks.push({
            kind,
            ready: true,
            name: getComputedStyle(
              document.querySelector(
                ".lobby-disc .disc-body,.collection-disc[data-active] .disc-body",
              ),
            ).viewTransitionName,
          }),
        )
        .catch((e) =>
          window.__sceneChecks.push({ kind, ready: false, error: e.message }),
        );
      return result;
    };
  });
  const spinTime = () =>
    active()
      .locator(".disc-print")
      .evaluate((el) => el.getAnimations()[0]?.currentTime);
  const beforeSpin = await spinTime();
  await expect.poll(spinTime).toBeGreaterThan(beforeSpin + 80);
  assert.equal(await active().locator(".disc-face > .disc-hub").count(), 1);
  assert.match(
    await active()
      .locator(".disc-face")
      .evaluate((el) => getComputedStyle(el).maskImage),
    /16.6%/,
  );
  checks.push(
    "Selected disc spins; silver hub is inside the same transparent-hole mask as the printed face",
  );
  const add = page.getByRole("button", { name: "Add game", exact: true });
  const addStyle = await add.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return {
      height: r.height,
      width: r.width,
      padding: parseFloat(s.paddingLeft),
      border: s.borderColor,
      fontSize: s.fontSize,
    };
  });
  assert.ok(
    addStyle.height >= 40 && addStyle.width >= 105 && addStyle.padding >= 12,
  );
  assert.equal(addStyle.border, "rgb(60, 82, 111)");
  await add.click();
  await expect(page.getByRole("status")).toHaveText("Add game clicked");
  checks.push(
    "Add game has correct blue-gray border, spacing and working action",
  );
  await page.mouse.move(960, 600);
  const firstId = await active().getAttribute("aria-label");
  await page.mouse.down();
  await page.mouse.move(940, 600);
  await page.mouse.move(850, 600, { steps: 12 });
  await expect(page.locator(".voyager-collection")).toHaveAttribute(
    "data-dragging",
    "",
  );
  const drag1 = await page
    .locator(".collection-disc")
    .first()
    .evaluate((el) => el.style.transform);
  await page.mouse.move(805, 600, { steps: 8 });
  const drag2 = await page
    .locator(".collection-disc")
    .first()
    .evaluate((el) => el.style.transform);
  assert.notEqual(drag1, drag2);
  assert.equal(
    await active()
      .locator(".disc-print")
      .evaluate((el) => getComputedStyle(el).animationPlayState),
    "paused",
  );
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(page.locator(".voyager-collection")).not.toHaveAttribute(
    "data-dragging",
    "",
  );
  await expect(page.locator(".voyager-collection")).toBeVisible();
  await page.getByRole("button", { name: "Next game", exact: true }).click();
  await expect
    .poll(() => active().getAttribute("aria-label"))
    .not.toBe(firstId);
  await page.waitForTimeout(1800);
  checks.push(
    "Drag changes fractional transforms before release, pauses idle spin, settles and does not open a game accidentally",
  );
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 1024, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await expect(add).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Enter game lobby", exact: true }),
    ).toBeInViewport();
    await capture(`collection-${size.width}.png`);
  }
  await page
    .getByLabel("Demo data", { exact: true })
    .selectOption("Worst case");
  await expect(page.locator(".collection-details h1")).toHaveText(/The Legend/);
  await capture("worst-collection.png");
  await page
    .getByRole("button", { name: "Enter game lobby", exact: true })
    .click();
  const center = () =>
    page.locator(".lobby-disc").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        w: r.width,
        h: r.height,
      };
    });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  const c1 = await center();
  await page.getByRole("button", { name: "Next game", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  const c2 = await center();
  assert.deepEqual(c1, c2);
  const clearance = await page.evaluate(() => {
    const text = document.querySelector(".game-lobby-copy").getBoundingClientRect();
    const arrow = document.querySelector(".lobby-disc-stage .orbit-arrow").getBoundingClientRect();
    return { text: text.toJSON(), arrow: arrow.toJSON(), overlapping: text.left < arrow.right && text.right > arrow.left && text.top < arrow.bottom && text.bottom > arrow.top };
  });
  if(clearance.overlapping) {
    await capture("worst-lobby.png");
    await writeFile(path.join(output,"clearance.json"),JSON.stringify(clearance,null,2));
  }
  assert.ok(
    !clearance.overlapping,
    "Description must not sit underneath the disc navigation",
  );
  await expect(
    page.getByRole("button", { name: "Start game", exact: true }),
  ).toBeInViewport();
  await capture("worst-lobby.png");
  checks.push(
    "120-character mixed-script title, 2000-character description and lobby disc anchor checked at minimum host size",
  );
  await page.getByLabel("Demo data", { exact: true }).selectOption("Demo data");
  await page.getByLabel("Find a game", { exact: true }).fill("no-such-game");
  await expect(
    page.getByRole("heading", { name: "No games found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all games" }).click();
  await expect(page.locator(".collection-disc")).toHaveCount(5);
  await page.getByLabel("Demo data", { exact: true }).selectOption("Empty");
  await expect(
    page.getByRole("heading", { name: "No games found" }),
  ).toBeVisible();
  await page.getByLabel("Demo data", { exact: true }).selectOption("One");
  await expect(
    page.getByRole("button", { name: "Next game", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Demo data", { exact: true }).selectOption("200 games");
  assert.ok(await page.locator(".collection-disc").count() <= 26);
  await page.getByRole("button", { name: "Next game", exact: true }).click();
  await expect(active()).toHaveAttribute("aria-label", /Expedition 2 /);
  await page.getByLabel("Fixture motion").selectOption("reduced");
  assert.equal(
    await active()
      .locator(".disc-print")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.locator(".collection-controls summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".collection-controls")).toHaveAttribute(
    "open",
    "",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".collection-controls summary")).toBeFocused();
  checks.push(
    "Search reset, empty library, one game, 200 missing-art games, reduced motion and keyboard popup dismissal pass",
  );
  await page.getByLabel("Demo data", { exact: true }).selectOption("Demo data");
  await page.getByLabel("Fixture motion").selectOption("full");
  await page
    .getByRole("button", { name: "Enter game lobby", exact: true })
    .click();
  await expect(page.locator(".lobby-disc")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  await page.getByRole("button", { name: "Collection", exact: false }).click();
  await expect(page.locator(".voyager-collection")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  const transitions = await page.evaluate(() => window.__sceneChecks);
  assert.ok(
    transitions.filter((t) => t.ready && t.name === "voyager-disc").length >= 2,
  );
  assert.deepEqual(
    transitions.filter((t) => !t.ready),
    [],
  );
  checks.push(
    "Shared disc snapshots animate collection to lobby and back without duplicate names or rejected transitions",
  );
  await page.evaluate(()=>{
    const id=document.querySelector('.collection-disc[data-active]').getAttribute('aria-label');
    window.__fixtureSend({type:"selectGame",gameId:"hotwheels-unleashed"});
    window.__fixtureSend({type:"navigate",action:"back"});
  });
  await expect(page.locator(".voyager-collection")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.sceneTransition||"")).toBe("");
  await page.getByLabel("Fixture motion").selectOption("reduced");
  const beforeReduced=await page.evaluate(()=>window.__sceneChecks.length);
  await page.getByRole("button",{name:"Enter game lobby",exact:true}).click();
  await expect(page.locator(".lobby-disc")).toBeVisible();
  await page.getByRole("button",{name:"Collection",exact:false}).click();
  await expect(page.locator(".voyager-collection")).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__sceneChecks.length),beforeReduced);
  checks.push("Rapid opposite navigation leaves no pending snapshot; reduced motion bypasses spatial scene transitions");
  await page.goto(origin);
  await expect(page.getByTestId("fixture-controls")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Replay opening" }),
  ).toHaveCount(0);
  checks.push(
    "Default preview contains no test toolbar; fixture controls require explicit debug query and are hidden in captures",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify({ checks, errors, addStyle }, null, 2),
  );
  for (const check of checks) console.log("PASS " + check);
} finally {
  await browser?.close();
  await vite.close();
}
