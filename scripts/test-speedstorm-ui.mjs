import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { build as transform } from "esbuild";
import { chromium, expect } from "playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const output = path.resolve(".local/speedstorm-ui");
await mkdir(output, { recursive: true });
const compiled = await transform({
  entryPoints: ["src/electron/game-art.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { loadLocalGameArtwork } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const art = await loadLocalGameArtwork(
  path.resolve("Game 1/private-assets/library-art"),
  path.resolve("research/private/hotwheels/library-art"),
  path.resolve("research/private/disney-speedstorm/library-art"),
  undefined,
  path.resolve("library-art"),
);
assert(art.get("library-art/disney-speedstorm-cover")?.length > 0);
assert(art.get("library-art/disney-speedstorm-hero")?.length > 0);
assert(
  [...art.keys()].every((key) =>
    /^library-art\/(idol-showdown|hotwheels-unleashed|disney-speedstorm|brawlhalla)-(cover|hero)$/.test(
      key,
    ),
  ),
);
const checks = [
    "Desktop artwork loader reads private Steam cover/hero using fixed game/variant keys",
  ],
  errors = [];
const vite = await createServer({
  configFile: false,
  root: path.resolve("src/renderer"),
  plugins: [react()],
  publicDir: path.resolve("assets/public"),
  server: { host: "127.0.0.1", port: 0, hmr: false },
  logLevel: "error",
});
vite.middlewares.use((request, response, next) => {
  const key = (request.url || "").replace(/^\//, "");
  if (art.has(key)) {
    response.setHeader("Content-Type", "image/jpeg");
    response.end(art.get(key));
    return;
  }
  next();
});
await vite.listen();
const origin = vite.resolvedUrls.local[0].replace(/\/$/, "");
let browser;
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
    selectedGameId: options.gameId || "disney-speedstorm",
    heroMode: "detail",
    displayMode: options.mode || "split-4",
    profile: options.profile || "speedstorm",
    native: {
      available: true,
      games: {
        "idol-showdown": true,
        "hotwheels-unleashed": true,
        "disney-speedstorm": true,
      },
      gameId: options.gameId || "disney-speedstorm",
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
      p.page.getByRole("button", { name: "Confirm", exact: true }),
    ).toHaveCount(0);
    await p.context.close();
  }
  checks.push(
    "Driver is required for every Speedstorm phone, including P1; no keyboard fallback or spectator mislabel",
  );
  for (const slot of [1, 2, 3, 4]) {
    const p = await phone({ slot });
    await expect(
      p.page.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeEnabled();
    await p.page.getByRole("button", { name: "Confirm", exact: true }).click();
    assert(
      p.sent.some(
        (frame) => frame.type === "input" && frame.buttons.includes("confirm"),
      ),
    );
    await expect(
      p.page.getByText("Offline · Online", { exact: true }),
    ).toBeVisible();
    if (slot !== 1)
      await expect(
        p.page.getByRole("button", {
          name: "Four phones: Local Race",
          exact: true,
        }),
      ).toBeDisabled();
    if (slot === 4)
      await p.page.screenshot({
        path: path.join(output, "p4-menus-landscape.png"),
      });
    await p.context.close();
  }
  checks.push(
    "All four enabled slots have independent console menu input and Offline · Online label; non-navigators cannot change player count",
  );
  const nav = await phone();
  await nav.page
    .getByRole("button", { name: "Two phones: Local Race", exact: true })
    .click();
  assert(
    nav.sent.some(
      (frame) => frame.type === "native-layout" && frame.mode === "split-2",
    ),
  );
  await nav.page
    .getByRole("button", { name: "Four phones: Local Race", exact: true })
    .click();
  assert(
    nav.sent.some(
      (frame) => frame.type === "native-layout" && frame.mode === "split-4",
    ),
  );
  await nav.page.setViewportSize({ width: 393, height: 852 });
  assert(
    await nav.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  checks.push(
    "Navigator sends semantic split-2/split-4 commands; player-count toolbar fits phone portrait",
  );
  await nav.context.close();
  const waiting = await phone({ slot: 4, mode: "split-2" });
  await expect(
    waiting.page.getByRole("heading", {
      name: "Ready for Local Race.",
      exact: true,
    }),
  ).toBeVisible();
  await waiting.update({ displayMode: "split-4", epoch: 101 });
  await expect(
    waiting.page.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeEnabled();
  await waiting.update({
    native: { ...waiting.state.native, quitting: true },
    epoch: 102,
  });
  await expect(
    waiting.page.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeDisabled();
  await expect(
    waiting.page.getByRole("button", { name: "Closing game…", exact: true }),
  ).toBeDisabled();
  checks.push(
    "Disabled player slots wait honestly; enabling4P grants controller, quitting disables input and preserves native screen",
  );
  await waiting.context.close();

  const feedback = await phone({ slot: 4, controls: "race" });
  feedback.emit({ type: "haptics", epoch: 100, durationMs: 85 });
  await expect
    .poll(() =>
      feedback.page.evaluate(() =>
        window.__vibrations.filter((value) => value > 0),
      ),
    )
    .toEqual([85]);
  feedback.emit({ type: "haptics", epoch: 99, durationMs: 90 });
  await feedback.update({ displayMode: "split-2", epoch: 101 });
  feedback.emit({ type: "haptics", epoch: 101, durationMs: 90 });
  await feedback.page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.deepEqual(
    await feedback.page.evaluate(() =>
      window.__vibrations.filter((value) => value > 0),
    ),
    [85],
  );
  assert.equal(
    await feedback.page.evaluate(() => window.__vibrations.at(-1)),
    0,
  );
  checks.push(
    "P4 game feedback reaches only enabled current-epoch racing slot; changing player limit stops and rejects further feedback",
  );
  await feedback.context.close();

  const race = await phone({
    slot: 4,
    controls: "race",
    viewport: { width: 844, height: 390 },
  });
  const bindings = [
    ["Steer left", "left"],
    ["Steer right", "right"],
    ["Drift", "lt"],
    ["Hop / stunt", "y"],
    ["Dash left", "l"],
    ["Dash right", "r"],
    ["Skill", "up"],
    ["Charge skill", "down"],
    ["Superkart skill", "select"],
    ["Look back", "rt"],
    ["Pause", "start"],
    ["Boost", "x"],
    ["Brake", "b"],
    ["Throttle", "a"],
  ];
  for (const [label, action] of bindings) {
    const button = race.page.getByRole("button", { name: label, exact: true });
    await expect(button).toBeEnabled();
    const before = race.sent.length;
    await button.click();
    assert(
      race.sent
        .slice(before)
        .some(
          (frame) => frame.type === "input" && frame.buttons.includes(action),
        ),
      `${label} must send semantic ${action}`,
    );
    await expect.poll(() => race.latestInput()?.buttons).toEqual([]);
  }
  await expect(
    race.page.getByRole("button", { name: "Reset car", exact: true }),
  ).toHaveCount(0);
  await expect(
    race.page.getByRole("button", { name: "A", exact: true }),
  ).toHaveCount(0);
  checks.push(
    "P4 Race dispatches independent steering, pedals, boost, drift/hop, skill/charge, dash, rear view, Superkart and Pause semantic actions",
  );
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 812, height: 375 },
    { width: 390, height: 844 },
  ]) {
    await race.page.setViewportSize(viewport);
    for (const [label] of bindings) {
      const box = await race.page
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      assert(
        box && box.width >= 44 && box.height >= 44,
        `${label} touch target at ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`,
      );
      assert(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height + 1,
        `${label} must remain on-screen at ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`,
      );
    }
    const driftBox = await race.page
      .getByRole("button", { name: "Drift", exact: true })
      .boundingBox();
    const throttleBox = await race.page
      .getByRole("button", { name: "Throttle", exact: true })
      .boundingBox();
    const boostBox = await race.page
      .getByRole("button", { name: "Boost", exact: true })
      .boundingBox();
    const steerBox = await race.page
      .getByRole("button", { name: "Steer left", exact: true })
      .boundingBox();
    const hopBox = await race.page
      .getByRole("button", { name: "Hop / stunt", exact: true })
      .boundingBox();
    assert(
      driftBox.x >= viewport.width / 2 &&
        driftBox.height >= 100 &&
        driftBox.height > throttleBox.height,
      "Drift must be the large right-thumb primary target",
    );
    assert(
      boostBox.y + boostBox.height <= driftBox.y + 1 &&
        throttleBox.y >= driftBox.y + driftBox.height,
      "Boost is above Drift; separate throttle is secondary below it",
    );
    assert(
      hopBox.y + hopBox.height <= steerBox.y + 1,
      "Hop remains above the left-thumb steering area",
    );
    assert(
      await race.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await race.page.screenshot({
      path: path.join(
        output,
        `p4-race-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
  checks.push(
    "All14 targets fit844x390,812x375 and390x844 at44px minimum; Drift is a100px+ right-thumb primary, Boost/Hop are above and secondary pedals below",
  );
  await race.page.setViewportSize({ width: 844, height: 390 });
  const touch = await race.context.newCDPSession(race.page);
  const contacts = new Map();
  async function points(labels, page = race.page) {
    return Promise.all(
      labels.map(async (label) => {
        if (!contacts.has(label)) contacts.set(label, contacts.size + 1);
        const box = await page
          .getByRole("button", { name: label, exact: true })
          .boundingBox();
        assert(box, `${label} touch target is available`);
        return {
          id: contacts.get(label),
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
      }),
    );
  }
  const contactPoints = await points([
    "Steer left",
    "Drift",
    "Throttle",
    "Brake",
    "Skill",
  ]);
  const byLabel = new Map(
    ["Steer left", "Drift", "Throttle", "Brake", "Skill"].map(
      (label, index) => [label, contactPoints[index]],
    ),
  );
  let activeTouches = [];
  async function touches(type, labels = []) {
    const changed =
      type === "touchEnd" && labels.length
        ? activeTouches.filter((label) => !labels.includes(label))
        : labels;
    await touch.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: changed.map((label) => byLabel.get(label)),
    });
    activeTouches = type === "touchCancel" ? [] : labels;
  }
  async function buttons(expected) {
    await expect
      .poll(() => [...(race.latestInput()?.buttons || [])].sort())
      .toEqual([...expected].sort());
  }
  async function neutralTouch() {
    await touches("touchCancel");
    await buttons([]);
    await expect(race.page.locator(".touch-button.held")).toHaveCount(0);
  }
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  await touches("touchEnd", ["Steer left"]);
  await buttons(["left"]);
  await touches("touchEnd");
  await buttons([]);
  checks.push(
    "Two fingers hold steer + Drift to send steering, throttle and drift together; lifting Drift stops gas and drift while steering stays held",
  );
  await touches("touchStart", ["Throttle", "Drift"]);
  await buttons(["a", "lt"]);
  await touches("touchEnd", ["Throttle"]);
  await buttons(["a"]);
  await touches("touchEnd");
  await buttons([]);
  await touches("touchStart", ["Throttle", "Drift"]);
  await buttons(["a", "lt"]);
  await touches("touchEnd", ["Drift"]);
  await buttons(["a", "lt"]);
  await touches("touchEnd");
  await buttons([]);
  checks.push(
    "Separate Throttle and Drift pointers form a union: either can be released first without dropping gas still held by the other; the last release is neutral",
  );
  await touches("touchStart", ["Drift", "Throttle", "Brake"]);
  await buttons(["b", "lt"]);
  await touches("touchEnd", ["Drift", "Throttle"]);
  await buttons(["a", "lt"]);
  await touches("touchStart", ["Drift", "Throttle", "Brake"]);
  await buttons(["b", "lt"]);
  await touches("touchEnd", ["Brake"]);
  await buttons(["b"]);
  await touches("touchEnd");
  await buttons([]);
  checks.push(
    "Brake suppresses both implied and manual throttle while preserving held drift; release restores gas only when a Drift/Throttle pointer remains, never after both lifted",
  );
  await touches("touchStart", ["Steer left", "Throttle", "Drift", "Skill"]);
  await buttons(["a", "left", "lt", "up"]);
  await neutralTouch();
  checks.push(
    "Real browser multi-touch can add charge skill to steer + Drift; touchcancel releases every explicit and implied action immediately",
  );
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  await race.page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await buttons([]);
  await neutralTouch();
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  await race.page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await buttons([]);
  await race.page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    }),
  );
  await neutralTouch();
  checks.push(
    "Blur and page hiding clear every touch plus implied gas; becoming visible does not resume driving",
  );
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  await race.update({ epoch: 101 });
  await buttons([]);
  await neutralTouch();
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  await race.update({ epoch: 102, displayMode: "split-2" });
  await buttons([]);
  await expect(
    race.page.getByRole("button", { name: "Throttle", exact: true }),
  ).toHaveCount(0);
  await neutralTouch();
  await race.update({ epoch: 103, displayMode: "split-4" });
  await expect(
    race.page.getByRole("button", { name: "Drift", exact: true }),
  ).toBeEnabled();
  await buttons([]);
  await expect(race.page.locator(".touch-button.held")).toHaveCount(0);
  checks.push(
    "Epoch and player-limit changes clear explicit touches and implied gas; re-enabling P4 starts neutral",
  );
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  await race.update({ epoch: 104, profile: "lab" });
  await buttons([]);
  await neutralTouch();
  await race.update({ epoch: 105, profile: "speedstorm" });
  await buttons([]);
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  await race.update({
    epoch: 106,
    native: { ...race.state.native, controls: "menu" },
  });
  await buttons([]);
  await neutralTouch();
  await expect(
    race.page.getByRole("button", { name: "Confirm", exact: true }),
  ).toHaveText("Confirm / Ready");
  await expect(
    race.page.getByText(
      "Online: select Gamepad in game settings · Local: Friendly Race → Local Freeplay",
      { exact: true },
    ),
  ).toBeVisible();
  const menuBefore = race.sent.length;
  await race.page.getByRole("button", { name: "Up", exact: true }).click();
  assert(
    race.sent
      .slice(menuBefore)
      .some(
        (frame) =>
          frame.type === "input" &&
          frame.buttons.length === 1 &&
          frame.buttons[0] === "up",
      ),
  );
  checks.push(
    "Profile or Race/Menus changes reset implied gas and all touches; menu navigation remains a single semantic action with Confirm / Ready for Local Freeplay",
  );
  await race.update({
    epoch: 107,
    native: { ...race.state.native, controls: "race" },
  });
  await touches("touchStart", ["Steer left", "Drift"]);
  await buttons(["a", "left", "lt"]);
  race.disconnect();
  await expect(race.page.locator(".touch-button.held")).toHaveCount(0);
  await expect
    .poll(() => race.sent.filter((frame) => frame.type === "auth").length)
    .toBe(2);
  await buttons([]);
  await neutralTouch();
  checks.push(
    "Disconnect removes held and implied actions; reconnect authenticates again and sends a neutral snapshot without resuming gas",
  );
  await race.context.close();

  async function chooseStyle(p, name) {
    await p.page
      .getByRole("button", { name: "Controller settings", exact: true })
      .click();
    await expect(
      p.page.getByRole("group", {
        name: "Speedstorm control style",
        exact: true,
      }),
    ).toBeVisible();
    await p.page.getByRole("button", { name, exact: true }).click();
    await expect.poll(() => p.latestInput()?.buttons).toEqual([]);
    await p.page
      .getByRole("button", { name: "Close controller settings", exact: true })
      .click();
  }
  const classic = await phone({
    slot: 4,
    controls: "race",
    viewport: { width: 844, height: 390 },
  });
  const independent = await phone({ slot: 2, controls: "race" });
  await expect(classic.page.locator("main.phone-controller")).toHaveClass(
    /control-style-assist/,
  );
  await expect(independent.page.locator("main.phone-controller")).toHaveClass(
    /control-style-assist/,
  );
  await classic.page.bringToFront();
  const classicTouch = await classic.context.newCDPSession(classic.page);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: await points(["Steer left", "Drift"], classic.page),
  });
  await expect
    .poll(() => [...(classic.latestInput()?.buttons || [])].sort())
    .toEqual(["a", "left", "lt"]);
  await chooseStyle(classic, "Classic");
  await expect(classic.page.locator("main.phone-controller")).toHaveClass(
    /control-style-classic/,
  );
  await expect(classic.page.locator(".touch-button.held")).toHaveCount(0);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  assert.equal(
    await classic.page.evaluate(() =>
      localStorage.getItem("waterconsole.speedstorm.control-style"),
    ),
    "classic",
  );
  assert(
    !classic.sent.some((frame) =>
      ["native-controls", "native-layout", "nav"].includes(frame.type),
    ),
    "P4 can change its local style without navigator commands",
  );
  await expect(independent.page.locator("main.phone-controller")).toHaveClass(
    /control-style-assist/,
  );
  assert.equal(
    await independent.page.evaluate(() =>
      localStorage.getItem("waterconsole.speedstorm.control-style"),
    ),
    null,
  );
  checks.push(
    "Every phone defaults to Drift assist; non-navigator P4 can select Classic locally, neutralizing held input without changing another phone or sending session commands",
  );
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 812, height: 375 },
    { width: 390, height: 844 },
  ]) {
    await classic.page.setViewportSize(viewport);
    for (const [label] of bindings) {
      const box = await classic.page
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      assert(
        box &&
          box.width >= 44 &&
          box.height >= 44 &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height + 1,
        `Classic ${label} must fit at44px minimum on ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`,
      );
    }
    const driftBox = await classic.page
      .getByRole("button", { name: "Drift", exact: true })
      .boundingBox();
    const hopBox = await classic.page
      .getByRole("button", { name: "Hop / stunt", exact: true })
      .boundingBox();
    const throttleBox = await classic.page
      .getByRole("button", { name: "Throttle", exact: true })
      .boundingBox();
    const brakeBox = await classic.page
      .getByRole("button", { name: "Brake", exact: true })
      .boundingBox();
    assert(
      driftBox.x < viewport.width / 2 &&
        Math.abs(driftBox.y - hopBox.y) <= 1 &&
        driftBox.x < hopBox.x,
      "Classic restores Drift and Hop together above left steering",
    );
    assert(
      throttleBox.x >= viewport.width / 2 &&
        throttleBox.height >= 100 &&
        brakeBox.height >= 100,
      "Classic restores separate large throttle and brake pedals on the right",
    );
    assert(
      await classic.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await classic.page.screenshot({
      path: path.join(
        output,
        `p4-classic-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
  checks.push(
    "Classic restores the original14-control arrangement: Drift + Hop upper left, separate large gas/brake right, all targets visible at44px minimum in both landscape sizes and portrait",
  );
  await classic.page.setViewportSize({ width: 844, height: 390 });
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: await points(["Steer left", "Drift"], classic.page),
  });
  await expect
    .poll(() => [...(classic.latestInput()?.buttons || [])].sort())
    .toEqual(["left", "lt"]);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => classic.latestInput()?.buttons).toEqual([]);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: await points(
      ["Steer left", "Drift", "Throttle"],
      classic.page,
    ),
  });
  await expect
    .poll(() => [...(classic.latestInput()?.buttons || [])].sort())
    .toEqual(["a", "left", "lt"]);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: await points(["Drift"], classic.page),
  });
  await expect
    .poll(() => [...(classic.latestInput()?.buttons || [])].sort())
    .toEqual(["a", "left"]);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => classic.latestInput()?.buttons).toEqual([]);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: await points(["Drift", "Throttle", "Brake"], classic.page),
  });
  await expect
    .poll(() => [...(classic.latestInput()?.buttons || [])].sort())
    .toEqual(["a", "b", "lt"]);
  await classicTouch.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect.poll(() => classic.latestInput()?.buttons).toEqual([]);
  checks.push(
    "Classic Drift is LT only; manual steer + throttle + drift stays three independent touches; releasing Drift preserves manual gas and Classic brake does not override gas",
  );
  await classic.page.reload();
  await classic.page
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  await expect(classic.page.locator("main.phone-controller")).toHaveClass(
    /control-style-classic/,
  );
  await expect.poll(() => classic.latestInput()?.buttons).toEqual([]);
  await chooseStyle(classic, "Drift assist");
  await expect(classic.page.locator("main.phone-controller")).toHaveClass(
    /control-style-assist/,
  );
  assert.equal(
    await classic.page.evaluate(() =>
      localStorage.getItem("waterconsole.speedstorm.control-style"),
    ),
    "assist",
  );
  await classic.page.reload();
  await classic.page
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  await expect(classic.page.locator("main.phone-controller")).toHaveClass(
    /control-style-assist/,
  );
  await expect.poll(() => classic.latestInput()?.buttons).toEqual([]);
  checks.push(
    "Classic and Drift assist each persist through reload on their own phone; reload and style changes begin neutral",
  );
  await classic.context.close();
  await independent.context.close();
  const noStorage = await phone({
    slot: 3,
    controls: "race",
    blockedStorage: true,
  });
  await expect(noStorage.page.locator("main.phone-controller")).toHaveClass(
    /control-style-assist/,
  );
  await chooseStyle(noStorage, "Classic");
  await expect(noStorage.page.locator("main.phone-controller")).toHaveClass(
    /control-style-classic/,
  );
  await noStorage.context.close();
  checks.push(
    "Blocked localStorage falls back to Drift assist and still permits changing style for the visit without page errors",
  );

  const other = await phone({
    slot: 1,
    profile: "racing",
    gameId: "hotwheels-unleashed",
    controls: "race",
    mode: "split-2",
  });
  const otherTouch = await other.context.newCDPSession(other.page);
  await otherTouch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: await points(["Throttle", "Brake"], other.page),
  });
  await expect
    .poll(() => [...(other.latestInput()?.buttons || [])].sort())
    .toEqual(["a", "b"]);
  await otherTouch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => other.latestInput()?.buttons).toEqual([]);
  await other.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    other.page.getByRole("group", {
      name: "Speedstorm control style",
      exact: true,
    }),
  ).toHaveCount(0);
  await other.context.close();
  const idol = await phone({
    slot: 1,
    profile: "idol",
    gameId: "idol-showdown",
    controls: "fight",
    mode: "shared",
  });
  const idolBefore = idol.sent.length;
  await idol.page.getByRole("button", { name: "LT", exact: true }).click();
  assert(
    idol.sent
      .slice(idolBefore)
      .some(
        (frame) =>
          frame.type === "input" &&
          frame.buttons.length === 1 &&
          frame.buttons[0] === "lt",
      ),
  );
  await expect.poll(() => idol.latestInput()?.buttons).toEqual([]);
  await idol.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await expect(
    idol.page.getByRole("group", {
      name: "Speedstorm control style",
      exact: true,
    }),
  ).toHaveCount(0);
  await idol.context.close();
  checks.push(
    "Drift/gas derivation is isolated to Speedstorm Race: HOT WHEELS still permits its original throttle + brake snapshot, Idol LT stays LT without adding throttle",
  );

  const types = await readFile("src/shared/types.ts", "utf8");
  assert(
    types.includes('id: "disney-speedstorm"'),
    "Root must add agreed Speedstorm manifest before host verification",
  );
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  await context.route("**/library-art/**", (route) => {
    const key = new URL(route.request().url()).pathname.slice(1);
    const bytes = art.get(key);
    return bytes
      ? route.fulfill({
          status: 200,
          contentType: "image/jpeg",
          body: Buffer.from(bytes),
        })
      : route.fulfill({ status: 404, body: "unavailable" });
  });
  const host = await context.newPage();
  host.on("pageerror", (error) => errors.push(error.message));
  const state = fixture();
  await context.addInitScript((state) => {
    const listeners = [];
    window.__publish = (next) =>
      listeners.forEach((listener) => listener(next));
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
  await host.goto(origin + "/host.html");
  await expect(
    host.getByRole("heading", { name: "Disney Speedstorm.", exact: false }),
  ).toBeVisible();
  await expect(host.locator(".native-player")).toHaveCount(4);
  await expect(
    host.getByRole("group", {
      name: "Disney Speedstorm local players",
      exact: true,
    }),
  ).toBeVisible();
  await host.getByRole("button", { name: "4 players", exact: true }).click();
  assert(
    await host.evaluate(() =>
      window.__commands.some(
        (frame) => frame.type === "setLayout" && frame.mode === "split-4",
      ),
    ),
  );
  await host.screenshot({
    path: path.join(output, "host-four-players-720p.png"),
    fullPage: true,
  });
  checks.push(
    "Host native view exposes four slot cards and correct1/2/4 player commands without HOT WHEELS labels",
  );
  await host.evaluate(
    (state) => window.__publish({ ...state, phase: "home", profile: "menu" }),
    state,
  );
  await expect(host.locator(".voyager-game-lobby")).toBeVisible();

  assert(
    await host.locator(".game-lobby-backdrop img").evaluate(async (image) => {
      await image.decode();
      return image.naturalWidth > 0;
    }),
  );
  await expect(host.locator(".game-lobby-backdrop img")).toHaveAttribute(
    "data-library-art",
    "true",
  );
  await expect(host.locator(".game-lobby-backdrop img")).toHaveAttribute(
    "src",
    "/library-art/disney-speedstorm-hero",
  );
  await expect(host.locator(".game-lobby-meta")).toContainText(
    "Offline · Online",
  );
  await expect(host.locator(".game-lobby-meta")).toContainText("1–4 players");
  await host.screenshot({
    path: path.join(output, "library-private-art-720p.png"),
    fullPage: true,
  });
  await host.route("**/library-art/disney-speedstorm-*", (route) =>
    route.fulfill({ status: 404, body: "not configured" }),
  );
  await host.reload();
  await host.evaluate(
    (state) => window.__publish({ ...state, phase: "home", profile: "menu" }),
    state,
  );
  await expect(host.locator(".game-lobby-backdrop img")).toHaveAttribute(
    "src",
    "./assets/speedway-circuit.svg",
  );
  assert(
    await host.locator(".game-lobby-backdrop img").evaluate(async (image) => {
      await image.decode();
      return image.naturalWidth > 0;
    }),
  );
  checks.push(
    "Library displays private Steam hero through fixed route, correct mixed connection label, and original SVG fallback when unavailable",
  );
  await context.close();
  assert.deepEqual(errors, []);
  const report = {
    checks,
    errors,
    limitation:
      "Fixture browser tests prove UI commands, gating and artwork loading; actual native bindings, four-player gameplay, offline cold start, physical phones and physical haptics require separate runtime testing.",
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
