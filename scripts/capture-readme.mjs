import { _electron, chromium, expect } from "playwright/test";
import electronPath from "electron";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd(),
  data = path.join(root, ".local/readme-" + Date.now()),
  output = path.join(root, "docs/images");
await mkdir(data, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(
  path.join(data, "presentation.json"),
  JSON.stringify({
    settings: {
      music: false,
      startupSound: false,
      trailerSound: false,
      motion: "reduced",
    },
    games: {},
  }),
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DISABLE_NATIVE: "1",
  VOYAGER_DATA_DIR: data,
  VOYAGER_LIBRARY_DIR: data,
  VOYAGER_TEST_NO_TRAILER_FETCH: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
let app, browser;
try {
  app = await _electron.launch({
    executablePath: electronPath,
    args: [root, "--force-device-scale-factor=1"],
    env,
    timeout: 35000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  const state = () => page.evaluate(() => window.waterconsole.getState());
  async function capture(name) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) => image.decode().catch(() => {})),
      );
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
      const code = document.querySelector(".pair-code-button");
      if (code)
        for (const child of code.childNodes)
          if (child.nodeType === Node.TEXT_NODE && /\d/.test(child.textContent))
            child.textContent = " DEMO ";
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    const png = await app.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        )
      )
        .toPNG()
        .toString("base64"),
    );
    await writeFile(
      path.join(output, name + ".png"),
      Buffer.from(png, "base64"),
    );
  }
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .waitFor();
  await expect(
    page.getByRole("dialog", { name: "Voyager opening" }),
  ).toHaveCount(0, { timeout: 20000 });
  assert.deepEqual(
    (await state()).catalog.map((game) => game.id),
    ["controller-lab"],
  );
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enter game lobby", exact: true })
    .waitFor();
  await capture("collection");
  await page
    .getByRole("button", { name: "Enter game lobby", exact: true })
    .click();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const phones = [];
  for (const name of ["Nova", "Atlas", "Lyra", "Orion"]) {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await context.newPage();
    await phone.goto((await state()).pairing.url);
    await phone.getByLabel("Your name", { exact: true }).fill(name);
    await phone
      .getByRole("button", { name: "Connect to console", exact: true })
      .click();
    await page
      .locator(".pending-card")
      .filter({ hasText: name })
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await phone
      .getByRole("button", { name: "Enter controller", exact: true })
      .click();
    phones.push(phone);
  }
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.locator(".arena")).toHaveCount(1);
  for (const [index, name] of ["Left", "Right", "Up", "Down"].entries()) {
    const button = await phones[index].getByRole("button", { name, exact: true }).boundingBox();
    assert.ok(button);
    const touch = await phones[index].context().newCDPSession(phones[index]);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: button.x + button.width / 2, y: button.y + button.height / 2, id: 1 }] });
    await new Promise(resolve => setTimeout(resolve, 450));
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
  }
  await capture("controller-lab");
  await phones[0]
    .getByRole("button", { name: "Return to console", exact: true })
    .click();
  await expect.poll(async () => (await state()).phase).toBe("home");
  await browser.close();
  browser = undefined;

  const compiled = await build({
    stdin: {
      contents: 'export {newLocalGame} from "./src/shared/studio-model";',
      resolveDir: root,
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  const { newLocalGame } = await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputFiles[0].text).toString("base64")
  );
  const game = newLocalGame();
  game.title = "Your next game";
  game.description = "A demonstration of the editable controller workspace.";
  game.inputMethod = "keyboard";
  const saved = await page.evaluate(
    (game) => window.waterconsole.library({ type: "save", game }),
    game,
  );
  assert.ok(saved.ok, saved.error);
  await page.evaluate(
    (id) => window.waterconsole.command({ type: "selectGame", gameId: id }),
    saved.game.id,
  );
  await page
    .getByRole("button", { name: "Controller Studio", exact: true })
    .click();
  const tutorial = page.getByRole("button", {
    name: "Skip tutorial",
    exact: true,
  });
  await expect(tutorial).toBeVisible();
  await tutorial.click();
  await expect(page.locator(".guide-card")).toHaveCount(0);
  await expect(page.locator(".controller-studio")).toBeVisible();
  await capture("controller-studio");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        screenshots: ["collection", "controller-lab", "controller-studio"],
        errors,
        isolatedData: true,
        defaultCatalog: ["controller-lab"],
      },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  if (app) await app.close();
}
