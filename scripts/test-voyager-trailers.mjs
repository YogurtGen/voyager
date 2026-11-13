import { _electron, expect } from "playwright/test";
import electronPath from "electron";
import { mkdir, cp, writeFile, stat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const output = path.resolve("test-results/voyager-trailers");
const cached = process.argv.includes("--cached");
const prior = cached ? JSON.parse(await readFile(path.join(output,"report.json"),"utf8")) : null;
const dataDir = prior?.dataDir || path.resolve(".local", `voyager-trailers-${Date.now()}`);
assert.ok(path.resolve(dataDir).startsWith(path.resolve(".local")+path.sep+"voyager-trailers-"));
await mkdir(output, { recursive: true });
await mkdir(dataDir, { recursive: true });
if (!cached) await cp(
  path.resolve(".local/user-data/library"),
  path.join(dataDir, "library"),
  { recursive: true },
);
const cachedGames={};
if(cached){
  await cp(path.join(output,"report.json"),path.join(output,"live-download-report.json"),{force:false});
  const files=await Promise.all((await readdir(path.join(dataDir,"media"))).map(async asset=>({asset,bytes:(await stat(path.join(dataDir,"media",asset))).size})));
  for(const game of prior.results){
    const match=game.asset?files.filter(f=>f.asset===game.asset):files.filter(f=>f.bytes===game.bytes);
    assert.equal(match.length,1,"Each previously verified official asset must have an unambiguous cache match");
    cachedGames[game.id]={trailer:match[0].asset,trailerName:game.source,trailerDisabled:false};
  }
}
await writeFile(
  path.join(dataDir, "presentation.json"),
  JSON.stringify({
    settings: {
      music: false,
      startupSound: false,
      trailerSound: false,
      autoplay: true,
      trailers: true,
      motion: "full",
    },
    games: cachedGames,
  }),
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: dataDir,
  VOYAGER_LIBRARY_DIR: dataDir,
  WATERCONSOLE_DISABLE_NATIVE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VOYAGER_TEST_NO_TRAILER_FETCH;
const desktop = await _electron.launch({
  executablePath: electronPath,
  args: [".", "--force-device-scale-factor=1"],
  env,
  timeout: 35000,
});
const results = [],
  errors = [];
try {
  const page = await desktop.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1536, 864),
  );
  await page.setViewportSize({ width: 1536, height: 864 });
  await expect(
    page.getByRole("dialog", { name: "Voyager opening" }),
  ).toHaveCount(0, { timeout: 20000 });
  await page.evaluate(() => {
    window.__sceneChecks = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = function (update) {
      const kind = document.documentElement.dataset.sceneTransition;
      const result = start(update);
      result.ready
        .then(() =>
          window.__sceneChecks.push({
            kind,
            ready: true,
            discName: document.querySelector(
              ".lobby-disc .disc-body,.collection-disc[data-active] .disc-body",
            )
              ? getComputedStyle(
                  document.querySelector(
                    ".lobby-disc .disc-body,.collection-disc[data-active] .disc-body",
                  ),
                ).viewTransitionName
              : null,
          }),
        )
        .catch((e) =>
          window.__sceneChecks.push({ kind, ready: false, error: e.message }),
        );
      return result;
    };
  });
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  const catalog = (await page.evaluate(() => window.waterconsole.getState()))
    .catalog;
  const games = catalog.filter((g) => g.runtime === "native");
  assert.ok(
    games.some((g) => g.title.includes("Arkham Knight")),
    "Actual copied Arkham Knight record is required",
  );
  for (const game of games) {
    await page.evaluate(
      (id) => window.waterconsole.command({ type: "selectGame", gameId: id }),
      game.id,
    );
    await expect(page.locator(".voyager-game-lobby")).toBeVisible();
    if(await page.getByRole("button",{name:"Play",exact:true}).count())await page.getByRole("button",{name:"Play",exact:true}).click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const v = document.querySelector(".game-lobby-backdrop video");
            return Boolean(
              v &&
              v.readyState >= 2 &&
              !v.paused &&
              v.muted &&
              v.currentTime > 0.1,
            );
          }),
        { timeout: 180000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    await expect(page.locator(".lobby-disc")).toHaveAttribute(
      "data-spinning",
      "true",
    );
    await page.locator(".game-lobby-backdrop video").evaluate(v=>{v.currentTime=Math.min(20,v.duration*.2);});
    await expect.poll(()=>page.locator(".game-lobby-backdrop video").evaluate(v=>!v.seeking&&v.readyState>=2&&v.currentTime>=2&&Number(getComputedStyle(v).opacity)>.99)).toBe(true);
    const media = (
      await page.evaluate(() =>
        window.waterconsole.presentation({ type: "get" }),
      )
    ).state.games[game.id];
    const info = await stat(path.join(dataDir, "media", media.trailer));
    assert.ok(info.size > 32);
    const video = await page
      .locator("video")
      .evaluate((v) => ({
        width: v.videoWidth,
        height: v.videoHeight,
        duration: v.duration,
        muted: v.muted,
        currentTime: v.currentTime,
      }));
    assert.ok(video.width >= 640 && video.height >= 360);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.locator(".lobby-disc")).toHaveAttribute(
      "data-spinning",
      "false",
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".lobby-disc")).toHaveAttribute(
      "data-spinning",
      "true",
    );
    await page.screenshot({
      path: path.join(output, `${game.id}-playing.png`),
    });
    await desktop.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, path.resolve("test-results/voyager/trailer-fixture.mp4"));
    await page.getByRole("button", { name: "Edit game", exact: true }).click();
    if (game.local) {
      await expect(
        page.locator(".library-workspace .game-builder"),
      ).toBeVisible();
      if (
        await page
          .getByRole("button", { name: "Skip tutorial", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "Skip tutorial", exact: true })
          .click();
      await page.locator(".builder-steps>button").nth(2).click();
    }
    await page
      .getByRole("button", { name: "Choose trailer", exact: true })
      .click();
    await expect(
      page.getByText("trailer-fixture.mp4", { exact: true }),
    ).toBeVisible();
    const custom = (
      await page.evaluate(() =>
        window.waterconsole.presentation({ type: "get" }),
      )
    ).state.games[game.id];
    assert.notEqual(custom.trailer, media.trailer);
    const ensured = await page.evaluate(
      (id) => window.waterconsole.presentation({ type: "ensure", gameId: id }),
      game.id,
    );
    assert.equal(
      ensured.state.games[game.id].trailer,
      custom.trailer,
      "Auto prepare must preserve the user's replacement",
    );
    if (game.local)
      await page
        .locator(".builder-header")
        .getByRole("button", { name: "Close", exact: true })
        .click();
    else await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        page
          .locator(".game-lobby-backdrop video")
          .evaluate((v) => v.readyState >= 2 && !v.paused && v.muted),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Off", exact: true }).click();
    await expect(page.locator(".game-lobby-backdrop video")).toHaveCount(0);
    if (game.local) {
      await page
        .getByRole("button", { name: "Controller Studio", exact: true })
        .click();
      await expect(page.locator(".controller-studio")).toBeVisible();
      if (
        await page
          .getByRole("button", { name: "Skip tutorial", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "Skip tutorial", exact: true })
          .click();
      await page
        .locator(".studio-editor-header")
        .getByRole("button", { name: /Game setup/ })
        .click();
      await expect(page.locator(".game-builder")).toBeVisible();
      await page
        .locator(".builder-header")
        .getByRole("button", { name: "Close", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Collection", exact: false })
      .click();
    await expect(page.locator(".voyager-collection")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.dataset.sceneTransition || "",
        ),
      )
      .toBe("");
    results.push({
      asset: media.trailer,
      id: game.id,
      title: game.title,
      source: media.trailerName,
      bytes: info.size,
      video,
      replacement: true,
      preservedCustom: true,
    });
    console.log(
      `PASS ${game.title}: official background ${video.width}×${video.height}, muted Play/Pause/Off, replace through Edit game, custom retained`,
    );
  }
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await expect(page.locator(".game-builder")).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Skip tutorial", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Skip tutorial", exact: true })
      .click();
  await page
    .locator(".builder-header")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.sceneTransition || "",
      ),
    )
    .toBe("");
  const transitions = await page.evaluate(() => window.__sceneChecks);
  assert.ok(
    transitions.some(
      (t) => t.kind === "disc" && t.ready && t.discName === "voyager-disc",
    ),
  );
  assert.ok(transitions.some((t) => t.kind === "panel" && t.ready));
  assert.ok(transitions.some((t) => t.kind === "studio" && t.ready));
  assert.deepEqual(
    transitions.filter((t) => !t.ready),
    [],
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify({ dataDir, providerMode:cached?"verified official cache":"live Steam download", results, transitions, errors }, null, 2),
  );
  console.log(
    "PASS real-source trailer playback and shared disc/panel transitions; no native game launched",
  );
} finally {
  await desktop.close();
}
