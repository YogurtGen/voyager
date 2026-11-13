import { build } from "esbuild";
import { mkdir, readFile, writeFile, open, unlink } from "node:fs/promises";
import path from "node:path";
import { projectRoot, projectIsRunning } from "../scripts/launch-project.mjs";

const args = process.argv.slice(2);
if (!args.length) {
  console.log(
    "Create draft: node toolkit/game.mjs --template .local/game.json\nImport/update: node toolkit/game.mjs .local/game.json (close Voyager first)",
  );
  process.exit(0);
}
try {
  const compiled = await build({
    stdin: {
      contents:
        'export {LibraryStore} from "./src/electron/library-store";export {newLocalGame} from "./src/shared/studio-model";',
      resolveDir: projectRoot,
      sourcefile: "ai-game-tools.ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    logLevel: "silent",
  });
  const { LibraryStore, newLocalGame } = await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputFiles[0].text).toString("base64")
  );
  if (args[0] === "--template") {
    if (args.length !== 2) throw new Error("Provide the draft JSON filename.");
    const file = path.resolve(args[1]);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(newLocalGame(), null, 2), {
      flag: "wx",
    });
    console.log("Draft created: " + file);
  } else {
    if (args.length !== 1) throw new Error("Provide one game JSON filename.");
    if (await projectIsRunning())
      throw new Error(
        "Close Voyager before importing a game so unsaved edits are preserved.",
      );
    const lockPath = path.join(projectRoot, ".local/ai-game.lock");
    await mkdir(path.dirname(lockPath), { recursive: true });
    const lock = await open(lockPath, "wx");
    try {
      let directory =
        process.env.VOYAGER_LIBRARY_DIR || process.env.VOYAGER_DATA_DIR;
      if (!directory) {
        try {
          const locator = JSON.parse(
            await readFile(
              path.join(process.env.APPDATA, "Voyager/library-location.json"),
              "utf8",
            ),
          );
          if (
            typeof locator.directory === "string" &&
            path.isAbsolute(locator.directory)
          )
            directory = locator.directory;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      directory = directory || path.join(projectRoot, ".local/user-data");
      const store = new LibraryStore(directory, [
        process.execPath,
        path.join(projectRoot, "node_modules/electron/dist/electron.exe"),
      ]);
      await store.initialize();
      const saved = await store.save(
        JSON.parse(await readFile(path.resolve(args[0]), "utf8")),
      );
      console.log(
        JSON.stringify({
          id: saved.id,
          title: saved.title,
          revision: saved.revision,
          library: store.directory,
        }),
      );
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
