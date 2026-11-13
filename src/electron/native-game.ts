import {
  spawn,
  execFile,
  type ChildProcessWithoutNullStreams,
  type ChildProcess,
} from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { shell } from "electron";
import type {
  CommandResult,
  NativeCommand,
  NativeInputSnapshot,
  NativeRuntimeState,
  NativeGameId,
  NativeRumble,
} from "../shared/types";

import { nativeRacingGame, nativeSlotCount } from "../shared/types";
import { confirmHotwheelsQuit, waitForNativeQuit } from "./hotwheels-quit";

const neutral = (): NativeInputSnapshot => ({
  epoch: 0,
  controls: "menu",
  players: [
    { slot: 1, buttons: [] },
    { slot: 2, buttons: [] },
  ],
});
export class NativeGame {
  private helper: ChildProcessWithoutNullStreams | null = null;
  private game: ChildProcess | null = null;
  private pid = 0;
  private owned = false;
  private closing = false;
  private quitting = false;
  private stopRequest: Promise<CommandResult> | null = null;
  private operation = 0;
  private lastInput = 0;
  private frame = neutral();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private buffer = "";
  private executable: string | null = null;
  private executables: Partial<Record<NativeGameId, string>> = {};
  private state: NativeRuntimeState = {
    available: false,
    status: "unavailable",
    controls: "menu",
    focused: false,
  };
  constructor(
    private helperPath: string,
    private onState: (state: NativeRuntimeState) => void,
    private onActivate: () => void,
    private onReturn: () => void,
    private onRumble: (feedback: NativeRumble) => void = () => {},
  ) {}
  getState() {
    return structuredClone(this.state);
  }
  private publish(patch: Partial<NativeRuntimeState>) {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next;
    this.onState(this.getState());
  }
  async initialize() {
    if (
      process.platform !== "win32" ||
      process.env.WATERCONSOLE_DISABLE_NATIVE === "1"
    )
      return this.getState();
    const candidates = [
      process.env.WATERCONSOLE_IDOL_PATH,
      "E:/SteamLibrary/steamapps/common/Idol Showdown/Idol Showdown.exe",
    ];
    const steamRoots = [
      path.join(
        process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
        "Steam",
      ),
      path.join(process.env.ProgramFiles || "C:/Program Files", "Steam"),
    ];
    for (const root of steamRoots) {
      candidates.push(
        path.join(root, "steamapps/common/Idol Showdown/Idol Showdown.exe"),
      );
      try {
        const text = await readFile(
          path.join(root, "steamapps/libraryfolders.vdf"),
          "utf8",
        );
        for (const match of text.matchAll(/"path"\s*"([^"]+)"/g))
          candidates.push(
            path.join(
              match[1].replace(/\\\\/g, "\\"),
              "steamapps/common/Idol Showdown/Idol Showdown.exe",
            ),
          );
      } catch {}
    }
    for (const candidate of candidates) {
      if (
        !candidate ||
        path.basename(candidate).toLowerCase() !== "idol showdown.exe"
      )
        continue;
      try {
        await access(candidate);
        await access(this.helperPath);
        const identity = await readFile(
          path.join(path.dirname(candidate), "Idol Showdown_Data/app.info"),
          "utf8",
        );
        if (!identity.includes("Idol Showdown")) continue;
        this.executables["idol-showdown"] = path.resolve(candidate);
        break;
      } catch {}
    }
    const hotwheels =
      process.env.WATERCONSOLE_HOTWHEELS_PATH ||
      "E:/Program Files/Games Program/Epic Games/HOTWHEELSUNLEASHED/hotwheels/Binaries/Win64/EpicGamesStore/hotwheels-Win64-Shipping.exe";
    if (
      path.basename(hotwheels).toLowerCase() === "hotwheels-win64-shipping.exe"
    ) {
      try {
        await access(hotwheels);
        await access(
          path.join(path.dirname(hotwheels), "EOSSDK-Win64-Shipping.dll"),
        );
        await access(this.helperPath);
        this.executables["hotwheels-unleashed"] = path.resolve(hotwheels);
      } catch {}
    }
    const speedstorm =
      process.env.WATERCONSOLE_SPEEDSTORM_PATH ||
      "E:/SteamLibrary/steamapps/common/DisneySpeedstorm/Disney_Speedstorm_x64_rtl.exe";
    if (
      path.basename(speedstorm).toLowerCase() ===
      "disney_speedstorm_x64_rtl.exe"
    ) {
      try {
        await access(speedstorm);
        await access(path.join(path.dirname(speedstorm), "steam_api64.dll"));
        await access(this.helperPath);
        this.executables["disney-speedstorm"] = path.resolve(speedstorm);
      } catch {}
    }
    const brawlhalla =
      process.env.WATERCONSOLE_BRAWLHALLA_PATH ||
      "E:/SteamLibrary/steamapps/common/Brawlhalla/Brawlhalla.exe";
    if (path.basename(brawlhalla).toLowerCase() === "brawlhalla.exe") {
      try {
        await access(brawlhalla);
        await access(this.helperPath);
        const descriptor = await readFile(
          path.join(path.dirname(brawlhalla), "META-INF/AIR/application.xml"),
          "utf8",
        );
        if (
          descriptor.includes("<id>BrawlhallaAir</id>") &&
          descriptor.includes("<filename>Brawlhalla</filename>")
        )
          this.executables.brawlhalla = path.resolve(brawlhalla);
      } catch {}
    }
    const games = {
      "idol-showdown": !!this.executables["idol-showdown"],
      "hotwheels-unleashed": !!this.executables["hotwheels-unleashed"],
      "disney-speedstorm": !!this.executables["disney-speedstorm"],
      brawlhalla: !!this.executables.brawlhalla,
    };
    const available = Object.values(games).some(Boolean);
    this.publish({
      available,
      games,
      gamepad:
        games["hotwheels-unleashed"] ||
        games["disney-speedstorm"] ||
        games.brawlhalla
          ? await this.probeGamepad()
          : undefined,
      status: available ? "idle" : "unavailable",
      message: undefined,
    });
    return this.getState();
  }
  private async probeGamepad(): Promise<
    NonNullable<NativeRuntimeState["gamepad"]>
  > {
    return new Promise((resolve) =>
      execFile(
        this.helperPath,
        ["--gamepad-status"],
        { windowsHide: true, timeout: 3000, maxBuffer: 8192 },
        (error, stdout) => {
          try {
            const value = JSON.parse(stdout).gamepad;
            if (!error && typeof value?.available === "boolean") {
              resolve({
                available: value.available,
                message:
                  typeof value.message === "string"
                    ? value.message.slice(0, 240)
                    : undefined,
              });
              return;
            }
          } catch {}
          resolve({
            available: false,
            message:
              "Virtual Xbox controllers require the optional ViGEmBus driver on the PC.",
          });
        },
      ),
    );
  }
  private write(message: unknown) {
    if (this.helper && !this.helper.killed && this.helper.stdin.writable)
      this.helper.stdin.write(JSON.stringify(message) + "\n", () => {});
  }
  input(frame: NativeInputSnapshot) {
    if (this.pid) {
      this.frame = structuredClone(frame);
      this.lastInput = Date.now();
      if (!this.quitting) this.write({ type: "input", ...this.frame });
    }
  }
  reset() {
    this.lastInput = 0;
    this.frame.players = Array.from(
      { length: nativeSlotCount(this.state.gameId) },
      (_, index) => index + 1,
    ).map((slot) => ({ slot, buttons: [] }));
    this.write({ type: "reset" });
  }
  private async findRunning(): Promise<number> {
    return new Promise((resolve) =>
      execFile(
        this.helperPath,
        ["--find", this.executable!],
        { windowsHide: true, timeout: 3000 },
        (error, stdout) => {
          try {
            const value = JSON.parse(stdout);
            resolve(
              !error && Number.isInteger(value.pid) && value.pid > 0
                ? value.pid
                : 0,
            );
          } catch {
            resolve(0);
          }
        },
      ),
    );
  }
  private emergencyRelease(pid: number) {
    if (pid)
      execFile(
        this.helperPath,
        ["--release-pid", String(pid)],
        { windowsHide: true, timeout: 3000 },
        () => {},
      );
  }
  async command(command: NativeCommand): Promise<CommandResult> {
    if (command.type === "stop") {
      if (!this.stopRequest)
        this.stopRequest = this.requestStop().finally(() => {
          this.stopRequest = null;
        });
      return this.stopRequest;
    }
    if (command.type === "controls") {
      this.reset();
      this.frame.controls = command.mode;
      this.publish({ controls: command.mode });
      return { ok: true };
    }
    if (command.type === "focus") {
      if (!this.helper) return { ok: false, error: "The game is not running." };
      this.onActivate();
      this.write({ type: "focus" });
      return { ok: true };
    }
    return this.start(command.gameId || "idol-showdown");
  }
  private async start(gameId: NativeGameId): Promise<CommandResult> {
    if (this.helper && this.state.gameId !== gameId) await this.stop();
    this.executable = this.executables[gameId] || null;
    if (!this.executable)
      return {
        ok: false,
        error: "The selected original game is not installed on this PC.",
      };
    if (this.helper) return this.command({ type: "focus" });
    if (this.closing)
      return { ok: false, error: "The previous game session is closing." };
    const operation = ++this.operation;
    const cancelled = () => operation !== this.operation;
    const cancelledResult: CommandResult = {
      ok: false,
      error: "Game launch was cancelled.",
    };
    this.closing = false;
    this.frame = neutral();
    this.lastInput = 0;
    this.publish({
      gameId,
      status: "starting",
      controls: "menu",
      focused: false,
      message: undefined,
    });
    try {
      const previousPid = this.pid;
      const running = await this.findRunning();
      if (cancelled()) return cancelledResult;
      this.pid = running;
      this.owned = !this.pid || (this.owned && this.pid === previousPid);
      if (!this.pid) {
        if (gameId === "hotwheels-unleashed") {
          await shell.openExternal(
            "com.epicgames.launcher://apps/71e6bd85af1841f598526da595f22a62%3Adff2626bd13b457387875f9ba12f3309%3A0006475a83f143ba807174654bc09d38?action=launch&silent=true",
          );
          const launchDeadline = Date.now() + 45_000;
          while (Date.now() < launchDeadline && !this.pid && !cancelled()) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            this.pid = await this.findRunning();
          }
          if (cancelled()) {
            if (this.pid) await this.stop();
            return cancelledResult;
          }
          if (!this.pid)
            throw new Error(
              "Epic did not start HOT WHEELS. Complete any sign-in on the PC, then retry.",
            );
        } else if (gameId === "disney-speedstorm" || gameId === "brawlhalla") {
          await shell.openExternal(
            gameId === "brawlhalla"
              ? "steam://rungameid/291550"
              : "steam://rungameid/1537830",
          );
          const launchDeadline = Date.now() + 45_000;
          while (Date.now() < launchDeadline && !this.pid && !cancelled()) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            this.pid = await this.findRunning();
          }
          if (cancelled()) {
            if (this.pid) await this.stop();
            return cancelledResult;
          }
          if (!this.pid)
            throw new Error(
              `Steam did not start ${gameId === "brawlhalla" ? "Brawlhalla" : "Disney Speedstorm"}. Check Steam on the PC, then retry.`,
            );
        } else {
          const game = spawn(this.executable, [], {
            cwd: path.dirname(this.executable),
            windowsHide: false,
            stdio: "ignore",
          });
          this.game = game;
          this.pid = game.pid!;
          await new Promise<void>((resolve, reject) => {
            game.once("spawn", resolve);
            game.once("error", reject);
          });
          if (cancelled()) return cancelledResult;
          const launchedPid = this.pid;
          game.once("exit", () => {
            if (this.pid === launchedPid) void this.ended();
          });
        }
      }
      const helper = spawn(this.helperPath, ["--pid", String(this.pid)], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.helper = helper;
      this.buffer = "";
      helper.stdin.on("error", () => {});
      helper.stderr.on("data", () => {});
      await new Promise<void>((resolve, reject) => {
        let ready = false;
        const deadline = setTimeout(
          () => reject(new Error("The game input bridge did not start.")),
          10000,
        );
        helper.once("error", (error) => {
          clearTimeout(deadline);
          reject(error);
        });
        helper.stdout.on("data", (chunk) => {
          if (this.helper !== helper) return;
          this.buffer += chunk.toString();
          if (this.buffer.length > 32768) {
            this.reset();
            this.buffer = "";
            return;
          }
          let end;
          while ((end = this.buffer.indexOf("\n")) >= 0) {
            const line = this.buffer.slice(0, end);
            this.buffer = this.buffer.slice(end + 1);
            try {
              const event = JSON.parse(line);
              if (typeof event.gamepad?.available === "boolean")
                this.publish({
                  gamepad: {
                    available: event.gamepad.available,
                    message:
                      typeof event.gamepad.message === "string"
                        ? event.gamepad.message.slice(0, 240)
                        : undefined,
                  },
                });
              if (
                event.type === "rumble" &&
                (nativeRacingGame(this.state.gameId) ||
                  this.state.gameId === "brawlhalla") &&
                this.state.focused &&
                this.frame.controls ===
                  (this.state.gameId === "brawlhalla" ? "fight" : "race") &&
                event.epoch === this.frame.epoch &&
                Date.now() - this.lastInput <= 250 &&
                Number.isInteger(event.slot) &&
                event.slot >= 1 &&
                event.slot <= nativeSlotCount(this.state.gameId) &&
                [event.largeMotor, event.smallMotor].every(
                  (motor) =>
                    Number.isInteger(motor) && motor >= 0 && motor <= 255,
                )
              )
                this.onRumble({
                  slot: event.slot,
                  epoch: event.epoch,
                  largeMotor: event.largeMotor,
                  smallMotor: event.smallMotor,
                });
              if (event.type === "ready") {
                ready = true;
                clearTimeout(deadline);
                resolve();
              }
              if (event.type === "status" && !this.closing) {
                if (!this.quitting && !!event.focused !== this.state.focused)
                  this.reset();
                this.publish({
                  focused: !!event.focused,
                  status: event.error
                    ? "error"
                    : event.focused
                      ? "running"
                      : "paused",
                  message: event.error || undefined,
                });
              }
              if (event.type === "exited") void this.ended();
              if (event.type === "error") {
                clearTimeout(deadline);
                reject(new Error(event.message));
              }
            } catch {}
          }
        });
        helper.once("exit", () => {
          clearTimeout(deadline);
          if (!ready) reject(new Error("The game input bridge exited."));
          if (!this.closing && this.helper === helper) {
            if (this.heartbeat) clearInterval(this.heartbeat);
            this.heartbeat = null;
            this.emergencyRelease(this.pid);
            this.helper = null;
            this.publish({
              status: "error",
              focused: false,
              message:
                "The game input bridge stopped. Return Home and launch again.",
            });
            this.onReturn();
          }
        });
      });
      if (cancelled()) return cancelledResult;
      this.heartbeat = setInterval(() => {
        if (this.quitting) return;
        const fresh = Date.now() - this.lastInput <= 250;
        this.write({
          type: "input",
          ...this.frame,
          players: fresh
            ? this.frame.players
            : Array.from(
                { length: nativeSlotCount(this.state.gameId) },
                (_, index) => ({ slot: index + 1, buttons: [] }),
              ),
        });
      }, 50);
      this.onActivate();
      // The game may create its window after the process/bridge is ready.
      for (
        let attempt = 0;
        attempt < 25 && !this.state.focused && !cancelled();
        attempt++
      ) {
        this.write({ type: "focus" });
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (cancelled()) return cancelledResult;
      if (!this.state.focused)
        this.publish({
          status: "paused",
          message: "Select the game window on the PC to enable input.",
        });
      return { ok: true };
    } catch (error) {
      if (cancelled()) return cancelledResult;
      await this.stop();
      this.publish({
        status: "error",
        message:
          error instanceof Error ? error.message : "The game could not start.",
      });
      return { ok: false, error: this.state.message };
    }
  }
  private async requestStop(): Promise<CommandResult> {
    if (
      !this.owned ||
      (!nativeRacingGame(this.state.gameId) &&
        this.state.gameId !== "brawlhalla") ||
      !this.helper ||
      !this.pid
    ) {
      await this.stop();
      return { ok: true };
    }
    const pid = this.pid,
      helper = this.helper,
      gameId = this.state.gameId;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const isRunning = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
        throw error;
      }
    };
    this.quitting = true;
    this.reset();
    this.frame.controls = "menu";
    this.publish({
      quitting: true,
      controls: "menu",
      message:
        gameId === "hotwheels-unleashed"
          ? "Closing HOT WHEELS and confirming its exit dialog…"
          : `Closing ${gameId === "brawlhalla" ? "Brawlhalla" : "Disney Speedstorm"}…`,
    });
    try {
      const quit =
        gameId === "hotwheels-unleashed"
          ? confirmHotwheelsQuit
          : waitForNativeQuit;
      const exited = await quit({
        isRunning,
        focused: () =>
          this.helper === helper && !this.closing && this.state.focused,
        input: (buttons) => {
          if (this.helper === helper && !this.closing)
            this.write({
              type: "input",
              epoch: this.frame.epoch,
              controls: "menu",
              players: Array.from(
                { length: nativeSlotCount(gameId) },
                (_, index) => ({
                  slot: index + 1,
                  buttons: index === 0 ? buttons : [],
                }),
              ),
            });
        },
        requestClose: async () => {
          this.onActivate();
          this.write({ type: "focus" });
          await wait(200);
          if (this.helper === helper && !this.closing)
            this.write({ type: "close-game" });
        },
        wait,
        now: Date.now,
      });
      if (exited) {
        if (this.pid === pid) await this.stop(false);
        return { ok: true };
      }
    } catch {
      /* Leave the live controller attached if normal exit cannot be verified. */
    } finally {
      this.quitting = false;
      this.reset();
      this.publish({ quitting: false });
    }
    this.publish({
      controls: "menu",
      message:
        "The game is still open. Use Confirm/Back on your phone to finish its exit dialog, or retry Stop & return Home.",
    });
    return { ok: false, error: this.state.message };
  }
  private async ended() {
    if (this.closing) return;
    await this.stop(false);
  }
  async stop(closeOwned = true) {
    if (this.closing) return;
    this.operation++;
    this.closing = true;
    this.reset();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const helper = this.helper;
    if (helper) {
      if (closeOwned && this.owned) this.write({ type: "close-game" });
      this.write({ type: "shutdown" });
      helper.stdin.end();
      await new Promise<void>((resolve) => {
        if (helper.exitCode !== null) return resolve();
        const deadline = setTimeout(() => {
          this.emergencyRelease(this.pid);
          helper.kill();
          resolve();
        }, 700);
        helper.once("exit", () => {
          clearTimeout(deadline);
          resolve();
        });
      });
    }
    if (closeOwned && this.owned && this.pid) {
      await new Promise<void>((resolve) =>
        execFile(
          this.helperPath,
          ["--close-pid", String(this.pid)],
          { windowsHide: true, timeout: 3000 },
          () => resolve(),
        ),
      );
    }
    this.helper = null;
    this.game = null;
    this.pid = 0;
    this.lastInput = 0;
    this.publish({
      status: this.state.available ? "idle" : "unavailable",
      focused: false,
      controls: "menu",
      quitting: false,
      message: undefined,
    });
    this.onReturn();
    this.closing = false;
  }
}
