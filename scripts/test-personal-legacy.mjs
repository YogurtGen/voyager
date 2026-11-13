import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const output = path.resolve(".local/brawlhalla-ui");
await mkdir(output, { recursive: true });
const vite = await createServer({
  configFile: false,
  root: path.resolve("src/renderer"),
  plugins: [react()],
  publicDir: path.resolve("assets/public"),
  server: { host: "127.0.0.1", port: 0, hmr: false },
  logLevel: "error",
});
await vite.listen();
const origin = vite.resolvedUrls.local[0].replace(/\/$/, "");
let browser;
const checks = [],
  errors = [];
function fixture(options = {}) {
  const count =
    options.mode === "shared" ? 1 : options.mode === "split-2" ? 2 : 4;
  return {
    version: 1,
    epoch: 100,
    phase: "native",
    players: [1, 2, 3, 4].map((slot) => ({
      id: "p" + slot,
      slot,
      name: "Driver " + slot,
      color: ["#b7ed80", "#f9ac88", "#b0b2f7", "#ffdc87"][slot - 1],
      connected: true,
      ready: false,
      canNavigate: slot === 1,
      buttons: [],
      axes: { x: 0, y: 0 },
      position: { x: 0.5, y: 0.5 },
      pressCount: 0,
    })),
    selectedGameId: options.gameId || "brawlhalla",
    heroMode: "detail",
    displayMode: options.mode || "shared",
    profile: options.profile || "brawlhalla",
    native: {
      available: true,
      games: {
        "idol-showdown": true,
        "hotwheels-unleashed": true,
        "disney-speedstorm": true,
        brawlhalla: true,
      },
      gameId: options.gameId || "brawlhalla",
      status: "running",
      controls: options.controls || "menu",
      focused: true,
      gamepad: { available: options.available !== false },
    },
    pairingLocked: false,
    search: "",
    libraryView: "all",
    favorites: [],
    recent: [],
    muted: true,
    serverTime: Date.now(),
    feedback: { sequence: 0, sound: "move" },
    pending: [],
    pairing: {
      url: origin + "/controller",
      code: "123456",
      expiresAt: Date.now() + 120000,
    },
    network: {
      address: "127.0.0.1",
      port: 1234,
      interfaces: [],
      status: "online",
    },
  };
}
async function phone(options = {}) {
  const state = fixture(options),
    sent = [],
    sockets = [];
  const context = await browser.newContext({
    viewport: options.viewport || { width: 812, height: 375 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(
    ({ blockedStorage }) => {
      sessionStorage.setItem("waterconsole.token", "fixture-only");
      window.__vibrations = [];
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (duration) => {
          window.__vibrations.push(duration);
          return true;
        },
      });
      if (blockedStorage)
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get() {
            throw new DOMException("Storage unavailable", "SecurityError");
          },
        });
    },
    { blockedStorage: !!options.blockedStorage },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.routeWebSocket("**/ws", (socket) => {
    sockets.push(socket);
    socket.onMessage((message) => {
      const frame = JSON.parse(String(message));
      sent.push(frame);
      if (frame.type === "auth")
        socket.send(
          JSON.stringify({
            type: "authenticated",
            playerId: "p" + (options.slot || 1),
            state,
          }),
        );
      if (frame.type === "ping")
        socket.send(
          JSON.stringify({ type: "pong", id: frame.id, at: frame.at }),
        );
      if (frame.type === "native-layout") {
        state.displayMode = frame.mode;
        state.epoch++;
        socket.send(JSON.stringify({ type: "state", state }));
      }
      if (frame.type === "native-controls") {
        state.native.controls = frame.mode;
        state.epoch++;
        socket.send(JSON.stringify({ type: "state", state }));
      }
    });
  });
  await page.goto(origin + "/controller.html");
  await page
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  return {
    page,
    state,
    sent,
    context,
    latestInput: () => sent.findLast((frame) => frame.type === "input"),
    disconnect: () =>
      sockets.at(-1).close({ code: 1011, reason: "fixture disconnect" }),
    emit: (frame) => {
      for (const socket of sockets) socket.send(JSON.stringify(frame));
    },
    update: async (patch) => {
      Object.assign(state, patch);
      for (const socket of sockets)
        socket.send(JSON.stringify({ type: "state", state }));
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    },
  };
}

try{browser=await chromium.launch({channel:'chrome',headless:true});
for(const spec of [
{gameId:'idol-showdown',profile:'idol',controls:'fight'},
{gameId:'hotwheels-unleashed',profile:'racing',controls:'race',mode:'split-2'},
{gameId:'disney-speedstorm',profile:'speedstorm',controls:'race',mode:'split-4'},
{gameId:'brawlhalla',profile:'brawlhalla',controls:'fight'}]){
const p=await phone(spec);await p.page.getByRole('button',{name:'Controller settings',exact:true}).click();await p.page.getByRole('button',{name:'Adjust layout',exact:true}).click();await expect(p.page.getByRole('dialog',{name:'Adjust your controller layout'})).toBeVisible();const handles=p.page.locator('.personal-layout-handle');assert(await handles.count()>3,spec.profile+' has controls');const target=handles.last(),label=await target.getAttribute('aria-label'),r=await target.boundingBox();await p.page.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.page.mouse.down();await p.page.mouse.move(Math.max(45,r.x+r.width/2-45),r.y+r.height/2,{steps:6});await p.page.mouse.up();await p.page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(p.latestInput()?.buttons.length,0);const local=await p.page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('waterconsole.layout.v1.')));assert(local.some(([,v])=>v!=='{}'),spec.profile+' saves local layout');const buttons=p.page.locator('.touch-button:visible');const button=buttons.last(),action=await button.getAttribute('data-layout-id');await button.click();assert(p.sent.some(f=>f.type==='input'&&f.buttons.length>0),spec.profile+' still dispatches');await p.page.getByRole('button',{name:'Controller settings',exact:true}).click();await p.page.getByRole('button',{name:'Adjust layout',exact:true}).click();await p.page.getByRole('button',{name:'Reset',exact:true}).click();await p.page.getByRole('button',{name:'Done',exact:true}).click();checks.push(spec.gameId+': move, save, neutral, preserved button action, reset');await p.context.close();}
assert.deepEqual(errors,[]);await writeFile(path.join(output,'personal-legacy-report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser?.close();await vite.close();}
