import {NativeRouter} from "./native-router";
import {LibraryCoordinator} from "./library-ipc";
import { PresentationStore } from "./presentation-store";
import { downloadSteamTrailer, downloadSteamTrailerAudio } from "./trailer-download";
import { imageDimensions } from "./library-images";
import { steamTrailerAppId, type PresentationCommand, type PresentationState } from "../shared/presentation";
import {
  app,
  shell,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  session,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import { readFile, rm, stat } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CommandResult, HostCommand, HostState } from "../shared/types";
import type { NativeCommand, NativeInputSnapshot } from "../shared/types";
import { NativeGame } from "./native-game";
import { loadLocalGameArtwork } from "./game-art";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "waterconsole",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
app.setName("Voyager");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setAppUserModelId("org.voyager.console");
{
  const dataDirectory = path.resolve(process.env.VOYAGER_DATA_DIR || (process.env.WATERCONSOLE_TEST === "1" ? process.env.WATERCONSOLE_DATA_DIR : undefined) || path.join(app.getPath("appData"), "Voyager"));
  mkdirSync(dataDirectory, { recursive: true });
  app.setPath("userData", dataDirectory);
}
const startupFullscreen = process.env.WATERCONSOLE_WINDOWED !== "1";
const singleInstance = app.requestSingleInstanceLock({ startupFullscreen });
if (!singleInstance) app.quit();
let window: BrowserWindow | null = null;
let service: UtilityProcess | null = null;
let snapshot: HostState | null = null;
let quitting = false;
let requestId = 0;
let startPromise: Promise<void> | null = null;
let nativeGame: NativeRouter | null = null;
let library:LibraryCoordinator;
const requests = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function broadcast() {
  if (snapshot && window && !window.isDestroyed())
    window.webContents.send("wc:state", snapshot);
}
function rejectRequests(message: string) {
  for (const request of requests.values()) {
    clearTimeout(request.timer);
    request.reject(new Error(message));
  }
  requests.clear();
}
function serviceFailed(message: string) {
  nativeGame?.reset();
  rejectRequests(message);
  if (snapshot) {
    snapshot = {
      ...snapshot,
      pending: [],
      players: snapshot.players.map((p) => ({
        ...p,
        connected: false,
        buttons: [],
        axes: { x: 0, y: 0 },
      })),
      network: { ...snapshot.network, status: "error", error: message },
    };
    broadcast();
  }
}

async function startService() {
  if (startPromise) return startPromise;
  startPromise = new Promise<void>((resolve, reject) => {
    let ready = false;
    const deadline = setTimeout(() => {
      service?.kill();
      reject(
        new Error(
          "The local server did not start in time. Restart WaterConsole.",
        ),
      );
    }, 20000);
    const config = {
      address: process.env.WATERCONSOLE_ADDRESS || undefined,
      port: 8787,
      publicDir: path.join(app.getAppPath(), "build", "renderer"),
      dataDir: app.getPath("userData"),
      initialNativeState: nativeGame?.getState(),
      ...library.config(),
    };
    const configFile=path.join(app.getPath("userData"),"server-config.json");
    writeFileSync(configFile,JSON.stringify(config),{mode:0o600});
    const child = utilityProcess.fork(
      path.join(app.getAppPath(), "build", "server", "entry.cjs"),
      ["--config-file", configFile],
      { stdio: "pipe", serviceName: "WaterConsole LAN server" },
    );
    service = child;
    child.on(
      "message",
      (message: {
        type: string;
        state?: HostState;
        id?: number | string;
        result?: unknown;
        message?: string;
        command?: NativeCommand;
        snapshot?: NativeInputSnapshot;
      }) => {
        if (
          message.type === "native-command" &&
          message.id !== undefined &&
          message.command
        ) {
          void (
            nativeGame?.command(message.command) ||
            Promise.resolve({
              ok: false,
              error: "Native games are unavailable.",
            })
          )
            .then((result) => {
              if (service === child)
                child.postMessage({
                  type: "native-result",
                  id: message.id,
                  result,
                });
            })
            .catch(() => {
              if (service === child)
                child.postMessage({
                  type: "native-result",
                  id: message.id,
                  result: { ok: false, error: "Native game command failed." },
                });
            });
          return;
        }
        if (message.type === "native-input" && message.snapshot) {
          nativeGame?.input(message.snapshot);
          return;
        }
        if (
          (message.type === "ready" || message.type === "state") &&
          message.state
        ) {
          snapshot = message.state;
          broadcast();
        }
        if (message.type === "ready") {
          ready = true;
          clearTimeout(deadline);
          resolve();
        }
        if (message.type === "response" && typeof message.id === "number") {
          const pending = requests.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            requests.delete(message.id);
            pending.resolve(message.result);
          }
        }
        if (message.type === "fatal") {
          const error = new Error(message.message || "Local server failed.");
          clearTimeout(deadline);
          serviceFailed(error.message);
          if (!ready) reject(error);
        }
      },
    );
    child.on("exit", () => {
      void nativeGame?.stop();
      clearTimeout(deadline);
      if (service === child) {
        service = null;
        startPromise = null;
      }
      if (!quitting) {
        serviceFailed(
          "The local server stopped. Choose your network again in Settings to restart it.",
        );
        if (!ready)
          reject(new Error("The local server exited during startup."));
      }
    });
  });
  try {
    await startPromise;
  } catch (error) {
    startPromise = null;
    throw error;
  }
}

