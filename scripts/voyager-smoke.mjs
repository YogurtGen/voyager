import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import path from "node:path";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const dataDir = path.resolve(".local", `voyager-smoke-${Date.now()}`);
const output = path.resolve("test-results/voyager");
await mkdir(dataDir, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(
  path.join(dataDir, "presentation.json"),
  JSON.stringify({
    settings: { music: false, startupSound: false, trailerSound: false },
    games: {},
  }),
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: dataDir,
  VOYAGER_TEST_NO_TRAILER_FETCH: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
const desktop = await _electron.launch({
  executablePath: electronPath,
  args: [".", "--force-device-scale-factor=1"],
  env,
  timeout: 35000,
});
try {
  const host = await desktop.firstWindow();
  host.on("pageerror", (error) => errors.push(error.message));
  async function size(width, height) {
    await desktop.evaluate(
      ({ BrowserWindow }, s) =>
        BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height),
      { width, height },
    );
    await host.setViewportSize({ width, height });
  }
  async function capture(name) {
    await host.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) => image.decode().catch(() => {})),
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const png = await desktop.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        )
      )
        .toPNG()
        .toString("base64"),
    );
    await writeFile(path.join(output, name), Buffer.from(png, "base64"));
  }
  await size(1920, 1080);
  await expect(
    host.getByRole("dialog", { name: "Voyager opening" }),
  ).toBeVisible();
  assert.equal(
    await host.getByRole("button", { name: "Skip intro" }).count(),
    0,
  );
  assert.equal(
    await host.getByRole("button", { name: "Mute", exact: true }).count(),
    0,
  );
  await expect(
    host.getByRole("dialog", { name: "Voyager opening" }),
  ).toHaveCount(0, { timeout: 20000 });
  await capture("01-pairing-1080.png");
  await size(1280, 720);
  await capture("01b-pairing-720.png");
  await expect(
    host.getByRole("button", { name: "Continue to Home", exact: true }),
  ).toBeInViewport();
  await size(1920, 1080);
  const snapshot = await host.evaluate(() => window.waterconsole.getState());
  const readiness = [
    "hotwheels-unleashed",
    "disney-speedstorm",
    "brawlhalla",
  ].map((id) => ({
    id,
    available: snapshot.native.games?.[id],
    profile: snapshot.catalog.find((g) => g.id === id).controllerProfile,
  }));
  await writeFile(
    path.join(output, "readiness.json"),
    JSON.stringify({ games: readiness, native: snapshot.native }, null, 2),
  );
  assert.deepEqual(
    readiness.map((g) => g.profile),
    ["racing", "speedstorm", "brawlhalla"],
  );
  assert.ok(
    readiness.every((g) => g.available),
    "All three original installations must be detected",
  );
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  await expect(
    host.getByRole("main", { name: "Game collection" }),
  ).toBeVisible();
  await capture("02-library-1080.png");
  await host.getByRole("button", { name: "Next game", exact: true }).click();
  let state = await host.evaluate(() => window.waterconsole.getState());
  assert.equal(state.heroMode, "featured");
  assert.equal(state.phase, "home");
  await host.getByRole("button", { name: "Enter game lobby" }).click();
  await expect(
    host.getByRole("button", { name: "Start game", exact: true }),
  ).toBeEnabled();
  await capture("03-lobby-1080.png");
  await size(1280, 720);
  await capture("04-lobby-720.png");
  const geometry = await host.evaluate(() => {
    const disc = document.querySelector(".lobby-disc").getBoundingClientRect();
    const arrows = [
      ...document.querySelectorAll(".lobby-disc-stage .orbit-arrow"),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        width: r.width,
        height: r.height,
      };
    });
    return {
      center: { x: disc.x + disc.width / 2, y: disc.y + disc.height / 2 },
      arrows,
    };
  });
  assert.ok(Math.abs(geometry.arrows[0].y - geometry.arrows[1].y) < 1);
  assert.ok(geometry.arrows[0].y < geometry.center.y - 50, "Navigation stays above the cropped disc center and media controls");
  assert.ok(Math.abs(geometry.center.y - 726) < 2, "Lobby disc is anchored at the bottom edge, showing its upper half");
  assert.ok(
    Math.abs(
      geometry.center.x -
        geometry.arrows[0].x -
        (geometry.arrows[1].x - geometry.center.x),
    ) < 1,
  );
  await expect(
    host.getByRole("button", { name: "Start game", exact: true }),
  ).toBeInViewport();
  await expect(
    host.getByRole("button", { name: "Edit game", exact: true }),
  ).toBeInViewport();
  await host
    .getByRole("button", { name: "Edit game", exact: true })
    .click();
  await expect(
    host.getByRole("button", { name: "Choose trailer", exact: true }),
  ).toBeVisible();
  await capture("05-media.png");
  await desktop.evaluate(
    ({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [filename],
      });
    },
    path.join(output, "trailer-fixture.mp4"),
  );
  await host
    .getByRole("button", { name: "Choose trailer", exact: true })
    .click();
  await expect(
    host.getByText("trailer-fixture.mp4", { exact: true }),
  ).toBeVisible();
  await host.keyboard.press("Escape");
  await expect(host.locator("video")).toHaveCount(1);
  await expect
    .poll(() =>
      host
        .locator("video")
        .evaluate((v) => v.readyState >= 2 && v.muted && v.currentTime > 0),
    )
    .toBe(true);
  const discSpinTime = () =>
    host
      .locator(".lobby-disc .disc-print")
      .evaluate((el) => el.getAnimations()[0]?.currentTime);
  await expect(host.locator(".lobby-disc")).toHaveAttribute(
    "data-spinning",
    "true",
  );
  const playingTime = await discSpinTime();
  await expect.poll(discSpinTime).toBeGreaterThan(playingTime + 100);
  await host.getByRole("button", { name: "Pause", exact: true }).click();
  await expect
    .poll(() => host.locator("video").evaluate((v) => v.paused))
    .toBe(true);
  await expect(host.locator(".lobby-disc")).toHaveAttribute(
    "data-spinning",
    "false",
  );
  await host.waitForTimeout(100);
  const pausedTime = await discSpinTime();
  await host.waitForTimeout(180);
  assert.ok(
    Math.abs((await discSpinTime()) - pausedTime) < 2,
    "Pause must freeze the disc at its current angle",
  );
  await host.getByRole("button", { name: "Play", exact: true }).click();
  await expect(host.locator(".lobby-disc")).toHaveAttribute(
    "data-spinning",
    "true",
  );
  await expect.poll(discSpinTime).toBeGreaterThan(pausedTime + 100);
  await host.getByRole("button", { name: "Off", exact: true }).click();
  await expect(host.locator("video")).toHaveCount(0);
  await expect(host.locator(".lobby-disc")).toHaveAttribute(
    "data-spinning",
    "false",
  );
  await host.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      host
        .locator("video")
        .evaluate((v) => !v.paused && v.muted && v.readyState >= 2),
    )
    .toBe(true);
  await capture("08-trailer-muted.png");
  await host.getByRole("button", { name: "Off", exact: true }).click();
  await host.getByRole("button", { name: "Collection", exact: false }).click();
  await expect(
    host.getByRole("main", { name: "Game collection" }),
  ).toBeVisible();
  await capture("06-library-720.png");
  await host.locator(".collection-controls summary").click();
  await host
    .getByRole("combobox", { name: "Filter by players" })
    .selectOption("4");
  await expect(host.locator(".voyager-disc")).toHaveCount(3);
  await host.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      const s = await host.evaluate(() => window.waterconsole.getState());
      return s.catalog.find((g) => g.id === s.selectedGameId).maxPlayers;
    })
    .toBe(4);
  await host
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(host.locator(".voyager-disc")).toHaveCount(5);
  await host.keyboard.press("Escape");
  await host
    .getByRole("button", { name: "Session settings", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Audio & appearance", exact: true })
    .click();
  await expect(
    host.getByRole("combobox", { name: "Motion", exact: true }),
  ).toBeVisible();
  await host
    .getByRole("combobox", { name: "Motion", exact: true })
    .selectOption("reduced");
  await expect(host.locator("html")).toHaveAttribute("data-motion", "reduced");
  await capture("07-settings.png");
  await host.keyboard.press("Escape");
  const bad = await host.evaluate(() =>
    window.waterconsole.presentation({
      type: "import",
      gameId: "../../secret",
      kind: "trailer",
    }),
  );
  assert.equal(bad.ok, false);
  assert.equal(
    (await fetch(new URL("/media/test.mp4", snapshot.pairing.url))).status,
    404,
  );
  assert.equal(
    (await fetch(new URL("/audio/login.mp3", snapshot.pairing.url))).status,
    404,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Voyager screens, 1080p/720p, preferences, PC-only media, and three native integrations detected without launching games",
  );
  console.log(JSON.stringify(readiness));
} finally {
  await desktop.close();
}
