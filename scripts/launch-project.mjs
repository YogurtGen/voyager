import { spawn, spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  open,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { needsProjectBuild } from "./project-build.mjs";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export async function projectIsRunning(root = projectRoot) {
  try {
    const { pid } = JSON.parse(
      await readFile(path.join(root, ".local/project-session.json"), "utf8"),
    );
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code === "EPERM";
    }
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
}
async function launch() {
  await mkdir(path.join(projectRoot, ".local"), { recursive: true });
  const log = await open(
    path.join(projectRoot, ".local/project-launch.log"),
    "a",
  );
  let child;
  let launchLock;
  const lockPath = path.join(projectRoot, ".local/project-launch.lock");
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.WATERCONSOLE_WINDOWED = process.argv.includes("--windowed") ? "1" : "0";
    const running = await projectIsRunning();
    if (!running) {
      try {
        launchLock = await open(lockPath, "wx");
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        // A second desktop click must not rebuild files while the first opens.
        let owner;
        try {
          owner = Number(await readFile(lockPath, "utf8"));
          if (!owner && Date.now() - (await stat(lockPath)).mtimeMs < 30000)
            return;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (owner) {
          try {
            process.kill(owner, 0);
            return;
          } catch (error) {
            if (error.code !== "ESRCH") return;
          }
        }
        await unlink(lockPath).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        try {
          launchLock = await open(lockPath, "wx");
        } catch (error) {
          if (error.code === "EEXIST") return;
          throw error;
        }
      }
      await launchLock.writeFile(String(process.pid));
    }
    if (!running && (await needsProjectBuild(projectRoot))) {
      await log.write(`\n${new Date().toISOString()} Applying project edits\n`);
      const code = await new Promise((resolve, reject) => {
        const builder = spawn(
          process.execPath,
          [
            path.join(projectRoot, "scripts/run-local.mjs"),
            "scripts/build.mjs",
          ],
          {
            cwd: projectRoot,
            env,
            windowsHide: true,
            stdio: ["ignore", log.fd, log.fd],
          },
        );
        builder.on("error", reject);
        builder.on("exit", resolve);
      });
      if (code !== 0)
        throw new Error(
          "Project build failed. Check .local/project-launch.log.",
        );
    }
    const executable = path.join(
      projectRoot,
      "node_modules/electron/dist/electron.exe",
    );
    await log.write(`\n${new Date().toISOString()} Opening ${projectRoot}\n`);
    child = spawn(executable, [projectRoot], {
      cwd: projectRoot,
      env,
      windowsHide: true,
      stdio: ["ignore", log.fd, log.fd],
    });
    const exited = new Promise((resolve) => {
      child.once("exit", resolve);
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    if (!running)
      await writeFile(
        path.join(projectRoot, ".local/project-session.json"),
        JSON.stringify({ pid: child.pid, projectRoot }),
      );
    if (launchLock) {
      await launchLock.close();
      launchLock = undefined;
      await unlink(lockPath);
    }
    const exitCode = await exited;
    await log.write(
      `${new Date().toISOString()} Voyager exited (${exitCode})\n`,
    );
    if (!running) {
      try {
        const current = JSON.parse(
          await readFile(
            path.join(projectRoot, ".local/project-session.json"),
            "utf8",
          ),
        );
        if (current.pid === child.pid)
          await unlink(path.join(projectRoot, ".local/project-session.json"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  } finally {
    if (launchLock) {
      await launchLock.close();
      await unlink(lockPath);
    }
    await log.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await launch();
  } catch (error) {
    await mkdir(path.join(projectRoot, ".local"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".local/project-launch-error.log"),
      String(error.stack || error),
    );
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($env:VOYAGER_LAUNCH_MESSAGE, 'Voyager') | Out-Null",
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          VOYAGER_LAUNCH_MESSAGE: `Voyager could not apply the project edits. Ask your coding assistant to check ${path.join(projectRoot, ".local/project-launch-error.log")}`,
        },
      },
    );
    process.exitCode = 1;
  }
}
