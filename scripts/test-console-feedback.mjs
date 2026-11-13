import { _electron, chromium, expect } from "playwright/test";
import electronPath from "electron";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const executablePath = process.env.WATERCONSOLE_EXECUTABLE || electronPath;
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: path.resolve(`.local/feedback-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
const output = path.resolve(".local/console-feedback");
await mkdir(output, { recursive: true });
const desktop = await _electron.launch({
  executablePath,
  args: process.env.WATERCONSOLE_EXECUTABLE ? [] : ["."],
  env,
});
const host = await desktop.firstWindow();
const errors = [],
  checks = [];
host.on("pageerror", (error) => errors.push(error.message));
let browser;
const noGesture = (fn, arg) =>
  desktop.evaluate(
    ({ BrowserWindow }, { source, arg }) =>
      BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
        `(${source})(${JSON.stringify(arg)})`,
        false,
      ),
    { source: fn.toString(), arg },
  );
const state = () => noGesture(() => window.waterconsole.getState());
const command = (cmd) =>
  noGesture((cmd) => window.waterconsole.command(cmd), cmd);
const audio = () =>
  noGesture(() => ({
    starts: window.__feedbackAudio.starts,
    peak: window.__feedbackAudio.peak,
    state: window.__feedbackAudio.context?.state,
    gain: window.__feedbackAudio.output?.gain.value,
    activated: navigator.userActivation.hasBeenActive,
  }));
async function expectNotes(before, count) {
  await expect
    .poll(async () => (await audio()).starts.length)
    .toBe(before + count);
  await delay(180);
}
try {
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .waitFor();
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080),
  );
  await host.setViewportSize({ width: 1920, height: 1080 });
  await noGesture(() => {
    const recorded = (window.__feedbackAudio = { starts: [], peak: 0 });
    const gain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = gain.call(this),
        connect = node.connect.bind(node),
        context = this;
      node.connect = function (destination, ...args) {
        if (destination === context.destination) {
          const analyser = context.createAnalyser();
          connect(analyser);
          recorded.context = context;
          recorded.output = node;
          const data = new Float32Array(analyser.fftSize);
          setInterval(() => {
            analyser.getFloatTimeDomainData(data);
            for (const value of data)
              recorded.peak = Math.max(recorded.peak, Math.abs(value));
          }, 5);
        }
        return connect(destination, ...args);
      };
      return node;
    };
    const oscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = oscillator.call(this),
        start = node.start.bind(node),
        context = this;
      let hz = node.frequency.value;
      const frequency = node.frequency.setValueAtTime.bind(node.frequency);
      node.frequency.setValueAtTime = (value, time) => {
        hz = value;
        return frequency(value, time);
      };
      node.start = function (...args) {
        recorded.starts.push({
          hz,
          state: context.state,
        });
        return start(...args);
      };
      return node;
    };
    recorded.probeMute = async () => {
      recorded.peak = 0;
      const tone = oscillator.call(recorded.context),
        level = gain.call(recorded.context);
      level.gain.value = 0.02;
      tone.connect(level).connect(recorded.output);
      tone.start();
      await new Promise((resolve) => setTimeout(resolve, 80));
      recorded.peak = 0;
      await new Promise((resolve) => setTimeout(resolve, 80));
      tone.stop();
      tone.disconnect();
      level.disconnect();
      return recorded.peak;
    };
  });
  await command({ type: "openHome" });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const phone = await browser.newPage({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true,
  });
  await phone.goto((await state()).pairing.url);
  await phone.getByLabel("Your name", { exact: true }).fill("Sound test");
  await phone
    .getByRole("button", { name: "Connect to console", exact: true })
    .click();
  await expect.poll(async () => (await state()).pending.length).toBe(1);
  await command({ type: "approve", requestId: (await state()).pending[0].id });
  await phone
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  await phone.getByRole("button", { name: "Right", exact: true }).tap();
  await expectNotes(0, 1);
  const first = await audio();
  assert.equal(first.state, "running");
  assert.ok(first.peak > 0.01 && first.peak < 0.3);
  checks.push(
    "Phone navigation starts real host audio before any desktop click; output waveform is nonzero and bounded. Automation may itself activate the document.",
  );
  await phone.getByRole("button", { name: "Left", exact: true }).tap();
  await expectNotes(1, 1);
  await phone.getByRole("button", { name: "Confirm", exact: true }).tap();
  await expectNotes(2, 2);
  assert.equal((await state()).phase, "lab");
  checks.push(
    "Phone selection plays one move tone; confirmation plays the distinct two-tone cue.",
  );
  await command({ type: "stopGame" });
  await host
    .getByRole("button", { name: "Show Idol Showdown details", exact: true })
    .first()
    .click();
  await expectNotes(4, 1);
  const artwork = await host.evaluate(async () => {
    const cover = document.querySelector(".game-cover.idol-showdown img");
    await cover.decode();
    const hero = document.querySelector(".hero-art img");
    await hero.decode();
    const response = await fetch("/library-art/idol-showdown-cover");
    return {
      cover: {
        local: cover.dataset.libraryArt,
        width: cover.naturalWidth,
        height: cover.naturalHeight,
      },
      hero: { local: hero.dataset.libraryArt, width: hero.naturalWidth },
      contentType: response.headers.get("content-type"),
      traversal: (await fetch("/library-art/%2e%2e%2fpackage.json")).status,
    };
  });
  assert.equal(artwork.cover.local, "true");
  assert.equal(artwork.cover.width, 920);
  assert.equal(artwork.hero.local, "true");
  assert.equal(artwork.contentType, "image/jpeg");
  assert.equal(artwork.traversal, 404);
  await host.screenshot({ path: path.join(output, "idol-cover.png") });
  checks.push(
    "Local Steam cover and hero decode through fixed desktop-only routes; traversal is refused.",
  );
  await host.keyboard.press("ArrowLeft");
  await expectNotes(5, 1);
  await host.keyboard.press("Enter");
  await expectNotes(6, 2);
  assert.equal((await state()).phase, "lab");
  checks.push(
    "Mouse and keyboard also play selection/confirmation exactly once.",
  );
  await command({ type: "toggleMute" });
  await command({ type: "stopGame" });
  await phone.getByRole("button", { name: "Right", exact: true }).tap();
  await delay(200);
  assert.equal((await audio()).starts.length, 8);
  const mutedProbePeak = await noGesture(() =>
    window.__feedbackAudio.probeMute(),
  );
  assert.ok(mutedProbePeak < 0.0001);
  await command({ type: "toggleMute" });
  await command({ type: "toggleFavorite", gameId: "idol-showdown" });
  await delay(100);
  assert.equal((await audio()).starts.length, 8);
  checks.push(
    "Mute suppresses new sounds and zeros output; unmute/state broadcasts do not replay cues.",
  );
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    testedAt: new Date().toISOString(),
    executable: process.env.WATERCONSOLE_EXECUTABLE
      ? "packaged app"
      : "development app",
    checks,
    artwork,
    firstPhoneCue: first,
    mutedProbePeak,
    audio: await audio(),
    errors,
  };
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await desktop.close();
}
