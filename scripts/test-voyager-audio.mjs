import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import {
  mkdir,
  cp,
  copyFile,
  readFile,
  writeFile,
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const reuseIndex = process.argv.indexOf("--reuse");
const reuse = reuseIndex >= 0 ? process.argv[reuseIndex + 1] : null;
const output = path.resolve("test-results/voyager-audio"),
  dataDir = reuse
    ? path.resolve(reuse)
    : path.resolve(".local", `voyager-audio-${Date.now()}`);
assert.ok(
  dataDir.startsWith(path.resolve(".local") + path.sep + "voyager-audio-"),
);
const prior = reuse
  ? JSON.parse(await readFile(path.join(dataDir, "presentation.json"), "utf8"))
  : {};
await mkdir(output, { recursive: true });
await mkdir(path.join(dataDir, "media"), { recursive: true });
if (!reuse)
  await cp(
    path.resolve(".local/user-data/library"),
    path.join(dataDir, "library"),
    { recursive: true },
  );
const sourceRoot = path.join(process.env.APPDATA, "Voyager"),
  source = JSON.parse(
    await readFile(path.join(sourceRoot, "presentation.json"), "utf8"),
  ),
  games = {};
for (const [id, media] of Object.entries(source.games)) {
  if (
    !media.trailer ||
    !media.trailerName?.startsWith("Steam · ") ||
    !/^[a-f0-9-]{36}\.mp4$/.test(media.trailer)
  )
    continue;
  await access(path.join(dataDir, "media", media.trailer)).catch(() =>
    copyFile(
      path.join(sourceRoot, "media", media.trailer),
      path.join(dataDir, "media", media.trailer),
    ),
  );
  games[id] =
    prior.games?.[id]?.trailer === media.trailer
      ? prior.games[id]
      : { trailer: media.trailer, trailerName: media.trailerName };
  if (!games[id].trailerAudioChecked && media.trailerAudioChecked && /^[a-f0-9-]{36}\.m4a$/.test(media.trailerAudio || "")) {
    await access(path.join(dataDir, "media", media.trailerAudio)).catch(() => copyFile(path.join(sourceRoot, "media", media.trailerAudio), path.join(dataDir, "media", media.trailerAudio)));
    games[id] = {...games[id], trailerAudio: media.trailerAudio, trailerAudioChecked: true};
  }
}
await writeFile(
  path.join(dataDir, "presentation.json"),
  JSON.stringify({
    settings: {
      music: true,
      musicVolume: 0.5,
      startupSound: true,
      motion: "full",
      trailers: true,
      autoplay: true,
      trailerSound: true,
      trailerVolume: 0.6,
    },
    games,
  }),
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: dataDir,
  VOYAGER_DATA_DIR: dataDir,
  VOYAGER_LIBRARY_DIR: dataDir,
  WATERCONSOLE_DISABLE_NATIVE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VOYAGER_TEST_NO_TRAILER_FETCH;
const app = await _electron.launch({
  executablePath: electronPath,
  args: [".", "--force-device-scale-factor=1"],
  env,
  timeout: 35000,
});
const errors = [],
  signals = [],
  rotations = [],
  transitions = [];
try {
  const page = await app.firstWindow();
  await page.emulateMedia({reducedMotion:"reduce"});
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1536, 864),
  );
  await page.setViewportSize({ width: 1536, height: 864 });
  const audible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.isCurrentlyAudible(),
    );
  async function signal(selector, name) {
    await expect
      .poll(() =>
        page
          .locator(selector)
          .evaluate(
            (a) => !a.paused && !a.muted && a.currentTime > 0 && a.volume > 0,
          ),
      )
      .toBe(true);
    await expect.poll(audible).toBe(true);
    const measurement = await page.locator(selector).evaluate(async (a) => {
      window.__audioTestContext ||= new AudioContext();
      window.__audioTestNodes ||= new WeakMap();
      const ctx = window.__audioTestContext;
      await ctx.resume();
      let node = window.__audioTestNodes.get(a);
      if (!node) {
        const source = ctx.createMediaElementSource(a);
        node = ctx.createAnalyser();
        node.fftSize = 2048;
        source.connect(node);
        node.connect(ctx.destination);
        window.__audioTestNodes.set(a, node);
      }
      const samples = new Float32Array(node.fftSize);
      let rms = 0;
      for (let i = 0; i < 20; i++) {
        node.getFloatTimeDomainData(samples);
        rms = Math.max(
          rms,
          Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length),
        );
        await new Promise((r) => setTimeout(r, 20));
      }
      return {
        rms,
        time: a.currentTime,
        volume: a.volume,
        muted: a.muted,
        error: a.error?.message || null,
      };
    });
    assert.ok(
      measurement.rms > 0.0001,
      `${name} must have a real decoded audio signal: ${JSON.stringify(measurement)}`,
    );
    signals.push({ name, ...measurement });
    console.log(
      `PASS ${name}: decoded RMS ${measurement.rms.toFixed(5)}, Electron audible`,
    );
  }
  await signal('audio[data-audio-bus="startup"]', "Select Ultimate startup");
  await expect(
    page.getByRole("dialog", { name: "Voyager opening" }),
  ).toHaveCount(0, { timeout: 15000 });
  await signal('audio[data-track="pair"]', "Login Screen / QR music");
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  await signal('audio[data-track="library"]', "Home Lobby / collection music");
  await page
    .getByRole("button", { name: "Session settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Audio & appearance", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Audio & appearance" });
  await expect(modal).toBeVisible();
  assert.equal(
    await page.getByRole("button", { name: "Choose startup sound" }).count(),
    0,
  );
  const startup = await page.evaluate(() =>
    window.waterconsole.presentation({ type: "startup" }),
  );
  assert.equal(startup.ok, false);
  const covering = await page.evaluate(() => {
    const m = document.querySelector(".modal"),
      a = document.querySelector(".collection-add").getBoundingClientRect();
    return m.contains(
      document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2),
    );
  });
  assert.ok(covering, "Collection controls must be behind the settings modal");
  assert.equal(
    await page.evaluate(() => CSS.supports("appearance", "base-select")),
    true,
  );
  const motion = page.getByRole("combobox", { name: "Motion", exact: true });
  await motion.click();
  assert.equal(
    await motion.evaluate(
      (el) => getComputedStyle(el, "::picker(select)").borderRadius,
    ),
    "10px",
  );
  await page.screenshot({ path: path.join(output, "settings-dropdown.png") });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await page.evaluate(() => {
    window.__sceneChecks = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = function (update) {
      const kind = document.documentElement.dataset.sceneTransition,
        t = start(update);
      t.ready
        .then(() =>
          window.__sceneChecks.push({
            kind,
            ready: true,
            discAnimation: getComputedStyle(
              document.documentElement,
              "::view-transition-new(voyager-disc)",
            ).animationName,
          }),
        )
        .catch((e) =>
          window.__sceneChecks.push({ kind, ready: false, error: e.message }),
        );
      return t;
    };
  });
  const catalog = (await page.evaluate(() => window.waterconsole.getState()))
      .catalog,
    native = catalog.filter((g) => g.runtime === "native" && games[g.id]);
  assert.ok(native.some((g) => g.title.includes("Arkham Knight")));
  assert.ok(native.some((g) => g.id === "disney-speedstorm"));
  for (const [index, game] of native.entries()) {
    await page.evaluate(
      (id) => window.waterconsole.command({ type: "selectGame", gameId: id }),
      game.id,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(
        async () => {
          const r = await page.evaluate(() =>
            window.waterconsole.presentation({ type: "get" }),
          );
          return Boolean(r.state.games[game.id].trailerAudio);
        },
        { timeout: 180000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    await expect(
      page.locator('audio[data-audio-bus="trailer"]'),
    ).toBeAttached();
    await expect
      .poll(() =>
        page
          .locator(".game-lobby-backdrop video")
          .evaluate(
            (v, asset) =>
              v.currentSrc.endsWith(asset) &&
              v.readyState >= 2 &&
              Number.isFinite(v.duration),
            games[game.id].trailer,
          ),
      )
      .toBe(true);
    await page.locator(".game-lobby-backdrop video").evaluate((v) => {
      v.currentTime = Math.min(45, v.duration * 0.4);
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const a = document.querySelector('audio[data-audio-bus="trailer"]'),
            v = document.querySelector("video");
          return (
            a.readyState >= 2 &&
            !a.paused &&
            !v.seeking &&
            Math.abs(a.currentTime - v.currentTime) < 0.35
          );
        }),
      )
      .toBe(true);
    await signal('audio[data-audio-bus="trailer"]', `${game.title} trailer`);
    await expect(page.locator(".lobby-disc")).toHaveAttribute(
      "data-spinning",
      "true",
    );
    const print=page.locator('.lobby-disc .disc-print');
    assert.equal(await print.evaluate(el=>getComputedStyle(el).animationName),'disc-idle-spin');
    const angle=await print.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(250);
    const nextAngle=await print.evaluate(el=>getComputedStyle(el).transform);
    assert.notEqual(nextAngle,angle,'The rendered disc must rotate in Full mode even when the OS prefers reduced motion');
    await page.screenshot({ path: path.join(output, `${game.id}-audio.png`) });
    await page
      .getByRole("button", { name: "Mute trailer", exact: true })
      .click();
    await expect
      .poll(() =>
        page
          .locator('audio[data-audio-bus="trailer"]')
          .evaluate((a) => a.muted),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Unmute trailer", exact: true })
      .click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.locator(".lobby-disc")).toHaveAttribute(
      "data-spinning",
      "false",
    );
    await page.waitForTimeout(60);
    const pausedAngle=await print.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(150);assert.equal(await print.evaluate(el=>getComputedStyle(el).transform),pausedAngle);
    rotations.push({game:game.title,before:angle,after:nextAngle,paused:pausedAngle,osReducedMotion:true,voyagerMotion:"full"});
    await expect
      .poll(() =>
        page
          .locator('audio[data-audio-bus="trailer"]')
          .evaluate((a) => a.paused),
      )
      .toBe(true);
    const next = native[(index + 1) % native.length];
    await page.evaluate(
      (id) => window.waterconsole.command({ type: "selectGame", gameId: id }),
      next.id,
    );
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".lobby-disc")).toHaveAttribute(
      "data-spinning",
      "false",
    );
    await page.getByRole("button", { name: "Off", exact: true }).click();
    await page.evaluate(
      (id) => window.waterconsole.command({ type: "selectGame", gameId: id }),
      game.id,
    );
    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.locator('audio[data-audio-bus="trailer"]')).toHaveCount(
      0,
    );
    await expect(page.locator(".lobby-disc")).toHaveAttribute(
      "data-spinning",
      "false",
    );
  }
  await page.evaluate(() =>
    window.waterconsole.command({
      type: "selectGame",
      gameId: "disney-speedstorm",
    }),
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, path.resolve("test-results/voyager/audio-fixture.mp4"));
  await page.getByRole("button", { name: "Edit game", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose trailer", exact: true })
    .click();
  await expect(
    page.getByText("audio-fixture.mp4", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('audio[data-audio-bus="trailer"]')).toHaveCount(0);
  await signal(".game-lobby-backdrop video", "Uploaded MP4 audio");
  transitions.push(...(await page.evaluate(() => window.__sceneChecks)));
  assert.ok(
    transitions.some(
      (t) =>
        t.ready &&
        t.kind?.startsWith("game-") &&
        t.discAnimation === "voyager-disc-in",
    ),
  );
  assert.deepEqual(
    transitions.filter(
      (t) => !t.ready && !t.error?.includes("skipTransition() called"),
    ),
    [],
  );
  assert.deepEqual(errors, []);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify({ dataDir, signals, rotations, transitions, errors }, null, 2),
  );
  console.log(
    "PASS modal layering, themed picker, fixed startup, all trailer audio, mute/pause/off, retained playback choice and slide/roll transitions",
  );
  await rm(path.join(output, "failure.json"), { force: true });
} catch (error) {
  const page = await app.firstWindow();
  const media = await page.evaluate(() =>
    [...document.querySelectorAll("audio,video")].map((a) => ({
      tag: a.tagName,
      bus: a.dataset.audioBus,
      paused: a.paused,
      muted: a.muted,
      volume: a.volume,
      time: a.currentTime,
      ready: a.readyState,
      error: a.error?.message,
      src: a.currentSrc,
    })),
  );
  await writeFile(
    path.join(output, "failure.json"),
    JSON.stringify({ dataDir, error: error.message, media, signals }, null, 2),
  );
  console.log(JSON.stringify({ error: error.message, media }));
  throw error;
} finally {
  await app.close();
}