async function request(command?: HostCommand): Promise<unknown> {
  if (!service) throw new Error("The local server is unavailable.");
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        requests.delete(id);
        reject(new Error("The local server took too long to respond."));
      },
      command?.type === "startGame" && command.gameId.startsWith("local-")
        ? 100_000
        : command?.type === "startGame" &&
        ["hotwheels-unleashed", "disney-speedstorm", "brawlhalla"].includes(
          command.gameId,
        )
        ? 75_000
        : 25000,
    );
    requests.set(id, { resolve, reject, timer });
    service!.postMessage({
      type: "request",
      id,
      ...(command ? { command } : {}),
    });
  });
}

async function serviceCall(type:string,payload:Record<string,unknown>):Promise<any>{
 if(!service)throw new Error("The local server is unavailable.");const id=++requestId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(new Error("The library session did not respond."));},20000);requests.set(id,{resolve,reject,timer});service!.postMessage({type,id,...payload});});
}
function validSender(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame?.url !== "waterconsole://app/host.html"
  )
    throw new Error("Untrusted IPC sender.");
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    roundedCorners: false,
    hasShadow: false,
    fullscreen: startupFullscreen,
    show: false,
    backgroundColor: "#090a0b",
    title: "Voyager",
    icon: path.join(app.getAppPath(), "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(app.getAppPath(), "build", "electron", "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      offscreen: process.env.WATERCONSOLE_TEST === "1",
      backgroundThrottling: process.env.WATERCONSOLE_TEST !== "1",
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== "waterconsole://app/host.html") event.preventDefault();
  });
  window.on("closed", () => {
    window = null;
  });
  window.once("ready-to-show", () => {
    if (!window) return;
    window.setFullScreen(startupFullscreen);
    if (process.env.WATERCONSOLE_TEST !== "1") window.show();
  });
  window.once("show", () => {
    if (startupFullscreen) window?.setFullScreen(true);
  });
  await window.loadURL("waterconsole://app/host.html");
}

app.on("second-instance", (_event, _commandLine, _workingDirectory, data) => {
  if (window) {
    if (window.isMinimized()) window.restore();
    const windowed = typeof data === "object" && data !== null && "startupFullscreen" in data && data.startupFullscreen === false;
    window.setFullScreen(!windowed);
    if (process.env.WATERCONSOLE_TEST !== "1") {
      window.show();
      window.focus();
    }
  }
});
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  const child = service;
  void Promise.allSettled([
    nativeGame?.stop(),
    new Promise<void>((resolve) => {
      if (!child) return resolve();
      const deadline = setTimeout(() => {
        child.kill();
        resolve();
      }, 1800);
      child.once("exit", () => {
        clearTimeout(deadline);
        resolve();
      });
      child.postMessage({ type: "shutdown" });
    }),
  ]).then(() => app.quit());
});
app.on("will-quit", () => {
  service?.kill();
  rejectRequests("WaterConsole is closing.");
});
app.on("window-all-closed", () => app.quit());

