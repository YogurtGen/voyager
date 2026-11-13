import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";

const output = path.resolve(".local/hotwheels-haptics-ui");
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
const checks = [],
  errors = [];
let browser;
function fixture(options = {}) {
  const idol = options.game === "idol-showdown";
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
    selectedGameId: idol ? "idol-showdown" : "hotwheels-unleashed",
    heroMode: "detail",
    displayMode: idol || options.split === false ? "shared" : "split-2",
    profile: idol ? "idol" : "racing",
    native: {
      available: true,
      gameId: idol ? "idol-showdown" : "hotwheels-unleashed",
      status: "running",
      controls: idol ? "fight" : "race",
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
  };
}
async function phone(options = {}) {
  const state = fixture(options),
    sockets = [],
    sent = [];
  const context = await browser.newContext({
    viewport: { width: 812, height: 375 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(
    ({ unsupported, denied }) => {
      sessionStorage.setItem("waterconsole.token", "fixture-only");
      window.__feedbackEvents = [];
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: unsupported
          ? undefined
          : (duration) => {
              window.__feedbackEvents.push({
                type: "vibrate",
                duration,
                at: performance.now(),
              });
              if (denied) throw new Error("Vibration denied by browser");
              return true;
            },
      });
    },
    { unsupported: !!options.unsupported, denied: !!options.denied },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
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
    });
  });
  await page.goto(origin + "/controller.html");
  await expect(
    page.getByRole("button", { name: "Enter controller", exact: true }),
  ).toBeVisible();
  const emit = async (frame) => {
    for (const socket of sockets) socket.send(JSON.stringify(frame));
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  const enter = async () => {
    await page
      .getByRole("button", { name: "Enter controller", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Controller settings", exact: true }),
    ).toBeVisible();
  };
  if (options.enter !== false) await enter();
  return {
    page,
    state,
    context,
    sent,
    emit,
    enter,
    disconnect: () =>
      sockets.at(-1).close({ code: 1011, reason: "fixture disconnect" }),
    vibes: () =>
      page.evaluate(() =>
        window.__feedbackEvents
          .filter((event) => event.type === "vibrate")
          .map((event) => event.duration),
      ),
    update: async (patch) => {
      Object.assign(state, patch);
      await emit({ type: "state", state });
    },
    rumble: (durationMs, epoch = state.epoch) =>
      emit({ type: "haptics", epoch, durationMs }),
  };
}
const positive = (values) => values.filter((value) => value > 0);
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const p1 = await phone({ enter: false });
  await p1.rumble(80);
  assert.deepEqual(positive(await p1.vibes()), []);
  await p1.enter();
  await p1.page.getByRole("button", { name: "Boost", exact: true }).click();
  assert.deepEqual(positive(await p1.vibes()), [30]);
  assert(
    p1.sent.some(
      (frame) => frame.type === "input" && frame.buttons.includes("x"),
    ),
  );
  await p1.rumble(90);
  assert.deepEqual(positive(await p1.vibes()), [30]);
  checks.push(
    "No rumble before Enter; boost emits semantic input and an immediate 30ms pulse; nearby game rumble is suppressed",
  );

  await p1.page.waitForTimeout(150);
  await p1.rumble(90);
  assert.deepEqual(positive(await p1.vibes()), [30, 90]);
  await p1.page.waitForTimeout(90);
  await p1.rumble(500);
  assert.deepEqual(positive(await p1.vibes()), [30, 90, 140]);
  await p1.rumble(60, 99);
  assert.deepEqual(positive(await p1.vibes()), [30, 90, 140]);
  await p1.rumble(0);
  assert.equal((await p1.vibes()).at(-1), 0);
  checks.push(
    "Matching-epoch native rumble works, is bounded to140ms, stale epochs are ignored, zero stops",
  );

  for (const [name, patch] of [
    ["epoch", { epoch: 101 }],
    ["layout", { displayMode: "shared", epoch: 102 }],
    ["profile", { profile: "menu", epoch: 103 }],
  ]) {
    await p1.rumble(80);
    await p1.update(patch);
    assert.equal((await p1.vibes()).at(-1), 0, name);
  }
  await p1.update({
    profile: "racing",
    displayMode: "split-2",
    epoch: 104,
    native: { ...p1.state.native, focused: true },
  });
  await p1.rumble(80);
  await p1.page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await p1.vibes()).at(-1), 0);
  await p1.rumble(80);
  await p1.page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal((await p1.vibes()).at(-1), 0);
  const beforeHidden = positive(await p1.vibes()).length;
  await p1.rumble(80);
  assert.equal(positive(await p1.vibes()).length, beforeHidden);
  await p1.page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    }),
  );
  await p1.update({
    native: { ...p1.state.native, focused: false },
    epoch: 105,
  });
  await p1.rumble(80);
  assert.equal(positive(await p1.vibes()).length, beforeHidden);
  checks.push(
    "Epoch/layout/profile changes, blur, and page hiding stop vibration; hidden or game-unfocused rumble is ignored",
  );

  await p1.update({
    native: { ...p1.state.native, focused: true },
    epoch: 106,
  });
  await p1.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    p1.page.getByRole("dialog", { name: "Controller settings" }),
  ).toBeVisible();
  await p1.page
    .getByRole("button", { name: "Phone vibration", exact: true })
    .click();
  await expect(
    p1.page.getByRole("button", { name: "Phone vibration", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  assert.equal(
    await p1.page.evaluate(() =>
      localStorage.getItem("waterconsole.vibration"),
    ),
    "off",
  );
  await expect(
    p1.page.getByRole("button", { name: "Test vibration", exact: true }),
  ).toBeDisabled();
  await p1.page.screenshot({
    path: path.join(output, "settings-off-landscape.png"),
  });
  await p1.page
    .getByRole("button", { name: "Close controller settings", exact: true })
    .click();
  const beforeMuted = positive(await p1.vibes()).length;
  await p1.rumble(80);
  await p1.page.getByRole("button", { name: "Boost", exact: true }).click();
  assert.equal(positive(await p1.vibes()).length, beforeMuted);
  await p1.page.reload();
  await p1.enter();
  await p1.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    p1.page.getByRole("button", { name: "Phone vibration", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await p1.page
    .getByRole("button", { name: "Phone vibration", exact: true })
    .click();
  await p1.page
    .getByRole("button", { name: "Test vibration", exact: true })
    .click();
  assert(positive(await p1.vibes()).includes(50));
  await p1.page.setViewportSize({ width: 393, height: 852 });
  await p1.page.screenshot({
    path: path.join(output, "settings-on-portrait.png"),
  });
  await p1.page
    .getByRole("button", { name: "Close controller settings", exact: true })
    .click();
  checks.push(
    "Per-phone off preference persists across reload, blocks boost/native pulses, and user test/on restores feedback in compact settings",
  );
  await p1.context.close();

  const disconnected = await phone();
  await disconnected.rumble(80);
  await disconnected.disconnect();
  await expect(
    disconnected.page.locator(".controller-reconnect"),
  ).toBeVisible();
  assert.equal((await disconnected.vibes()).at(-1), 0);
  await expect(
    disconnected.page.getByRole("button", { name: "Boost", exact: true }),
  ).toBeDisabled();
  checks.push(
    "WebSocket disconnect cancels vibration immediately and disables racing input",
  );
  await disconnected.context.close();

  const p2 = await phone({ slot: 2 });
  await p2.page.getByRole("button", { name: "Boost", exact: true }).click();
  assert.deepEqual(positive(await p2.vibes()), [30]);
  await p2.page.waitForTimeout(130);
  await p2.rumble(75);
  assert.deepEqual(positive(await p2.vibes()), [30, 75]);
  await p2.update({ displayMode: "shared", epoch: 101 });
  await p2.rumble(80);
  assert.deepEqual(positive(await p2.vibes()), [30, 75]);
  await p2.update({
    displayMode: "split-2",
    native: { ...p2.state.native, gamepad: { available: false } },
    epoch: 102,
  });
  await p2.rumble(80);
  assert.deepEqual(positive(await p2.vibes()), [30, 75]);
  checks.push(
    "P2 receives boost and native rumble only in enabled 2P; Solo and missing-driver P2 cannot vibrate from game packets",
  );
  await p2.context.close();

  const p3 = await phone({ slot: 3 });
  await p3.rumble(80);
  assert.deepEqual(positive(await p3.vibes()), []);
  await expect(
    p3.page.getByRole("button", { name: "Boost", exact: true }),
  ).toHaveCount(0);
  checks.push("Spectator P3 ignores native rumble and has no boost controller");
  await p3.context.close();

  const unsupported = await phone({ unsupported: true });
  await unsupported.rumble(80);
  await unsupported.page
    .getByRole("button", { name: "Boost", exact: true })
    .click();
  await unsupported.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    unsupported.page.getByRole("button", {
      name: "Phone vibration",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    unsupported.page.getByRole("button", {
      name: "Test vibration",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    unsupported.page.getByText(
      "This browser does not support phone vibration.",
      { exact: true },
    ),
  ).toBeVisible();
  await unsupported.page.screenshot({
    path: path.join(output, "unsupported.png"),
  });
  checks.push(
    "Unsupported browsers keep functional game input and show one quiet unavailable settings state",
  );
  await unsupported.context.close();

  const attackOptions = { game: "idol-showdown", available: false };
  const idolP1 = await phone(attackOptions);
  const idolP2 = await phone({ ...attackOptions, slot: 2 });
  for (const phone of [idolP1, idolP2]) {
    await phone.page.bringToFront();
    for (const label of ["A", "B", "X", "Y", "L", "R", "LT", "RT"]) {
      const count = positive(await phone.vibes()).length;
      await phone.page.waitForTimeout(85);
      await phone.page
        .getByRole("button", { name: label, exact: true })
        .click();
      const values = positive(await phone.vibes());
      assert.equal(values.length, count + 1);
      assert.equal(
        values.at(-1),
        ["A", "B", "X", "Y"].includes(label) ? 20 : 35,
      );
      assert(
        phone.sent.some(
          (frame) =>
            frame.type === "input" &&
            frame.buttons.includes(label.toLowerCase()),
        ),
      );
    }
  }
  checks.push(
    "Idol: approved P1 and non-navigator P2 receive 20ms face-button and35ms shoulder touch cues in Fight without a gamepad driver",
  );
  await idolP1.page.bringToFront();
  const beforePartner = positive(await idolP2.vibes()).length;
  for (const label of [
    "Up",
    "Down",
    "Left",
    "Right",
    "Start",
    "Select",
    "Confirm",
    "Back",
  ]) {
    const before = positive(await idolP1.vibes()).length;
    await idolP1.page.getByRole("button", { name: label, exact: true }).click();
    assert.equal(positive(await idolP1.vibes()).length, before);
  }
  await idolP1.page.waitForTimeout(90);
  const heldCount = positive(await idolP1.vibes()).length;
  const xBox = await idolP1.page
    .getByRole("button", { name: "X", exact: true })
    .boundingBox();
  await idolP1.page.mouse.move(
    xBox.x + xBox.width / 2,
    xBox.y + xBox.height / 2,
  );
  await idolP1.page.mouse.down();
  await idolP1.page.waitForTimeout(450);
  assert.equal(positive(await idolP1.vibes()).length, heldCount + 1);
  assert.equal(positive(await idolP2.vibes()).length, beforePartner);
  await idolP1.page.mouse.up();
  checks.push(
    "Idol: movement, pause and menu utilities stay quiet; holding an attack across heartbeats pulses once and never vibrates the other phone",
  );
  await idolP1.page.waitForTimeout(90);
  const comboBefore = positive(await idolP1.vibes()).length;
  const aBox = await idolP1.page
    .getByRole("button", { name: "A", exact: true })
    .boundingBox();
  const touch = await idolP1.context.newCDPSession(idolP1.page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: xBox.x + xBox.width / 2, y: xBox.y + xBox.height / 2, id: 1 },
      { x: aBox.x + aBox.width / 2, y: aBox.y + aBox.height / 2, id: 2 },
    ],
  });
  await expect
    .poll(() =>
      idolP1.sent.some(
        (frame) =>
          frame.type === "input" &&
          frame.buttons.includes("a") &&
          frame.buttons.includes("x"),
      ),
    )
    .toBe(true);
  assert.equal(positive(await idolP1.vibes()).length, comboBefore + 1);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect.poll(async () => (await idolP1.vibes()).at(-1)).toBe(0);
  assert.deepEqual(
    idolP1.sent.findLast((frame) => frame.type === "input").buttons,
    [],
  );
  await touch.detach();
  checks.push(
    "Idol: simultaneous attacks preserve both input actions while the60ms cue limiter prevents stacked buzz; touch cancellation stops vibration and releases input",
  );
  const beforePacket = positive(await idolP1.vibes()).length;
  await idolP1.rumble(120);
  assert.equal(positive(await idolP1.vibes()).length, beforePacket);
  for (const patch of [
    { native: { ...idolP1.state.native, controls: "menu" } },
    {
      native: {
        ...idolP1.state.native,
        controls: "fight",
        gameId: "hotwheels-unleashed",
      },
    },
    {
      native: {
        ...idolP1.state.native,
        controls: "fight",
        gameId: "idol-showdown",
      },
      phase: "home",
    },
  ]) {
    await idolP1.update({ ...patch, epoch: idolP1.state.epoch + 1 });
    await idolP1.page.getByRole("button", { name: "X", exact: true }).click();
    assert.equal(positive(await idolP1.vibes()).length, beforePacket);
  }
  await idolP1.update({ phase: "native", epoch: idolP1.state.epoch + 1 });
  for (const patch of [
    { focused: false },
    { status: "paused" },
    { quitting: true },
  ]) {
    await idolP1.update({
      native: {
        ...idolP1.state.native,
        focused: true,
        status: "running",
        quitting: false,
        ...patch,
      },
      epoch: idolP1.state.epoch + 1,
    });
    await expect(
      idolP1.page.getByRole("button", { name: "X", exact: true }),
    ).toBeDisabled();
    assert.equal(positive(await idolP1.vibes()).length, beforePacket);
  }
  await idolP1.update({
    native: {
      ...idolP1.state.native,
      focused: true,
      status: "running",
      quitting: false,
    },
    epoch: idolP1.state.epoch + 1,
  });
  checks.push(
    "Idol: Menus, mismatched game identity, inactive phase, paused/unfocused/closing game and incoming racing-rumble packets cannot produce attack feedback",
  );
  for (const kind of ["epoch", "blur", "hidden"]) {
    await idolP1.page.waitForTimeout(90);
    await idolP1.page.getByRole("button", { name: "X", exact: true }).click();
    if (kind === "epoch")
      await idolP1.update({ epoch: idolP1.state.epoch + 1 });
    if (kind === "blur")
      await idolP1.page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (kind === "hidden")
      await idolP1.page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    assert.equal((await idolP1.vibes()).at(-1), 0);
  }
  const hiddenCount = positive(await idolP1.vibes()).length;
  await idolP1.page.getByRole("button", { name: "X", exact: true }).click();
  assert.equal(positive(await idolP1.vibes()).length, hiddenCount);
  await idolP1.page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    }),
  );
  checks.push(
    "Idol: epoch changes, blur and hidden pages cancel feedback immediately; a hidden page cannot pulse from an attack",
  );
  await idolP1.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    idolP1.page.getByText("Touch feedback for attack buttons in Fight mode.", {
      exact: true,
    }),
  ).toBeVisible();
  await idolP1.page
    .getByRole("button", { name: "Phone vibration", exact: true })
    .click();
  await idolP1.page
    .getByRole("button", { name: "Close controller settings", exact: true })
    .click();
  const mutedCount = positive(await idolP1.vibes()).length;
  await idolP1.page.getByRole("button", { name: "X", exact: true }).click();
  assert.equal(positive(await idolP1.vibes()).length, mutedCount);
  await idolP1.page.reload();
  await idolP1.enter();
  await idolP1.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    idolP1.page.getByRole("button", { name: "Phone vibration", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await idolP1.page
    .getByRole("button", { name: "Phone vibration", exact: true })
    .click();
  await idolP1.page
    .getByRole("button", { name: "Test vibration", exact: true })
    .click();
  await idolP1.page.screenshot({
    path: path.join(output, "idol-settings.png"),
  });
  assert(positive(await idolP1.vibes()).includes(50));
  await idolP1.page
    .getByRole("button", { name: "Close controller settings", exact: true })
    .click();
  await idolP1.disconnect();
  await expect(idolP1.page.locator(".controller-reconnect")).toBeVisible();
  assert.equal((await idolP1.vibes()).at(-1), 0);
  await expect(
    idolP1.page.getByRole("button", { name: "X", exact: true }),
  ).toBeDisabled();
  checks.push(
    "Idol: per-phone Off persists after reload, On/Test restores feedback, and disconnect cancels vibration and disables attacks",
  );
  await idolP1.context.close();
  await idolP2.context.close();
  for (const slot of [3, 4]) {
    const spectator = await phone({ ...attackOptions, slot });
    await spectator.rumble(80);
    assert.deepEqual(positive(await spectator.vibes()), []);
    await expect(
      spectator.page.getByRole("button", { name: "X", exact: true }),
    ).toHaveCount(0);
    await spectator.context.close();
  }
  checks.push(
    "Idol: spectator P3/P4 have no attack controls and ignore unsolicited native rumble",
  );
  for (const unsupported of [true, false]) {
    const fallback = await phone({
      ...attackOptions,
      unsupported,
      denied: !unsupported,
    });
    await fallback.page.getByRole("button", { name: "X", exact: true }).click();
    assert(
      fallback.sent.some(
        (frame) => frame.type === "input" && frame.buttons.includes("x"),
      ),
    );
    if (unsupported) assert.deepEqual(positive(await fallback.vibes()), []);
    await fallback.context.close();
  }
  checks.push(
    "Idol: unsupported or throwing vibration APIs leave attack input working without page errors",
  );

  assert.deepEqual(errors, []);
  const report = {
    checks,
    errors,
    limitation:
      "Browser fixture records navigator.vibrate calls. It does not prove physical vibration, native collision telemetry, real two-player gamepad rumble, or Android device support.",
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
