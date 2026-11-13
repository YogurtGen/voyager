import { chromium, expect } from "playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd(), output = path.join(root, ".local/controller-input-check");
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "index.html"), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(output, "entry.tsx"), `
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {StudioSurface} from "../../src/renderer/studio-surface";
import {VisualBinding} from "../../src/renderer/visual-binding";
import {newLocalGame} from "../../src/shared/studio-model";
import {resolveBindings} from "../../src/shared/studio-engine";
import {keyboardModel,gamepadModel} from "../../src/shared/device-models";
import "../../src/renderer/voyager-review.css";
function App(){const[game,setGame]=useState(newLocalGame),[binding,setBinding]=useState(false),[mode,setMode]=useState("standard"),[variant,setVariant]=useState("classic"),[slot,setSlot]=useState(1),[epoch,setEpoch]=useState(0);
window.__game=game;window.__keyboard=keyboardModel();window.__pads={xbox:gamepadModel(),playstation:gamepadModel(true)};
window.__configure=(value)=>{if(value.backend||value.labels)setGame(g=>({...g,inputMethod:value.backend??g.inputMethod,controller:{...g.controller,labels:value.labels??g.controller.labels}}));if(value.mode)setMode(value.mode);if(value.variant)setVariant(value.variant);if(value.slot)setSlot(value.slot);setEpoch(e=>e+1);};
const control=game.controller.modes.find(m=>m.id===mode).controls.find(c=>c.kind==="button");
window.__openBinding=()=>setBinding(true);
window.__resolve=(input)=>resolveBindings(game.controller,game.bindings,game.inputMethod,slot,input);
window.__probeBinding=()=>resolveBindings(game.controller,game.bindings,game.inputMethod,slot,{revision:game.controller.revision,modeId:mode,variant,pressed:[control.id],values:{}});
return <><div style={{position:"fixed",inset:0,height:"100vh"}}><StudioSurface definition={game.controller} modeId={mode} variant={variant} slot={slot} epoch={epoch} onInput={input=>{window.__input=input;window.__output=resolveBindings(game.controller,game.bindings,game.inputMethod,slot,input);}}/></div>{binding&&<VisualBinding game={game} modeId={mode} controlId={control.id} initialSlot={slot} onClose={()=>setBinding(false)} onCommit={fn=>setGame(g=>{const next=structuredClone(g);fn(next);return next;})}/>}</>;}
createRoot(document.getElementById("root")).render(<App/>);
`);
const vite = await createServer({ configFile: false, root: output, plugins: [react()], publicDir: path.join(root, "assets/public"), server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root] } }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [], frames = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(vite.resolvedUrls.local[0]);
  await page.getByRole("button", { name: "LT", exact: true }).waitFor();
  const lt = await page.getByRole("button", { name: "LT", exact: true }).boundingBox();
  await page.mouse.move(lt.x + lt.width / 2, lt.y + lt.height / 2);
  await page.mouse.down();
  const before = await page.evaluate(() => window.__output);
  await writeFile(path.join(output, "trigger-tap.json"), JSON.stringify(before, null, 2));
  assert.equal(before.axes.lt, 1, "A normal center press on LT must fully engage the trigger");
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__output.axes.lt)).toBe(0);
  checks.push("LT center press engages fully and release returns to zero");
  const neutral = async () => {
    const out = await page.evaluate(() => window.__output);
    assert.deepEqual(out.buttons, []);
    assert.deepEqual(out.keys, []);
    assert.ok(Object.values(out.axes).every(value => value === 0));
  };
  const configure = async value => {
    await page.evaluate(value => window.__configure(value), value);
    await page.waitForTimeout(30);
  };
  const point = async (label, x = .5, y = .5) => {
    const button = await page.getByRole("button", { name: label, exact: true }).boundingBox();
    assert.ok(button, label);
    return { x: button.x + button.width * x, y: button.y + button.height * y, button };
  };
  for (const labels of ["xbox", "playstation"]) for (const backend of ["gamepad", "keyboard"]) {
    await configure({ labels, backend });
    for (const [width, height] of [[844, 390], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(50);
      for (const [label, axis, key] of [["LT", "lt", "Q"], ["RT", "rt", "E"]]) {
        for (const fraction of [.1, .5, .9]) {
          const p = await point(label, fraction);
          await page.mouse.move(p.x, p.y); await page.mouse.down();
          let out = await page.evaluate(() => window.__output);
          if (backend === "gamepad") assert.equal(out.axes[axis], 1, `${labels} ${width} ${label} ${fraction}`);
          else assert.deepEqual(out.keys, [key]);
          await page.mouse.move(p.x + 2, p.y + 1);
          out = await page.evaluate(() => window.__output);
          if (backend === "gamepad") assert.equal(out.axes[axis], 1, "Small touch movement must not weaken a press");
          await page.mouse.move(p.x + 2, p.y + 20);
          out = await page.evaluate(() => window.__output);
          if (backend === "gamepad") assert.equal(out.axes[axis], 1, "Movement perpendicular to the slider must not weaken a press");
          await page.mouse.up(); await neutral();
        }
        const p = await point(label, .75);
        await page.mouse.move(p.x, p.y); await page.mouse.down();
        await page.mouse.move(p.button.x + p.button.width * .25, p.y);
        const out = await page.evaluate(() => window.__output);
        if (backend === "gamepad") assert.ok(Math.abs(out.axes[axis] - .25) < .02, "Intentional trigger dragging retains analog control");
        else assert.deepEqual(out.keys, []);
        await page.mouse.up(); await neutral();
        await page.getByRole("button", { name: label, exact: true }).focus();
        await page.keyboard.down("Space");
        const keyOut = await page.evaluate(() => window.__output);
        if (backend === "gamepad") assert.equal(keyOut.axes[axis], 1);
        else assert.deepEqual(keyOut.keys, [key]);
        await page.keyboard.up("Space"); await neutral();
      }
    }
  }
  checks.push("Xbox/PlayStation LT/RT work at both orientations, three tap positions, small jitter, analog dragging, keyboard activation and release for both backends");
  await page.setViewportSize({ width: 844, height: 390 });
  await configure({ backend: "gamepad", labels: "xbox" });
  const touch = await page.context().newCDPSession(page);
  const l = await point("LT"), r = await point("RT");
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: l.x, y: l.y, id: 1 }, { x: r.x, y: r.y, id: 2 }] });
  await expect.poll(() => page.evaluate(() => [window.__output.axes.lt, window.__output.axes.rt])).toEqual([1, 1]);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x: l.x, y: l.y, id: 1 }] });
  await expect.poll(() => page.evaluate(() => [window.__output.axes.lt, window.__output.axes.rt])).toEqual([0, 1]);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await neutral();
  checks.push("Independent multi-touch triggers: releasing LT preserves held RT");
  for (const labels of ["xbox", "playstation"]) {
    await configure({ labels, backend: "gamepad" });
    for (const [label, button] of [["Y", "y"], ["X", "x"], ["B", "b"], ["A", "a"], ["LB", "l"], ["RB", "r"], ["Back", "select"], ["Start", "start"]]) {
      const p = await point(label); await page.mouse.move(p.x, p.y); await page.mouse.down();
      assert.deepEqual((await page.evaluate(() => window.__output)).buttons, [button]);
      await page.mouse.up(); await neutral();
    }
    for (const [label, xAxis, yAxis] of [["Left stick", "lx", "ly"], ["Right stick", "rx", "ry"]]) {
      for (const [x, y] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) {
        const p = await point(label, .5 + x * .4, .5 - y * .4);
        await page.mouse.move(p.x, p.y); await page.mouse.down();
        const out = await page.evaluate(() => window.__output);
        assert.equal(Math.sign(out.axes[xAxis]), x); assert.equal(Math.sign(out.axes[yAxis]), y);
        await page.mouse.up(); await neutral();
      }
    }
    for (const [x, y, expected] of [[-1, 0, ["left"]], [1, 0, ["right"]], [0, 1, ["up"]], [0, -1, ["down"]], [-1, 1, ["left", "up"]], [1, -1, ["down", "right"]]]) {
      const p = await point("D-pad", .5 + x * .35, .5 - y * .35);
      await page.mouse.move(p.x, p.y); await page.mouse.down();
      assert.deepEqual((await page.evaluate(() => window.__output)).buttons.sort(), expected.sort());
      await page.mouse.up(); await neutral();
    }
  }
  checks.push("Every standard face/shoulder/menu button, both sticks in both directions and D-pad diagonals emit the correct gamepad output and release cleanly");
  const bits = { up: 1, down: 2, left: 4, right: 8, start: 16, select: 32, ls: 64, rs: 128, l: 256, r: 512, a: 4096, b: 8192, x: 16384, y: 32768 };
  const zeros = () => ({ lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });
  const canonical = key => ({ Shift: "ShiftLeft", Control: "ControlLeft", Alt: "AltLeft" })[key] ?? key;
  const remember = (name, actual, expected) => { assert.deepEqual(actual, expected, name); frames.push({ name, output: actual, bits: actual.buttons.reduce((mask, button) => mask | bits[button], 0) }); };
  await page.setViewportSize({ width: 1600, height: 1000 });
  await configure({ labels: "xbox", backend: "gamepad" });
  await page.evaluate(() => window.__openBinding());
  const dialog = page.getByRole("dialog", { name: "Visual input binding" });
  await expect(dialog).toBeVisible();
  for (const device of ["xbox", "playstation", "keyboard"]) {
    await dialog.getByLabel("Visual model", { exact: true }).selectOption(device);
    const models = await page.evaluate(device => device === "keyboard" ? window.__keyboard : window.__pads[device], device);
    let assigned = 0, reserved = 0;
    for (const [i, target] of models.entries()) {
      await dialog.getByRole("button", { name: "Clear this control", exact: true }).click();
      const hot = dialog.locator(".hardware-key").nth(i);
      if (device !== "keyboard" && target.pair) {
        const bounds = await hot.boundingBox();
        await hot.click({ position: { x: bounds.width * .22, y: bounds.height * .22 } });
        await expect(dialog.getByRole("status")).toContainText("Select a phone analog");
        continue;
      }
      await hot.click({ force: !target.output && !(device === "keyboard" && target.code) });
      const actual = await page.evaluate(() => window.__probeBinding());
      const expected = { buttons: [], keys: [], axes: zeros() };
      const output = device === "keyboard" && target.code ? { kind: "key", code: target.code } : target.output;
      if (output) {
        assigned++;
        if (output.kind === "button") expected.buttons = [output.code];
        if (output.kind === "key") expected.keys = [canonical(output.code)];
        if (output.kind === "axis") expected.axes[output.code] = output.value;
      } else {
        reserved++;
        await expect(hot).toHaveAttribute("aria-disabled", "true");
      }
      remember(`${device}: ${target.label}`, actual, expected);
      if (output) {
        await hot.press("Enter");
        const neutralOut = await page.evaluate(() => window.__probeBinding());
        assert.deepEqual(neutralOut, { buttons: [], keys: [], axes: zeros() });
      }
    }
    checks.push(`${device}: ${assigned} assignable inputs checked by real pointer/keyboard interaction, ${reserved} system inputs correctly unavailable`);
  }
  checks.push("Binding diagram edits round-trip through the actual action resolver, including L3/R3, trigger axes, stick directions and every supported ANSI104 key");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, nativeFrames: frames.length, errors }, null, 2));
} finally {
  await writeFile(path.join(output, "report.json"), JSON.stringify({ checks, frames, errors }, null, 2));
  await browser.close();
  await vite.close();
}