if (singleInstance)
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const helperPath = app.isPackaged
      ? path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "native",
          "WaterConsole.InputBridge.exe",
        )
      : path.join(
          app.getAppPath(),
          "build",
          "native",
          "WaterConsole.InputBridge.exe",
        );
    library=new LibraryCoordinator(()=>nativeGame,validSender,(catalog,definitions,assetsDirectory)=>serviceCall("catalog",{catalog,definitions,assetsDirectory}),(gameId,definition,modeId)=>serviceCall("studio-preview",{preview:{gameId,definition,modeId}}),()=>serviceCall("studio-preview-end",{}));
    await library.initialize();library.register();
    const legacyNative = new NativeGame(
      helperPath,
      (state) => nativeGame?.legacyState(state),
      () => {
        if (!quitting && process.env.WATERCONSOLE_TEST !== "1")
          window?.minimize();
      },
      () => {
        if (!quitting && window && process.env.WATERCONSOLE_TEST !== "1") {
          window.restore();
          window.show();
          window.focus();
        }
      },
      (feedback) => nativeGame?.legacyRumble(feedback),
    );
    nativeGame=new NativeRouter(legacyNative,library.store,helperPath.replace("WaterConsole.InputBridge.exe","WaterConsole.UserBridge.exe"),
      state=>service?.postMessage({type:"native-state",state}),
      ()=>{if(!quitting&&process.env.WATERCONSOLE_TEST!=="1")window?.minimize();},
      ()=>{if(!quitting&&window&&process.env.WATERCONSOLE_TEST!=="1"){window.restore();window.show();window.focus();}},
      feedback=>service?.postMessage({type:"native-rumble",feedback}),
      appId=>shell.openExternal("steam://rungameid/"+appId),route=>shell.openExternal(route));
    await nativeGame.initialize();
    const rendererRoot = path.join(app.getAppPath(), "build", "renderer");
    const projectRoot = app.isPackaged
      ? path.resolve(path.dirname(app.getPath("exe")), "../..")
      : app.getAppPath();
    // NSIS replaces the application directory on upgrade; keep private art beside it.
    const localLibraryDirectory = app.isPackaged
      ? path.resolve(
          path.dirname(app.getPath("exe")),
          "../Voyager-data/library-art",
        )
      : path.join(projectRoot, "library-art");
    const gameArtwork = await loadLocalGameArtwork(
      path.join(projectRoot, "Game 1/private-assets/library-art"),
      path.join(projectRoot, "research/private/hotwheels/library-art"),
      path.join(projectRoot, "research/private/disney-speedstorm/library-art"),
      path.join(projectRoot, "research/private/brawlhalla/library-art"),
      localLibraryDirectory,
      app.isPackaged ? path.join(process.resourcesPath, "library-art") : undefined,
    );
    const presentation = new PresentationStore(app.getPath("userData"));
    await presentation.initialize();
    const trailerJobs = new Map<string, Promise<PresentationState>>();
    protocol.handle("waterconsole", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== "app" || request.method !== "GET")
          return new Response("Not found", { status: 404 });
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        if (relative.startsWith("media/")) return await presentation.response(relative.slice(6), request.headers.get("range"));
        if (["audio/login.mp3", "audio/lobby.mp3", "audio/startup.ogg"].includes(relative)) {
          const bytes = await readFile(path.join(app.getAppPath(), "assets", relative));
          return new Response(new Uint8Array(bytes), { headers: { "Content-Type": relative.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg", "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff" } });
        }
        if(relative.startsWith("user-assets/")){
          const id=relative.slice("user-assets/".length);const bytes=await library.store.readAsset(id);
          return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/png","X-Content-Type-Options":"nosniff","Content-Security-Policy":csp,"Cache-Control":"private, max-age=3600"}});
        }
        if (relative.startsWith("library-art/")) {
          const bytes = gameArtwork.get(relative);
          return bytes
            ? new Response(new Uint8Array(bytes), {
                headers: {
                  "Content-Type": "image/jpeg",
                  "X-Content-Type-Options": "nosniff",
                  "Content-Security-Policy": csp,
                },
              })
            : new Response("Not found", { status: 404 });
        }
        const filename = path.resolve(rendererRoot, relative);
        const inside = path.relative(rendererRoot, filename);
        if (
          !inside ||
          inside.startsWith("..") ||
          path.isAbsolute(inside) ||
          relative.includes("\\")
        )
          return new Response("Not found", { status: 404 });
        const bytes = await readFile(filename);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type":
              mime[path.extname(filename)] || "application/octet-stream",
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
      callback({
        cancel:
          !details.url.startsWith("waterconsole://app/") &&
          !details.url.startsWith("devtools://"),
      }),
    );
    ipcMain.handle("voyager:presentation", async (event, command: PresentationCommand) => {
      validSender(event);
      try {
        if (!command || typeof command !== "object") throw new Error("Invalid presentation action.");
        if (command.type === "startup") throw new Error("Voyager uses its built-in Select Ultimate startup sound.");
        if (command.type === "get") return { ok: true, state: presentation.get() };
        if (command.type === "settings") return { ok: true, state: await presentation.settings(command.settings) };
        if (command.type === "download" || command.type === "ensure") {
          if (!snapshot?.catalog?.some(g => g.id === command.gameId)) throw new Error("Unknown game.");
          const current = presentation.get(), media = current.games[command.gameId];
          const storeRef = library.store.get(command.gameId)?.storeRef;
          const needsAudio = media?.trailer && !media.trailerAudioChecked && media.trailerName?.startsWith("Steam · ");
          if (command.type === "ensure" && (!current.settings.trailers || (media?.trailer && !needsAudio) || media?.trailerDisabled || !steamTrailerAppId(command.gameId,storeRef) || (process.env.WATERCONSOLE_TEST === "1" && process.env.VOYAGER_TEST_NO_TRAILER_FETCH === "1"))) return {ok:true,state:current};
          const download = async () => {
            if(command.type === "ensure" && needsAudio && media.trailer) {
              const result=await downloadSteamTrailerAudio(command.gameId,path.join(app.getPath("userData"),"downloads"),fetch,storeRef,media.trailerName);
              try {
                const audioAsset=result?await presentation.importFile(result.filename,"trailer-audio"):undefined;
                return await presentation.setTrailerAudio(command.gameId,media.trailer,audioAsset);
              } finally {if(result)await rm(result.filename,{force:true});}
            }
            const result = await downloadSteamTrailer(command.gameId, path.join(app.getPath("userData"), "downloads"), fetch, storeRef);
            try {
              const latest = presentation.get().games[command.gameId];
              if (command.type === "ensure" && (latest?.trailer || latest?.trailerDisabled)) return presentation.get();
              const asset = await presentation.importFile(result.filename, "trailer");
              const audioAsset=result.audioFilename?await presentation.importFile(result.audioFilename,"trailer-audio"):undefined;
              return await presentation.setMedia(command.gameId, "trailer", asset, result.name, command.type === "ensure", audioAsset);
            } finally { await rm(result.filename, { force: true });if(result.audioFilename)await rm(result.audioFilename,{force:true}); }
          };
          if (command.type === "download") return {ok:true,state:await download()};
          if (!trailerJobs.has(command.gameId)) {
            const job = download().finally(()=>trailerJobs.delete(command.gameId));
            trailerJobs.set(command.gameId,job);
          }
          return {ok:true,state:await trailerJobs.get(command.gameId)};
        }
        if (command.type === "import" || command.type === "remove") {
          if (!snapshot?.catalog?.some(g => g.id === command.gameId)) throw new Error("Unknown game.");
          if (!["banner", "trailer"].includes(command.kind)) throw new Error("Unknown media type.");
          if (command.type === "remove") return { ok: true, state: await presentation.setMedia(command.gameId, command.kind) };
        }
        if (command.type === "import") {
          const kind = command.kind;
          const choice = await dialog.showOpenDialog(window!, { title: `Choose ${kind}`, properties: ["openFile"], filters: [{ name: kind, extensions: kind === "trailer" ? ["mp4", "webm"] : ["png", "jpg", "jpeg", "webp"] }] });
          if (choice.canceled || !choice.filePaths[0]) return { ok: true, state: presentation.get() };
          const filename = choice.filePaths[0];
          let asset: string;
          if (kind === "banner") {
            if ((await stat(filename)).size > 20 * 1024 * 1024) throw new Error("Choose an image under 20 MB.");
            const bytes = await readFile(filename);
            const dimensions = imageDimensions(bytes);
            if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 32e6) throw new Error("Choose an image below 32 megapixels.");
            const image = nativeImage.createFromBuffer(bytes);
            if (image.isEmpty()) throw new Error("This image could not be opened.");
            asset = await presentation.importBanner(image.resize({ width: Math.min(2560, image.getSize().width) }).toPNG());
          } else asset = await presentation.importFile(filename, kind);
          return { ok: true, state: await presentation.setMedia(command.gameId, command.kind, asset, path.basename(filename)) };
        }
        throw new Error("Unknown presentation action.");
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Media could not be saved." }; }
    });
    ipcMain.handle("wc:get-state", async (event) => {
      validSender(event);
      if (!snapshot) await startService();
      return snapshot;
    });
    ipcMain.handle(
      "wc:command",
      async (event, command: HostCommand): Promise<CommandResult> => {
        validSender(event);
        try {
          if (
            !service &&
            command &&
            (command.type === "setNetwork" || command.type === "resetSession")
          )
            await startService();
          return (await request(command)) as CommandResult;
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Command failed.",
          };
        }
      },
    );
    ipcMain.handle("wc:fullscreen", (event) => {
      validSender(event);
      if (!window) return false;
      window.setFullScreen(!window.isFullScreen());
      return window.isFullScreen();
    });
    ipcMain.handle("wc:get-fullscreen", (event) => {
      validSender(event);
      return window?.isFullScreen() ?? false;
    });
    ipcMain.on("wc:minimize", (event) => {
      validSender(event);
      window?.minimize();
    });
    ipcMain.on("wc:quit", (event) => {
      validSender(event);
      app.quit();
    });
    try {
      await startService();
      await createWindow();
    } catch (error) {
      await dialog.showMessageBox({
        type: "error",
        title: "WaterConsole could not start",
        message:
          error instanceof Error
            ? error.message
            : "The local server could not be started.",
        detail:
          "Check that your network is available, then open WaterConsole again.",
      });
      app.quit();
    }
  });
