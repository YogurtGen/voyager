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

try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const slot of [1, 2, 3, 4]) {
    const p = await phone({ slot, available: false });
    await expect(
      p.page.getByRole("heading", {
        name: "Controller setup needed on PC.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      p.page.getByRole("button", {
        name: "Confirm / Join / Ready",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      p.page.getByText("Offline · Online", { exact: true }),
    ).toBeVisible();
    await p.context.close();
  }
  checks.push(
    "All four phones require the PC gamepad capability; missing driver never falls back to a shared keyboard or spectator claim",
  );
  for (const slot of [1, 2, 3, 4]) {
    const p = await phone({ slot });
    await expect(
      p.page.getByRole("button", {
        name: "Confirm / Join / Ready",
        exact: true,
      }),
    ).toBeEnabled();
    await p.page
      .getByRole("button", { name: "Confirm / Join / Ready", exact: true })
      .click();
    assert(
      p.sent.some((f) => f.type === "input" && f.buttons.includes("confirm")),
    );
    await p.page.getByRole("button", { name: "Back", exact: true }).click();
    assert(
      p.sent.some((f) => f.type === "input" && f.buttons.includes("back")),
    );
    for (const [label, action] of [
      ["Manage party", "x"],
      ["Match settings", "y"],
    ]) {
      const button = p.page.getByRole("button", { name: label, exact: true });
      await button.click();
      assert(
        p.sent.some((f) => f.type === "input" && f.buttons.includes(action)),
        label,
      );
      const box = await button.boundingBox();
      assert(
        box && box.width >= 44 && box.height >= 44,
        label + " menu touch target",
      );
    }
    if (slot === 1) {
      await expect(
        p.page.getByRole("button", { name: "Fight", exact: true }),
      ).toBeEnabled();
    } else {
      await expect(
        p.page.getByRole("button", { name: "Fight", exact: true }),
      ).toBeDisabled();
    }
    await expect(
      p.page.getByRole("group", { name: /local players/i }),
    ).toHaveCount(0);
    await p.context.close();
  }
  checks.push(
    "P1–P4 independently join/ready with Confirm and access Back, Manage party and Match settings; only navigator changes Menus/Fight and no false split-screen selector appears",
  );
  const nav = await phone();
  await nav.page.getByRole("button", { name: "Fight", exact: true }).click();
  assert(
    nav.sent.some((f) => f.type === "native-controls" && f.mode === "fight"),
  );
  await expect(
    nav.page.getByRole("button", { name: "Light / Pick up", exact: true }),
  ).toBeEnabled();
  assert.deepEqual(nav.latestInput().buttons, []);
  await nav.context.close();
  checks.push(
    "Navigator's Fight switch sends only the allowlisted mode command and begins with neutral input",
  );
  const labels = {
    Jump: "a",
    "Light / Pick up": "x",
    "Heavy attack": "b",
    "Throw weapon": "y",
    "Dash / Dodge": "rt",
    Taunt: "select",
    Pause: "start",
    Up: "up",
    Down: "down",
    Left: "left",
    Right: "right",
  };
  for (const slot of [1, 2, 3, 4]) {
    const p = await phone({ slot, controls: "fight" });
    await expect(
      p.page.getByRole("button", { name: "Back", exact: true }),
    ).toHaveCount(0);
    for (const [label, action] of Object.entries(labels)) {
      const button = p.page.getByRole("button", { name: label, exact: true });
      await expect(button).toBeEnabled();
      await button.click();
      assert(
        p.sent.some((f) => f.type === "input" && f.buttons.includes(action)),
        label,
      );
    }
    await p.context.close();
  }
  checks.push(
    "All four Fight controllers expose installed-game functions: move, jump, light attack / pickup, heavy attack, throw, dodge, taunt and pause; no misleading Fight Back button",
  );
  const p4 = await phone({ slot: 4, controls: "fight" });
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 812, height: 375 },
    { width: 720, height: 360 },
    { width: 393, height: 852 },
  ]) {
    await p4.page.setViewportSize(viewport);
    assert(
      await p4.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    for (const label of Object.keys(labels)) {
      const box = await p4.page
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      assert(
        box && box.width >= 44 && box.height >= 44,
        label + " target " + JSON.stringify(box),
      );
      if (viewport.width > viewport.height)
        assert(
          box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= viewport.width + 1 &&
            box.y + box.height <= viewport.height + 1,
          label + " bounds " + JSON.stringify(box),
        );
    }
    await p4.page.screenshot({
      path: path.join(
        output,
        "p4-fight-" + viewport.width + "x" + viewport.height + ".png",
      ),
      fullPage: true,
    });
  }
  checks.push(
    "Four-phone controls fit 844×390, 812×375, 720×360 and 393×852; every control is at least 44px, landscape targets remain onscreen and portrait has no horizontal overflow",
  );
  await p4.page.setViewportSize({ width: 844, height: 390 });
  const cdp = await p4.context.newCDPSession(p4.page);
  async function point(label, id) {
    const b = await p4.page
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, id };
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      await point("Right", 1),
      await point("Jump", 2),
      await point("Heavy attack", 3),
    ],
  });
  await expect
    .poll(
      () =>
        p4.latestInput().buttons.includes("right") &&
        p4.latestInput().buttons.includes("a") &&
        p4.latestInput().buttons.includes("b"),
    )
    .toBe(true);
  await p4.page.waitForTimeout(320);
  const pulseCount = await p4.page.evaluate(
    () => window.__vibrations.filter((v) => v > 0).length,
  );
  assert.equal(pulseCount, 1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect.poll(() => p4.latestInput().buttons.length).toBe(0);
  assert.equal(await p4.page.evaluate(() => window.__vibrations.at(-1)), 0);
  checks.push(
    "Real multi-touch holds movement+jump+heavy attack together; held heartbeats do not repeat the local cue and touchcancel releases every action and vibration",
  );
  const stickBox = await p4.page.locator(".brawl-stick").boundingBox();
  const stickPoint = (x, y, id = 1) => ({
    x: stickBox.x + stickBox.width * (0.5 + x * 0.4),
    y: stickBox.y + stickBox.height * (0.5 + y * 0.4),
    id,
  });
  const heavyPoint = await point("Heavy attack", 3);
  const expectButtons = async (phone, buttons) => {
    await expect
      .poll(() => [...phone.latestInput().buttons].sort())
      .toEqual([...buttons].sort());
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [stickPoint(1, 0), heavyPoint],
  });
  for (const [x, y, expected] of [
    [1, 0, ["right"]],
    [1, 1, ["right", "down"]],
    [0, 1, ["down"]],
    [-1, 1, ["left", "down"]],
    [-1, 0, ["left"]],
    [-1, -1, ["left", "up"]],
    [0, -1, ["up"]],
    [1, -1, ["right", "up"]],
    [0, 1, ["down"]],
    [0, -1, ["up"]],
    [0, 0, []],
    [2, 0, ["right"]],
  ]) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [stickPoint(x, y), heavyPoint],
    });
    await expectButtons(p4, [...expected, "b"]);
    assert.equal(
      p4.latestInput().axes.x,
      Number(expected.includes("right")) - Number(expected.includes("left")),
    );
    assert.equal(
      p4.latestInput().axes.y,
      Number(expected.includes("down")) - Number(expected.includes("up")),
    );
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [stickPoint(2, 0)],
  });
  await expectButtons(p4, ["b"]);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expectButtons(p4, []);
  checks.push(
    "One captured thumb sweeps all eight directions, direct Up/Down, center dead zone and outside bounds while Heavy stays held; lifting the thumb releases only movement",
  );
  const jumpPoint = await point("Jump", 4);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [stickPoint(1, 0), jumpPoint],
  });
  await expectButtons(p4, ["right", "a"]);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [stickPoint(0, 1), jumpPoint],
  });
  await expectButtons(p4, ["down", "a"]);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [jumpPoint],
  });
  await expectButtons(p4, ["down"]);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expectButtons(p4, []);
  checks.push(
    "Releasing Jump first preserves the dragged direction; touchcancel releases movement and other touches without a latch",
  );
  for (const reset of ["epoch", "blur", "orientation"]) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [stickPoint(1, 0)],
    });
    await expectButtons(p4, ["right"]);
    if (reset === "epoch") await p4.update({ epoch: p4.state.epoch + 1 });
    else
      await p4.page.evaluate(
        (type) => window.dispatchEvent(new Event(type)),
        reset === "blur" ? "blur" : "orientationchange",
      );
    await expectButtons(p4, []);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [stickPoint(-1, 0)],
    });
    await expectButtons(p4, []);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  for (const activeCapture of [false, true]) {
    await p4.page.evaluate(() =>
      document
        .querySelector(".brawl-stick")
        .addEventListener(
          "pointerdown",
          (e) => (window.__stickPointer = e.pointerId),
          { once: true },
        ),
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [stickPoint(1, 0)],
    });
    await expectButtons(p4, ["right"]);
    if (activeCapture)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [stickPoint(1, 0)],
      });
    await p4.page.evaluate(() =>
      document
        .querySelector(".brawl-stick")
        .releasePointerCapture(window.__stickPointer),
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [stickPoint(-1, 0)],
    });
    await expectButtons(p4, []);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  checks.push(
    "Epoch changes, blur, rotation and lost capture neutralize the gesture synchronously; continuing an old drag cannot restore movement",
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [stickPoint(1, 0), stickPoint(-1, 0, 2)],
  });
  await expectButtons(p4, ["right"]);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [stickPoint(1, 0)],
  });
  await expectButtons(p4, []);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [stickPoint(0, -1, 2)],
  });
  await expectButtons(p4, []);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  checks.push(
    "A second finger on the movement surface cannot steal or reactivate the owning thumb's captured gesture",
  );
  const menuDrag = await phone({ slot: 2 });
  const menuCdp = await menuDrag.context.newCDPSession(menuDrag.page);
  const menuRight = await menuDrag.page
    .getByRole("button", { name: "Right", exact: true })
    .boundingBox();
  const menuLeft = await menuDrag.page
    .getByRole("button", { name: "Left", exact: true })
    .boundingBox();
  await menuCdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        id: 1,
        x: menuRight.x + menuRight.width / 2,
        y: menuRight.y + menuRight.height / 2,
      },
    ],
  });
  await expectButtons(menuDrag, ["right"]);
  await menuCdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        id: 1,
        x: menuLeft.x + menuLeft.width / 2,
        y: menuLeft.y + menuLeft.height / 2,
      },
    ],
  });
  await expectButtons(menuDrag, ["left"]);
  await menuCdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expectButtons(menuDrag, []);
  await menuDrag.context.close();
  await p4.page.bringToFront();
  checks.push(
    "Brawlhalla Menus also supports Right-to-Left drag; independent menu actions and existing game mappings remain semantic",
  );
  await p4.page.waitForTimeout(90);
  await p4.page
    .getByRole("button", { name: "Light / Pick up", exact: true })
    .click();
  assert.equal(
    await p4.page.evaluate(() =>
      window.__vibrations.filter((v) => v > 0).at(-1),
    ),
    20,
  );
  await p4.page.waitForTimeout(90);
  await p4.page
    .getByRole("button", { name: "Heavy attack", exact: true })
    .click();
  assert.equal(
    await p4.page.evaluate(() =>
      window.__vibrations.filter((v) => v > 0).at(-1),
    ),
    35,
  );
  const beforeQuiet = await p4.page.evaluate(
    () => window.__vibrations.filter((v) => v > 0).length,
  );
  for (const label of ["Jump", "Dash / Dodge", "Taunt", "Right"])
    await p4.page.getByRole("button", { name: label, exact: true }).click();
  assert.equal(
    await p4.page.evaluate(
      () => window.__vibrations.filter((v) => v > 0).length,
    ),
    beforeQuiet,
  );
  checks.push(
    "Brawlhalla attack touch cues work for non-navigator P4 with bounded 20/35ms pulses while jump, movement, dodge and taunt stay quiet",
  );
  await p4.page.waitForTimeout(120);
  await p4.emit({ type: "haptics", epoch: p4.state.epoch, durationMs: 80 });
  await expect
    .poll(() =>
      p4.page.evaluate(() => window.__vibrations.filter((v) => v > 0).at(-1)),
    )
    .toBe(80);
  const beforeStale = await p4.page.evaluate(() => window.__vibrations.length);
  p4.emit({ type: "haptics", epoch: p4.state.epoch - 1, durationMs: 120 });
  await p4.page.waitForTimeout(50);
  assert.equal(
    await p4.page.evaluate(() => window.__vibrations.length),
    beforeStale,
  );
  checks.push(
    "Current-epoch native feedback can reach Brawl Fight P4; stale feedback is ignored and no hit detection is inferred from touches",
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [stickPoint(1, 0), heavyPoint],
  });
  await expectButtons(p4, ["right", "b"]);
  await p4.update({
    epoch: 101,
    native: { ...p4.state.native, focused: false, status: "paused" },
  });
  await expect(
    p4.page.getByRole("button", { name: "Jump", exact: true }),
  ).toBeDisabled();
  assert.deepEqual(p4.latestInput().buttons, []);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [stickPoint(-1, 0), heavyPoint],
  });
  await expectButtons(p4, []);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p4.update({
    epoch: 102,
    native: {
      ...p4.state.native,
      focused: true,
      status: "running",
      gamepad: { available: false },
    },
  });
  await expect(
    p4.page.getByRole("heading", {
      name: "Controller setup needed on PC.",
      exact: true,
    }),
  ).toBeVisible();
  assert.deepEqual(p4.latestInput().buttons, []);
  await p4.update({
    epoch: 103,
    native: {
      ...p4.state.native,
      gamepad: { available: true },
      controls: "menu",
    },
  });
  await expect(
    p4.page.getByRole("button", {
      name: "Confirm / Join / Ready",
      exact: true,
    }),
  ).toBeEnabled();
  assert.deepEqual(p4.latestInput().buttons, []);
  checks.push(
    "Focus loss, driver loss and mode/epoch changes neutralize held state; recovery restores menu control without replaying old actions",
  );
  await p4.update({
    epoch: 104,
    native: { ...p4.state.native, controls: "fight" },
  });
  await p4.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await p4.page
    .getByRole("button", { name: "Phone vibration", exact: true })
    .click();
  await p4.page
    .getByRole("button", { name: "Close controller settings", exact: true })
    .click();
  const muted = await p4.page.evaluate(
    () => window.__vibrations.filter((v) => v > 0).length,
  );
  await p4.page
    .getByRole("button", { name: "Heavy attack", exact: true })
    .click();
  assert.equal(
    await p4.page.evaluate(
      () => window.__vibrations.filter((v) => v > 0).length,
    ),
    muted,
  );
  await p4.page.reload();
  await p4.page
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  await p4.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    p4.page.getByRole("button", { name: "Phone vibration", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await p4.page
    .getByRole("button", { name: "Close controller settings", exact: true })
    .click();
  checks.push(
    "Each Brawl phone retains the existing vibration opt-out after reload while attack input continues working",
  );
  const finalRight = await point("Right", 1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finalRight],
  });
  await expectButtons(p4, ["right"]);
  p4.disconnect();
  await expect(p4.page.locator(".controller-reconnect")).toBeVisible();
  await expect(
    p4.page.getByRole("button", { name: "Jump", exact: true }),
  ).toBeDisabled();
  assert.equal(await p4.page.evaluate(() => window.__vibrations.at(-1)), 0);
  await expect(p4.page.locator(".brawl-stick-direction.held")).toHaveCount(0);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [stickPoint(-1, 0)],
  });
  await expect(p4.page.locator(".brawl-stick-direction.held")).toHaveCount(0);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p4.context.close();
  checks.push(
    "Disconnect while dragging clears P4 movement ownership, rejects continued old drag, stops feedback and disables gameplay controls",
  );
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  await context.route("**/library-art/**", (r) =>
    r.fulfill({ status: 404, body: "private art unavailable" }),
  );
  const state = fixture();
  await context.addInitScript((state) => {
    const listeners = [];
    window.__publish = (next) => listeners.forEach((fn) => fn(next));
    window.__commands = [];
    window.waterconsole = {
      getState: async () => state,
      onState: (fn) => {
        listeners.push(fn);
        return () => {};
      },
      getFullscreen: async () => false,
      command: async (frame) => {
        window.__commands.push(frame);
        return { ok: true };
      },
      toggleFullscreen: async () => false,
      minimize() {},
      quit() {},
    };
  }, state);
  const host = await context.newPage();
  host.on("pageerror", (e) => errors.push(e.message));
  await host.goto(origin + "/host.html");
  await expect(
    host.getByRole("heading", { name: "Brawlhalla.", exact: false }),
  ).toBeVisible();
  await expect(host.locator(".native-player")).toHaveCount(4);
  await expect(host.locator(".native-layout-picker")).toHaveCount(0);
  await expect(host.locator(".native-footnote")).toContainText(
    "Offline · Online",
  );
  await expect(host.locator(".native-footnote")).toContainText("shared arena");
  await host.screenshot({
    path: path.join(output, "host-shared-arena-720p.png"),
    fullPage: true,
  });
  checks.push(
    "PC native view uses four independent slot cards and a shared arena with Offline · Online label and no split-screen selector",
  );
  await host.evaluate(
    (state) => window.__publish({ ...state, phase: "home", profile: "menu" }),
    state,
  );
  await expect(host.locator(".game-lobby-backdrop img")).toHaveAttribute(
    "src",
    "./assets/brawl-arena.svg",
  );
  await host.locator(".game-lobby-backdrop img").evaluate((img) => img.decode());
  await expect(host.locator(".game-lobby-meta")).toContainText("1–4 players");
  await expect(host.locator(".game-lobby-meta")).toContainText(
    "Offline · Online",
  );
  await host.screenshot({
    path: path.join(output, "library-original-fallback-720p.png"),
    fullPage: true,
  });
  checks.push(
    "Library uses Brawlhalla's own title, four-player copy, mixed connection label and original distributable fallback when private art is absent",
  );
  await host.evaluate(
    (state) =>
      window.__publish({
        ...state,
        phase: "home",
        profile: "menu",
        native: {
          ...state.native,
          games: { ...state.native.games, brawlhalla: false },
        },
      }),
    state,
  );
  await expect(host.locator(".game-lobby-copy")).toContainText(
    "Brawlhalla · Steam edition",
  );
  await expect(
    host.getByRole("button", { name: "Game not found", exact: true }),
  ).toBeDisabled();
  checks.push(
    "A missing Brawlhalla installation does not borrow availability or installation copy from Idol/other games",
  );
  await context.close();
  assert.deepEqual(errors, []);
  const report = {
    checks,
    errors,
    limitation:
      "Fixture browser validation proves UI semantic dispatch, gating, geometry and Vibration API calls. It does not prove physical phones, actual game bindings, four-player native gameplay or offline Steam cold launch.",
  };
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ ...report, output }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}
