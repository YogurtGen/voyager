import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { WebSocket } from "ws";
import { createWaterConsoleServer as createServer } from "../src/server/index";
import { GAME_PRESETS } from "../src/shared/types";
const createWaterConsoleServer = (options: Parameters<typeof createServer>[0]) => createServer({ catalog: GAME_PRESETS, ...options });
import { COLLECTION_MOVE_INTERVAL, NAVIGATION_HOLD_INTERVAL } from "../src/shared/navigation-pacing";
import type {
  PairStatus,
  PairTicket,
  ServerMessage,
  SessionState,
  CommandResult,
  NativeCommand,
  NativeInputSnapshot,
} from "../src/shared/types";

type Server = Awaited<ReturnType<typeof createWaterConsoleServer>>;
let root: string;
let server: Server;
const liveSockets: WebSocket[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("Condition did not become true");
};
const url = (route = "") => `http://${server.address}:${server.port}${route}`;
const headers = () => ({ Origin: url(), "Content-Type": "application/json" });

async function requestPair(name = "Player") {
  const nonce = new URL(server.getState().pairing.url).hash.slice(
    "#nonce=".length,
  );
  const response = await fetch(url("/api/pair"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, nonce }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as PairTicket;
}
async function approve(name = "Player") {
  const ticket = await requestPair(name);
  expect(
    await server.command({ type: "approve", requestId: ticket.id }),
  ).toEqual({ ok: true });
  const response = await fetch(url(`/api/pair/${ticket.id}`), {
    headers: { Authorization: `Bearer ${ticket.secret}` },
  });
  const status = (await response.json()) as PairStatus;
  if (status.status !== "approved") throw new Error("Approval missing");
  return { ...status, ticket };
}
function openSocket(origin = url()) {
  const socket = new WebSocket(url("/ws").replace("http:", "ws:"), { origin });
  liveSockets.push(socket);
  socket.on("error", () => {});
  return socket;
}
function receive(socket: WebSocket, type: ServerMessage["type"]) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", listener);
      reject(new Error(`Missing ${type}`));
    }, 2000);
    const listener = (data: Buffer) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.type === type) {
        clearTimeout(timeout);
        socket.off("message", listener);
        resolve(message);
      }
    };
    socket.on("message", listener);
  });
}
function closed(socket: WebSocket) {
  return new Promise<number>((resolve) =>
    socket.once("close", (code) => resolve(code)),
  );
}
async function connect(token: string) {
  const socket = openSocket();
  await new Promise<void>((resolve) => socket.once("open", resolve));
  const response = receive(socket, "authenticated");
  socket.send(JSON.stringify({ type: "auth", version: 1, token }));
  const message = await response;
  if (message.type !== "authenticated")
    throw new Error("Authentication missing");
  return { socket, state: message.state };
}
function input(
  socket: WebSocket,
  epoch: number,
  seq: number,
  buttons: string[] = [],
  axes = { x: 0, y: 0 },
) {
  socket.send(
    JSON.stringify({ type: "input", version: 1, epoch, seq, buttons, axes }),
  );
}
async function rawGet(route: string, host?: string) {
  return await new Promise<number>((resolve) => {
    const request = http.get(
      {
        hostname: server.address,
        port: server.port,
        path: route,
        headers: { Host: host ?? `${server.address}:${server.port}` },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      },
    );
    request.on("error", () => resolve(0));
  });
}
async function portOpen(port: number) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

beforeEach(async () => {
  const testRoot = path.join(process.cwd(), ".local", "tests");
  await mkdir(testRoot, { recursive: true });
  root = await mkdtemp(path.join(testRoot, "server-"));
  await mkdir(path.join(root, "public", "assets"), { recursive: true });
  await writeFile(
    path.join(root, "public", "controller.html"),
    "<!doctype html><title>Controller</title>",
  );
  await writeFile(path.join(root, "public", "host.html"), "PRIVATE HOST");
  await writeFile(
    path.join(root, "public", "assets", "app.js"),
    'console.log("offline")',
  );
  server = await createWaterConsoleServer({
    address: "127.0.0.1",
    port: 0,
    publicDir: path.join(root, "public"),
    dataDir: path.join(root, "data"),
  });
});

describe("native game adapter boundary", () => {
  async function setupNative(
    hook?: (command: NativeCommand) => Promise<CommandResult>,
  ) {
    await server.close();
    const commands: NativeCommand[] = [];
    const snapshots: NativeInputSnapshot[] = [];
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
      initialNativeState: {
        available: true,
        status: "idle",
        controls: "menu",
        focused: false,
      },
      onNativeInput: (snapshot) => snapshots.push(structuredClone(snapshot)),
      onNativeCommand: async (command) => {
        commands.push(command);
        if (hook) return hook(command);
        if (command.type === "start")
          server.updateNativeState({
            available: true,
            status: "running",
            controls: "menu",
            focused: true,
          });
        if (command.type === "stop")
          server.updateNativeState({
            available: true,
            status: "idle",
            controls: "menu",
            focused: false,
          });
        return { ok: true };
      },
    });
    return { commands, snapshots };
  }

  async function setupSpeedstorm(
    gamepad: boolean | null = true,
    hook?: (command: NativeCommand) => Promise<CommandResult>,
  ) {
    const adapter = await setupNative(hook);
    server.updateNativeState({
      ...server.getState().native,
      games: {
        "idol-showdown": true,
        "hotwheels-unleashed": true,
        "disney-speedstorm": true,
      },
      ...(gamepad === null ? {} : { gamepad: { available: gamepad } }),
    });
    return adapter;
  }
  async function fourDrivers() {
    const drivers = [];
    for (let slot = 1; slot <= 4; slot++) {
      const approved = await approve(`Speedstorm ${slot}`);
      drivers.push({ ...approved, ...(await connect(approved.token)) });
    }
    return drivers;
  }

  async function setupBrawlhalla(
    gamepad: boolean | null = true,
    hook?: (command: NativeCommand) => Promise<CommandResult>,
  ) {
    const adapter = await setupNative(hook);
    server.updateNativeState({
      ...server.getState().native,
      games: {
        "idol-showdown": true,
        "hotwheels-unleashed": true,
        "disney-speedstorm": true,
        brawlhalla: true,
      },
      ...(gamepad === null ? {} : { gamepad: { available: gamepad } }),
    });
    return adapter;
  }

  it.each([
    "idol-showdown",
    "hotwheels-unleashed",
    "disney-speedstorm",
  ] as const)(
    "does not borrow %s availability for a missing Brawlhalla installation",
    async (installedGame) => {
      const { commands } = await setupBrawlhalla();
      server.updateNativeState({
        ...server.getState().native,
        games: { [installedGame]: true, brawlhalla: false },
      });
      const before = server.getState();
      expect(
        await server.command({ type: "startGame", gameId: "brawlhalla" }),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining("Brawlhalla is not available"),
      });
      expect(server.getState().epoch).toBe(before.epoch);
      expect(server.getState().recent).not.toContain("brawlhalla");
      expect(commands).toEqual([]);
    },
  );

  it("starts Brawlhalla from its own installation with four independent shared-arena controllers", async () => {
    const { commands, snapshots } = await setupBrawlhalla();
    server.updateNativeState({
      ...server.getState().native,
      games: { brawlhalla: true },
    });
    const drivers = await fourDrivers();
    expect(
      await server.command({ type: "startGame", gameId: "brawlhalla" }),
    ).toEqual({ ok: true });
    expect(server.getState()).toMatchObject({
      phase: "native",
      profile: "brawlhalla",
      displayMode: "shared",
      native: {
        gameId: "brawlhalla",
        controls: "menu",
        gamepad: { available: true },
      },
    });
    expect(
      await server.command({ type: "nativeControls", mode: "fight" }),
    ).toEqual({ ok: true });
    const epoch = server.getState().epoch;
    const buttons = [
      ["left", "x"],
      ["right", "a"],
      ["down", "b", "lt"],
      ["up", "y", "rt"],
    ];
    drivers.forEach((driver, index) =>
      input(driver.socket, epoch, 1, buttons[index]),
    );
    await waitUntil(
      () =>
        snapshots
          .at(-1)
          ?.players.every(
            (player, index) => player.buttons.join() === buttons[index].join(),
          ) === true,
    );
    expect(snapshots.at(-1)).toEqual({
      epoch,
      controls: "fight",
      players: buttons.map((held, index) => ({
        slot: index + 1,
        buttons: held,
      })),
    });
    input(drivers[3].socket, epoch, 0, ["confirm"]);
    input(drivers[3].socket, epoch - 1, 2, ["back"]);
    await sleep(25);
    expect(server.getState().players[3].buttons).toEqual(buttons[3]);
    expect(commands).toEqual([
      { type: "start", gameId: "brawlhalla" },
      { type: "controls", mode: "fight" },
    ]);
    for (const gameId of [
      "idol-showdown",
      "hotwheels-unleashed",
      "disney-speedstorm",
    ])
      expect((await server.command({ type: "startGame", gameId })).ok).toBe(
        false,
      );
    expect(server.getState().native.gameId).toBe("brawlhalla");
  });

  it.each([false, null])(
    "rejects Brawlhalla before side effects with missing/unknown gamepad capability: %j",
    async (gamepad) => {
      const { commands, snapshots } = await setupBrawlhalla(gamepad);
      await server.command({ type: "openHome" });
      const before = server.getState();
      expect(
        await server.command({ type: "startGame", gameId: "brawlhalla" }),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining("gamepad driver"),
      });
      expect(server.getState()).toMatchObject({
        phase: "home",
        profile: "menu",
        epoch: before.epoch,
      });
      expect(server.getState().recent).not.toContain("brawlhalla");
      expect(commands).toEqual([]);
      expect(snapshots).toEqual([]);
    },
  );

  it("does not stop a running game to launch Brawlhalla without its required driver", async () => {
    const { commands } = await setupBrawlhalla();
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    server.updateNativeState({
      ...server.getState().native,
      gamepad: { available: false },
    });
    const before = server.getState();
    expect(
      (await server.command({ type: "startGame", gameId: "brawlhalla" })).ok,
    ).toBe(false);
    expect(server.getState()).toMatchObject({
      phase: "native",
      epoch: before.epoch,
      native: { gameId: "idol-showdown" },
    });
    expect(commands).toEqual([{ type: "start", gameId: "idol-showdown" }]);
  });

  it("restricts Brawlhalla mode changes to the navigator and rejects Race and split layouts", async () => {
    const { snapshots } = await setupBrawlhalla();
    const drivers = await fourDrivers();
    await server.command({ type: "startGame", gameId: "brawlhalla" });
    const before = server.getState().epoch;
    input(drivers[3].socket, before, 1, ["x"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("x"));
    let response = receive(drivers[3].socket, "error");
    drivers[3].socket.send(
      JSON.stringify({ type: "native-controls", mode: "fight" }),
    );
    expect(await response).toMatchObject({ code: "not_navigator" });
    drivers[0].socket.send(
      JSON.stringify({ type: "native-controls", mode: "fight" }),
    );
    await waitUntil(() => server.getState().native.controls === "fight");
    expect(server.getState().epoch).toBeGreaterThan(before);
    expect(snapshots.at(-1)?.players).toEqual(
      [1, 2, 3, 4].map((slot) => ({ slot, buttons: [] })),
    );
    response = receive(drivers[0].socket, "error");
    drivers[0].socket.send(
      JSON.stringify({ type: "native-controls", mode: "race" }),
    );
    expect(await response).toMatchObject({ code: "native_controls" });
    for (const mode of ["split-2", "split-4"] as const)
      expect((await server.command({ type: "setLayout", mode })).ok).toBe(
        false,
      );
    expect(server.getState()).toMatchObject({
      displayMode: "shared",
      profile: "brawlhalla",
      native: { controls: "fight" },
    });
  });

  it("cannot inject Brawlhalla input before device approval and authentication", async () => {
    const { snapshots } = await setupBrawlhalla();
    await requestPair("Unapproved");
    await server.command({ type: "startGame", gameId: "brawlhalla" });
    const socket = openSocket();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    const rejected = closed(socket);
    input(socket, server.getState().epoch, 1, ["x"]);
    expect(await rejected).toBe(1008);
    expect(server.getState().players).toEqual([]);
    expect(snapshots.at(-1)?.players).toEqual(
      [1, 2, 3, 4].map((slot) => ({ slot, buttons: [] })),
    );
  });

  it("recovers Brawlhalla P4 across watchdog, reconnect, focus, bus loss and switching to a two-player game", async () => {
    const { snapshots } = await setupBrawlhalla();
    const drivers = await fourDrivers();
    await server.command({ type: "startGame", gameId: "brawlhalla" });
    await server.command({ type: "nativeControls", mode: "fight" });
    let epoch = server.getState().epoch;
    input(drivers[3].socket, epoch, 1, ["x", "left"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("x"));
    await waitUntil(() => !server.getState().players[3].buttons.length);
    expect(snapshots.at(-1)?.players[3].buttons).toEqual([]);
    input(drivers[3].socket, epoch, 2, ["b"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("b"));
    drivers[3].socket.close();
    await waitUntil(() => !server.getState().players[3].connected);
    const reconnect = await connect(drivers[3].token);
    expect(reconnect.state.players[3]).toMatchObject({
      slot: 4,
      connected: true,
      buttons: [],
    });
    input(reconnect.socket, epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("a"));
    server.updateNativeState({
      ...server.getState().native,
      focused: false,
      status: "paused",
    });
    expect(
      snapshots.at(-1)?.players.every((player) => !player.buttons.length),
    ).toBe(true);
    input(reconnect.socket, server.getState().epoch, 1, ["a"]);
    await sleep(25);
    expect(server.getState().players[3].buttons).toEqual([]);
    server.updateNativeState({
      ...server.getState().native,
      focused: true,
      status: "running",
    });
    epoch = server.getState().epoch;
    drivers
      .slice(0, 3)
      .forEach((driver) => input(driver.socket, epoch, 1, ["x"]));
    input(reconnect.socket, epoch, 1, ["y"]);
    await waitUntil(
      () =>
        snapshots
          .at(-1)
          ?.players.every((player) => player.buttons.length > 0) === true,
    );
    server.updateNativeState({
      ...server.getState().native,
      gamepad: { available: false },
    });
    expect(
      snapshots.at(-1)?.players.every((player) => !player.buttons.length),
    ).toBe(true);
    server.updateNativeState({
      ...server.getState().native,
      gamepad: { available: true },
    });
    expect(
      server.getState().players.every((player) => !player.buttons.length),
    ).toBe(true);
    input(reconnect.socket, server.getState().epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("a"));
    const beforeSwitch = server.getState().epoch;
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.epoch > beforeSwitch &&
          snapshot.players.length === 4 &&
          snapshot.players.every((player) => !player.buttons.length),
      ),
    ).toBe(true);
    expect(snapshots.at(-1)?.players).toHaveLength(2);
    input(reconnect.socket, beforeSwitch, 2, ["x"]);
    await sleep(25);
    expect(server.getState().players[3].buttons).toEqual([]);
  });

  it("routes Brawlhalla P4 game rumble only in active Fight, bounded to its slot and epoch", async () => {
    await setupBrawlhalla();
    const drivers = await fourDrivers();
    const events: ServerMessage[][] = [[], [], [], []];
    drivers.forEach((driver, index) =>
      driver.socket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        if (message.type === "haptics") events[index].push(message);
      }),
    );
    await server.command({ type: "startGame", gameId: "brawlhalla" });
    const rumble = (patch: Record<string, unknown> = {}) =>
      server.relayNativeRumble({
        slot: 4,
        epoch: server.getState().epoch,
        largeMotor: 255,
        smallMotor: 255,
        ...patch,
      });
    rumble();
    await sleep(20);
    expect(events).toEqual([[], [], [], []]);
    await server.command({ type: "nativeControls", mode: "fight" });
    const epoch = server.getState().epoch;
    rumble();
    await waitUntil(() => events[3].length === 1);
    expect(events).toEqual([
      [],
      [],
      [],
      [{ type: "haptics", epoch, durationMs: 140 }],
    ]);
    for (const patch of [
      { epoch: epoch - 1 },
      { slot: 5 },
      { slot: "4" },
      { largeMotor: 256 },
      { smallMotor: -1 },
    ])
      rumble(patch);
    for (let i = 0; i < 10; i++) rumble();
    await sleep(20);
    expect(events[3]).toHaveLength(1);
    rumble({ largeMotor: 0, smallMotor: 0 });
    await waitUntil(() => events[3].length === 2);
    expect(events[3][1]).toEqual({ type: "haptics", epoch, durationMs: 0 });
    for (const patch of [
      { focused: false },
      { status: "paused" as const },
      { quitting: true },
      { gamepad: { available: false } },
    ]) {
      server.updateNativeState({
        ...server.getState().native,
        focused: true,
        status: "running",
        quitting: false,
        gamepad: { available: true },
        ...patch,
      });
      rumble();
      await sleep(15);
      expect(events[3]).toHaveLength(2);
    }
    server.updateNativeState({
      ...server.getState().native,
      focused: true,
      status: "running",
      quitting: false,
      gamepad: { available: true },
    });
    drivers[3].socket.close();
    await waitUntil(() => !server.getState().players[3].connected);
    rumble();
    await sleep(20);
    expect(events[3]).toHaveLength(2);
  });

  it("keeps Brawlhalla's four controllers neutral while normal Stop is pending and recovers Menus on failure", async () => {
    let finishStop: ((result: CommandResult) => void) | undefined;
    let waitForStop = true;
    const { snapshots } = await setupBrawlhalla(true, async (command) => {
      if (command.type === "stop" && waitForStop)
        return new Promise((resolve) => {
          finishStop = resolve;
        });
      if (command.type === "start")
        server.updateNativeState({
          ...server.getState().native,
          status: "running",
          focused: true,
        });
      return { ok: true };
    });
    const drivers = await fourDrivers();
    await server.command({ type: "startGame", gameId: "brawlhalla" });
    await server.command({ type: "nativeControls", mode: "fight" });
    drivers.forEach((driver) =>
      input(driver.socket, server.getState().epoch, 1, ["a"]),
    );
    await waitUntil(
      () =>
        snapshots
          .at(-1)
          ?.players.every((player) => player.buttons.includes("a")) === true,
    );
    const stopping = server.command({ type: "stopGame" });
    try {
      await waitUntil(() => !!finishStop);
      expect(server.getState()).toMatchObject({
        phase: "native",
        profile: "brawlhalla",
        native: { quitting: true, controls: "menu" },
      });
      drivers.forEach((driver) =>
        input(driver.socket, server.getState().epoch, 1, ["x"]),
      );
      await sleep(25);
      expect(
        snapshots.at(-1)?.players.every((player) => !player.buttons.length),
      ).toBe(true);
      server.updateNativeState({
        ...server.getState().native,
        status: "running",
        focused: true,
        quitting: false,
      });
      finishStop!({ ok: false, error: "Finish the exit dialog." });
      expect((await stopping).ok).toBe(false);
      expect(server.getState()).toMatchObject({
        phase: "native",
        profile: "brawlhalla",
        native: { controls: "menu", quitting: false },
      });
      input(drivers[3].socket, server.getState().epoch, 1, ["confirm"]);
      await waitUntil(() =>
        server.getState().players[3].buttons.includes("confirm"),
      );
    } finally {
      waitForStop = false;
      finishStop?.({ ok: true });
      await stopping;
    }
  });

  it.each(["idol-showdown", "hotwheels-unleashed"] as const)(
    "does not borrow %s availability for a missing Disney installation",
    async (installedGame) => {
      const { commands, snapshots } = await setupNative();
      server.updateNativeState({
        ...server.getState().native,
        games: { [installedGame]: true, "disney-speedstorm": false },
        gamepad: { available: true },
      });
      await server.command({ type: "openHome" });
      const before = server.getState();
      expect(
        await server.command({
          type: "startGame",
          gameId: "disney-speedstorm",
        }),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining("Disney Speedstorm is not available"),
      });
      expect(server.getState()).toMatchObject({
        phase: "home",
        profile: "menu",
        epoch: before.epoch,
      });
      expect(server.getState().recent).not.toContain("disney-speedstorm");
      expect(commands).toEqual([]);
      expect(snapshots).toEqual([]);
    },
  );

  it("starts Disney from its own availability without enabling missing games", async () => {
    const { commands } = await setupSpeedstorm();
    server.updateNativeState({
      ...server.getState().native,
      games: {
        "idol-showdown": false,
        "hotwheels-unleashed": false,
        "disney-speedstorm": true,
      },
    });
    expect(
      await server.command({ type: "startGame", gameId: "disney-speedstorm" }),
    ).toEqual({ ok: true });
    expect(server.getState()).toMatchObject({
      phase: "native",
      profile: "speedstorm",
      displayMode: "split-4",
      native: { gameId: "disney-speedstorm", status: "running", focused: true },
    });
    for (const gameId of ["idol-showdown", "hotwheels-unleashed"])
      expect((await server.command({ type: "startGame", gameId })).ok).toBe(
        false,
      );
    expect(commands).toEqual([{ type: "start", gameId: "disney-speedstorm" }]);
    expect(server.getState().native.gameId).toBe("disney-speedstorm");
  });

  it.each([false, null])(
    "rejects Disney before launching with a missing or unknown driver: %j",
    async (gamepad) => {
      const { commands, snapshots } = await setupSpeedstorm(gamepad);
      await server.command({ type: "openHome" });
      const before = server.getState();
      expect(
        await server.command({
          type: "startGame",
          gameId: "disney-speedstorm",
        }),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining("gamepad driver"),
      });
      expect(server.getState()).toMatchObject({
        phase: "home",
        profile: "menu",
        epoch: before.epoch,
      });
      expect(server.getState().recent).not.toContain("disney-speedstorm");
      expect(commands).toEqual([]);
      expect(snapshots).toEqual([]);
    },
  );

  it("does not stop the current game for a Disney launch without its required driver", async () => {
    const { commands } = await setupSpeedstorm();
    await server.command({ type: "startGame", gameId: "hotwheels-unleashed" });
    server.updateNativeState({
      ...server.getState().native,
      gamepad: {
        available: false,
        message: "Install the optional PC gamepad driver.",
      },
    });
    const before = server.getState();
    expect(
      await server.command({ type: "startGame", gameId: "disney-speedstorm" }),
    ).toEqual({ ok: false, error: "Install the optional PC gamepad driver." });
    expect(server.getState()).toMatchObject({
      phase: "native",
      epoch: before.epoch,
      native: { gameId: "hotwheels-unleashed" },
    });
    expect(commands).toEqual([
      { type: "start", gameId: "hotwheels-unleashed" },
    ]);
  });

  it("relays four independent Disney snapshots and ignores old sequence and epoch frames", async () => {
    const { commands, snapshots } = await setupSpeedstorm();
    const drivers = await fourDrivers();
    await server.command({ type: "startGame", gameId: "disney-speedstorm" });
    await server.command({ type: "nativeControls", mode: "race" });
    const epoch = server.getState().epoch;
    const buttons = [
      ["a", "right", "x"],
      ["b", "left", "l"],
      ["y", "r", "rt"],
      ["up", "lt", "start"],
    ];
    drivers.forEach((driver, index) =>
      input(driver.socket, epoch, 2, buttons[index]),
    );
    await waitUntil(
      () =>
        snapshots
          .at(-1)
          ?.players.every(
            (player, index) => player.buttons.join() === buttons[index].join(),
          ) === true,
    );
    expect(snapshots.at(-1)).toEqual({
      epoch,
      controls: "race",
      players: buttons.map((held, index) => ({
        slot: index + 1,
        buttons: held,
      })),
    });
    expect(server.getState().players.map((player) => player.buttons)).toEqual(
      buttons,
    );
    input(drivers[3].socket, epoch, 1, ["confirm"]);
    input(drivers[3].socket, epoch - 1, 3, ["back"]);
    await sleep(30);
    expect(server.getState().players[3].buttons).toEqual(buttons[3]);
    expect(commands).toContainEqual({ type: "controls", mode: "race" });
    expect(
      (await server.command({ type: "nativeControls", mode: "fight" })).ok,
    ).toBe(false);
  });

  it.each([
    { mode: "shared", eligible: 1 },
    { mode: "split-2", eligible: 2 },
  ] as const)(
    "keeps unused Disney drivers neutral in $mode and releases the old four-player frame",
    async ({ mode, eligible }) => {
      const { snapshots } = await setupSpeedstorm();
      const drivers = await fourDrivers();
      await server.command({ type: "startGame", gameId: "disney-speedstorm" });
      const oldEpoch = server.getState().epoch;
      drivers.forEach((driver) => input(driver.socket, oldEpoch, 1, ["a"]));
      await waitUntil(
        () =>
          snapshots
            .at(-1)
            ?.players.every((player) => player.buttons.includes("a")) === true,
      );
      expect(await server.command({ type: "setLayout", mode })).toEqual({
        ok: true,
      });
      expect(server.getState().epoch).toBeGreaterThan(oldEpoch);
      expect(snapshots.at(-1)?.players).toEqual(
        [1, 2, 3, 4].map((slot) => ({ slot, buttons: [] })),
      );
      drivers.forEach((driver) => input(driver.socket, oldEpoch, 2, ["b"]));
      await sleep(25);
      expect(
        server.getState().players.every((player) => !player.buttons.length),
      ).toBe(true);
      drivers.forEach((driver) =>
        input(driver.socket, server.getState().epoch, 1, ["a", "right"], {
          x: 0.5,
          y: 0,
        }),
      );
      await waitUntil(
        () =>
          snapshots.at(-1)?.players[eligible - 1].buttons.includes("right") ===
          true,
      );
      expect(snapshots.at(-1)?.players).toEqual(
        [1, 2, 3, 4].map((slot) => ({
          slot,
          buttons: slot <= eligible ? ["a", "right"] : [],
        })),
      );
      expect(
        server
          .getState()
          .players.slice(eligible)
          .every(
            (player) =>
              !player.buttons.length && !player.axes.x && !player.axes.y,
          ),
      ).toBe(true);
    },
  );

  it("restricts Disney layout changes to the navigator and preserves HOT WHEELS' two-player limit", async () => {
    await setupSpeedstorm();
    const drivers = await fourDrivers();
    await server.command({ type: "startGame", gameId: "disney-speedstorm" });
    const denied = receive(drivers[3].socket, "error");
    drivers[3].socket.send(
      JSON.stringify({ type: "native-layout", mode: "shared" }),
    );
    expect(await denied).toMatchObject({
      type: "error",
      code: "not_navigator",
    });
    expect(server.getState().displayMode).toBe("split-4");
    drivers[0].socket.send(
      JSON.stringify({ type: "native-layout", mode: "split-2" }),
    );
    await waitUntil(() => server.getState().displayMode === "split-2");
    drivers[0].socket.send(
      JSON.stringify({ type: "native-layout", mode: "split-4" }),
    );
    await waitUntil(() => server.getState().displayMode === "split-4");
    await server.command({ type: "startGame", gameId: "hotwheels-unleashed" });
    const unsupported = receive(drivers[0].socket, "error");
    drivers[0].socket.send(
      JSON.stringify({ type: "native-layout", mode: "split-4" }),
    );
    expect(await unsupported).toMatchObject({
      type: "error",
      code: "native_layout",
    });
    expect(server.getState().displayMode).toBe("shared");
  });

  it("routes Disney P4 rumble to P4 only, rejecting stale, spectator and inactive feedback", async () => {
    await setupSpeedstorm();
    const drivers = await fourDrivers();
    const events: ServerMessage[][] = [[], [], [], []];
    drivers.forEach((driver, index) =>
      driver.socket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        if (message.type === "haptics") events[index].push(message);
      }),
    );
    await server.command({ type: "startGame", gameId: "disney-speedstorm" });
    const rumble = (patch: Record<string, unknown> = {}) =>
      server.relayNativeRumble({
        slot: 4,
        epoch: server.getState().epoch,
        largeMotor: 0,
        smallMotor: 0,
        ...patch,
      });
    rumble();
    await sleep(25);
    expect(events).toEqual([[], [], [], []]);
    await server.command({ type: "nativeControls", mode: "race" });
    const epoch = server.getState().epoch;
    rumble({ largeMotor: 255, smallMotor: 255 });
    await waitUntil(() => events[3].length === 1);
    expect(events).toEqual([
      [],
      [],
      [],
      [{ type: "haptics", epoch, durationMs: 140 }],
    ]);
    for (let index = 0; index < 20; index++) rumble({ largeMotor: 255 });
    for (const patch of [
      { epoch: epoch - 1 },
      { slot: 5 },
      { slot: "4" },
      { largeMotor: 256 },
      { smallMotor: -1 },
    ])
      rumble(patch);
    await sleep(25);
    expect(events[3]).toHaveLength(1);
    rumble();
    await waitUntil(() => events[3].length === 2);
    expect(events[3][1]).toEqual({ type: "haptics", epoch, durationMs: 0 });
    await server.command({ type: "setLayout", mode: "split-2" });
    rumble();
    await sleep(25);
    expect(events[3]).toHaveLength(2);
    await server.command({ type: "setLayout", mode: "split-4" });
    for (const patch of [
      { focused: false, status: "paused" as const },
      { focused: true, status: "paused" as const },
      { focused: true, status: "running" as const, quitting: true },
      {
        focused: true,
        status: "running" as const,
        quitting: false,
        gamepad: { available: false },
      },
    ]) {
      server.updateNativeState({ ...server.getState().native, ...patch });
      rumble();
      await sleep(25);
      expect(events[3]).toHaveLength(2);
    }
    server.updateNativeState({
      ...server.getState().native,
      focused: true,
      status: "running",
      quitting: false,
      gamepad: { available: true },
    });
    drivers[3].socket.close();
    await waitUntil(() => !server.getState().players[3].connected);
    rumble();
    await sleep(25);
    expect(events).toEqual([
      [],
      [],
      [],
      [
        { type: "haptics", epoch, durationMs: 140 },
        { type: "haptics", epoch, durationMs: 0 },
      ],
    ]);
  });

  it("neutralizes all Disney drivers when the bus disappears, including P1", async () => {
    const { snapshots } = await setupSpeedstorm();
    const drivers = await fourDrivers();
    await server.command({ type: "startGame", gameId: "disney-speedstorm" });
    drivers.forEach((driver) =>
      input(driver.socket, server.getState().epoch, 1, ["a"]),
    );
    await waitUntil(
      () =>
        snapshots
          .at(-1)
          ?.players.every((player) => player.buttons.includes("a")) === true,
    );
    const epoch = server.getState().epoch;
    server.updateNativeState({
      ...server.getState().native,
      gamepad: { available: false },
    });
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(
      snapshots.at(-1)?.players.every((player) => !player.buttons.length),
    ).toBe(true);
    drivers.forEach((driver) =>
      input(driver.socket, server.getState().epoch, 1, ["a"]),
    );
    await sleep(30);
    expect(
      server.getState().players.every((player) => !player.buttons.length),
    ).toBe(true);
    expect(
      (await server.command({ type: "setLayout", mode: "shared" })).ok,
    ).toBe(false);
    server.updateNativeState({
      ...server.getState().native,
      gamepad: { available: true },
    });
    expect(
      snapshots.at(-1)?.players.every((player) => !player.buttons.length),
    ).toBe(true);
  });

  it("recovers Disney P4 from watchdog, reconnect, focus and profile changes without held input", async () => {
    const { snapshots } = await setupSpeedstorm();
    const drivers = await fourDrivers();
    await server.command({ type: "startGame", gameId: "disney-speedstorm" });
    let epoch = server.getState().epoch;
    input(drivers[3].socket, epoch, 1, ["a", "left"]);
    await waitUntil(
      () => snapshots.at(-1)?.players[3].buttons.includes("left") === true,
    );
    await waitUntil(() => server.getState().players[3].buttons.length === 0);
    expect(snapshots.at(-1)?.players[3].buttons).toEqual([]);
    input(drivers[3].socket, epoch, 2, ["a"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("a"));
    drivers[3].socket.close();
    await waitUntil(() => !server.getState().players[3].connected);
    expect(snapshots.at(-1)?.players[3].buttons).toEqual([]);
    const reconnect = await connect(drivers[3].token);
    expect(reconnect.state.players[3]).toMatchObject({
      slot: 4,
      buttons: [],
      connected: true,
    });
    input(reconnect.socket, epoch, 1, ["b"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("b"));
    server.updateNativeState({
      ...server.getState().native,
      focused: false,
      status: "paused",
    });
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(
      snapshots.at(-1)?.players.every((player) => !player.buttons.length),
    ).toBe(true);
    input(reconnect.socket, server.getState().epoch, 1, ["a"]);
    await sleep(25);
    expect(server.getState().players[3].buttons).toEqual([]);
    server.updateNativeState({
      ...server.getState().native,
      focused: true,
      status: "running",
    });
    epoch = server.getState().epoch;
    input(reconnect.socket, epoch, 1, ["x"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("x"));
    await server.command({ type: "nativeControls", mode: "race" });
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(
      snapshots.at(-1)?.players.every((player) => !player.buttons.length),
    ).toBe(true);
    epoch = server.getState().epoch;
    input(reconnect.socket, epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[3].buttons.includes("a"));
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.epoch > epoch &&
          snapshot.players.length === 4 &&
          snapshot.players.every((player) => !player.buttons.length),
      ),
    ).toBe(true);
    expect(snapshots.at(-1)?.players).toHaveLength(2);
    input(reconnect.socket, epoch, 2, ["x"]);
    await sleep(25);
    expect(server.getState()).toMatchObject({
      phase: "native",
      profile: "idol",
      native: { gameId: "idol-showdown" },
    });
    expect(server.getState().players[3].buttons).toEqual([]);
  });

  it("blocks every Disney driver and rumble while normal Stop is pending", async () => {
    let finishStop: ((result: CommandResult) => void) | undefined;
    let awaitStop = true;
    const { snapshots } = await setupSpeedstorm(true, async (command) => {
      if (command.type === "stop" && awaitStop)
        return new Promise((resolve) => {
          finishStop = resolve;
        });
      if (command.type === "start")
        server.updateNativeState({
          ...server.getState().native,
          status: "running",
          focused: true,
        });
      return { ok: true };
    });
    const drivers = await fourDrivers();
    const events: ServerMessage[] = [];
    drivers[3].socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "haptics") events.push(message);
    });
    await server.command({ type: "startGame", gameId: "disney-speedstorm" });
    await server.command({ type: "nativeControls", mode: "race" });
    drivers.forEach((driver) =>
      input(driver.socket, server.getState().epoch, 1, ["a"]),
    );
    await waitUntil(
      () =>
        snapshots
          .at(-1)
          ?.players.every((player) => player.buttons.includes("a")) === true,
    );
    const stopping = server.command({ type: "stopGame" });
    try {
      await waitUntil(() => !!finishStop);
      expect(server.getState()).toMatchObject({
        phase: "native",
        profile: "speedstorm",
        native: { quitting: true, controls: "menu" },
      });
      drivers.forEach((driver) =>
        input(driver.socket, server.getState().epoch, 1, ["a"]),
      );
      server.relayNativeRumble({
        slot: 4,
        epoch: server.getState().epoch,
        largeMotor: 255,
        smallMotor: 255,
      });
      await sleep(30);
      expect(
        snapshots.at(-1)?.players.every((player) => !player.buttons.length),
      ).toBe(true);
      expect(
        server.getState().players.every((player) => !player.buttons.length),
      ).toBe(true);
      expect(events).toEqual([]);
      server.updateNativeState({
        ...server.getState().native,
        status: "running",
        focused: true,
        quitting: false,
      });
      finishStop!({ ok: false, error: "Finish the game exit dialog." });
      expect(await stopping).toMatchObject({ ok: false });
      expect(server.getState()).toMatchObject({
        phase: "native",
        profile: "speedstorm",
        native: { quitting: false, controls: "menu" },
      });
      input(drivers[3].socket, server.getState().epoch, 1, ["confirm"]);
      await waitUntil(() =>
        server.getState().players[3].buttons.includes("confirm"),
      );
    } finally {
      awaitStop = false;
      finishStop?.({ ok: true });
      await stopping;
    }
  });

  it.each(["stopGame", "openHome", "showLobby", "resetSession"] as const)(
    "keeps controllers attached when %s cannot finish native exit",
    async (action) => {
      await setupNative(async (command) => {
        server.updateNativeState({
          ...server.getState().native,
          status: "running",
          focused: true,
          controls: "menu",
          quitting: false,
        });
        return command.type === "stop"
          ? { ok: false, error: "Finish the game exit dialog." }
          : { ok: true };
      });
      server.updateNativeState({
        ...server.getState().native,
        games: { "idol-showdown": true, "hotwheels-unleashed": true },
        gamepad: { available: true },
      });
      const { socket } = await connect((await approve()).token);
      await server.command({
        type: "startGame",
        gameId: "hotwheels-unleashed",
      });
      const oldEpoch = server.getState().epoch;
      input(socket, oldEpoch, 1, ["confirm"]);
      await waitUntil(() => server.getState().players[0].buttons.length === 1);
      expect(await server.command({ type: action })).toMatchObject({
        ok: false,
      });
      const state = server.getState();
      expect(state).toMatchObject({
        phase: "native",
        profile: "racing",
        native: { controls: "menu", status: "running", quitting: false },
      });
      expect(state.epoch).toBeGreaterThan(oldEpoch);
      expect(state.players[0]).toMatchObject({ connected: true, buttons: [] });
      input(socket, state.epoch, 1, ["confirm"]);
      await waitUntil(() =>
        server.getState().players[0].buttons.includes("confirm"),
      );
    },
  );

  it("refuses unavailable native games without claiming a playable session", async () => {
    expect(server.getState().native).toMatchObject({
      available: false,
      status: "unavailable",
    });
    const result = await server.command({
      type: "startGame",
      gameId: "idol-showdown",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not available");
    expect(server.getState().phase).not.toBe("native");
  });

  it("does not borrow Idol availability when HOT WHEELS is missing", async () => {
    const { commands, snapshots } = await setupNative();
    await server.command({ type: "openHome" });
    await server.command({ type: "selectGame", gameId: "hotwheels-unleashed" });
    const before = server.getState();
    const result = await server.command({
      type: "startGame",
      gameId: "hotwheels-unleashed",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("HOT WHEELS UNLEASHED is not available");
    expect(server.getState()).toMatchObject({
      phase: "home",
      profile: "menu",
      epoch: before.epoch,
      native: { available: true, status: "idle" },
    });
    expect(server.getState().recent).not.toContain("hotwheels-unleashed");
    expect(commands).toEqual([]);
    expect(snapshots).toEqual([]);
  });

  it("starts an available original game and relays only complete validated P1/P2 snapshots", async () => {
    const { commands, snapshots } = await setupNative();
    const connections = [];
    for (let i = 0; i < 4; i++)
      connections.push(await connect((await approve(`Native ${i}`)).token));
    expect(
      await server.command({ type: "startGame", gameId: "idol-showdown" }),
    ).toEqual({ ok: true });
    expect(server.getState()).toMatchObject({
      phase: "native",
      profile: "idol",
      displayMode: "shared",
      native: { status: "running", focused: true },
    });
    expect(commands[0]).toEqual({ type: "start", gameId: "idol-showdown" });
    const epoch = server.getState().epoch;
    input(connections[0].socket, epoch, 1, ["a", "l", "lt"]);
    input(connections[1].socket, epoch, 1, ["right", "x", "select"]);
    input(connections[2].socket, epoch, 1, ["a", "r", "rt"]);
    input(connections[3].socket, epoch, 1, ["b"]);
    await waitUntil(() =>
      snapshots.some(
        (snapshot) =>
          snapshot.players[0].buttons.includes("lt") &&
          snapshot.players[1].buttons.includes("select"),
      ),
    );
    const snapshot = snapshots.at(-1)!;
    expect(snapshot.players.map((player) => player.slot)).toEqual([1, 2]);
    expect(
      server
        .getState()
        .players.slice(2)
        .every(
          (player) => player.buttons.length === 0 && player.pressCount === 0,
        ),
    ).toBe(true);
    expect(
      (await server.command({ type: "setLayout", mode: "split-4" })).ok,
    ).toBe(false);
    const received = snapshots.length;
    await sleep(130);
    expect(snapshots.length).toBeGreaterThan(received);
  });

  it("routes HOT WHEELS to separate P1/P2 controllers while rejecting fighting mode", async () => {
    const { commands, snapshots } = await setupNative();
    server.updateNativeState({
      ...server.getState().native,
      games: { "idol-showdown": true, "hotwheels-unleashed": true },
      gamepad: { available: true },
    });
    const first = await connect((await approve("Driver 1")).token);
    const second = await connect((await approve("Driver 2")).token);
    expect(
      await server.command({
        type: "startGame",
        gameId: "hotwheels-unleashed",
      }),
    ).toEqual({ ok: true });
    expect(commands[0]).toEqual({
      type: "start",
      gameId: "hotwheels-unleashed",
    });
    expect(server.getState()).toMatchObject({
      phase: "native",
      profile: "racing",
      native: { gameId: "hotwheels-unleashed" },
    });
    expect(
      (await server.command({ type: "nativeControls", mode: "fight" })).ok,
    ).toBe(false);
    expect(
      await server.command({ type: "nativeControls", mode: "race" }),
    ).toEqual({ ok: true });
    expect(
      await server.command({ type: "setLayout", mode: "split-2" }),
    ).toEqual({ ok: true });
    expect(
      (await server.command({ type: "setLayout", mode: "split-4" })).ok,
    ).toBe(false);
    const epoch = server.getState().epoch;
    input(first.socket, epoch, 1, ["a", "right", "x"]);
    input(second.socket, epoch, 1, ["a", "left"]);
    await waitUntil(() =>
      snapshots.some(
        (frame) =>
          frame.controls === "race" &&
          frame.players[0]?.buttons.includes("a") &&
          frame.players[1]?.buttons.includes("left"),
      ),
    );
    expect(snapshots.at(-1)?.players).toEqual([
      { slot: 1, buttons: ["a", "right", "x"] },
      { slot: 2, buttons: ["a", "left"] },
    ]);
    expect(server.getState().players[1].buttons).toEqual(["a", "left"]);
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    expect(commands.slice(-2)).toEqual([
      { type: "stop" },
      { type: "start", gameId: "idol-showdown" },
    ]);
    expect(server.getState()).toMatchObject({
      profile: "idol",
      native: { gameId: "idol-showdown", controls: "menu" },
    });
  });

  it("keeps HOT WHEELS P2 neutral in Solo and rejects split mode without a gamepad driver", async () => {
    const { snapshots } = await setupNative();
    server.updateNativeState({
      ...server.getState().native,
      games: { "idol-showdown": true, "hotwheels-unleashed": true },
      gamepad: {
        available: false,
        message: "Install the optional PC gamepad driver.",
      },
    });
    const first = await connect((await approve("Driver 1")).token);
    const second = await connect((await approve("Driver 2")).token);
    await server.command({ type: "startGame", gameId: "hotwheels-unleashed" });
    expect(server.getState().displayMode).toBe("shared");
    expect(
      await server.command({ type: "setLayout", mode: "split-2" }),
    ).toEqual({ ok: false, error: "Install the optional PC gamepad driver." });
    input(first.socket, server.getState().epoch, 1, ["a"]);
    input(second.socket, server.getState().epoch, 1, ["b", "left"]);
    await waitUntil(
      () => snapshots.at(-1)?.players[0].buttons.includes("a") === true,
    );
    expect(snapshots.at(-1)?.players[1]).toEqual({ slot: 2, buttons: [] });
    expect(server.getState().players[1].buttons).toEqual([]);
    server.updateNativeState({
      ...server.getState().native,
      gamepad: { available: true },
    });
    input(second.socket, server.getState().epoch, 2, ["a"]);
    await sleep(40);
    expect(server.getState().displayMode).toBe("shared");
    expect(server.getState().players[1].buttons).toEqual([]);
  });

  it("only the HOT WHEELS navigator can enable P2 and layout changes release old frames", async () => {
    const { snapshots } = await setupNative();
    server.updateNativeState({
      ...server.getState().native,
      games: { "idol-showdown": true, "hotwheels-unleashed": true },
      gamepad: { available: true },
    });
    const first = await connect((await approve("Navigator")).token);
    const second = await connect((await approve("Driver 2")).token);
    const third = await connect((await approve("Audience")).token);
    await server.command({ type: "startGame", gameId: "hotwheels-unleashed" });
    const denied = receive(second.socket, "error");
    second.socket.send(
      JSON.stringify({ type: "native-layout", mode: "split-2" }),
    );
    expect(await denied).toMatchObject({
      type: "error",
      code: "not_navigator",
    });
    expect(server.getState().displayMode).toBe("shared");
    const soloEpoch = server.getState().epoch;
    input(first.socket, soloEpoch, 1, ["confirm"]);
    await waitUntil(() =>
      server.getState().players[0].buttons.includes("confirm"),
    );
    first.socket.send(
      JSON.stringify({ type: "native-layout", mode: "split-2" }),
    );
    await waitUntil(() => server.getState().displayMode === "split-2");
    expect(server.getState().epoch).toBeGreaterThan(soloEpoch);
    expect(
      snapshots.at(-1)?.players.every((player) => player.buttons.length === 0),
    ).toBe(true);
    input(second.socket, soloEpoch, 2, ["a"]);
    await sleep(30);
    expect(server.getState().players[1].buttons).toEqual([]);
    input(second.socket, server.getState().epoch, 3, ["confirm"]);
    input(third.socket, server.getState().epoch, 1, ["a"]);
    await waitUntil(
      () => snapshots.at(-1)?.players[1].buttons.includes("confirm") === true,
    );
    expect(server.getState().players[2].buttons).toEqual([]);
    expect(snapshots.at(-1)?.players).toHaveLength(2);
    await server.command({ type: "setLayout", mode: "shared" });
    expect(snapshots.at(-1)?.players[1].buttons).toEqual([]);
    input(second.socket, server.getState().epoch, 4, ["a"]);
    await sleep(30);
    expect(server.getState().players[1].buttons).toEqual([]);
  });

  it("neutralizes both split-screen players and advances epoch when the gamepad becomes unavailable", async () => {
    const { snapshots } = await setupNative();
    server.updateNativeState({
      ...server.getState().native,
      games: { "idol-showdown": true, "hotwheels-unleashed": true },
      gamepad: { available: true },
    });
    const first = await connect((await approve("Driver 1")).token);
    const second = await connect((await approve("Driver 2")).token);
    await server.command({ type: "startGame", gameId: "hotwheels-unleashed" });
    await server.command({ type: "setLayout", mode: "split-2" });
    const epoch = server.getState().epoch;
    input(first.socket, epoch, 1, ["a"]);
    input(second.socket, epoch, 1, ["b"]);
    await waitUntil(
      () => snapshots.at(-1)?.players[1].buttons.includes("b") === true,
    );
    server.updateNativeState({
      ...server.getState().native,
      gamepad: { available: false, message: "Bus unavailable" },
    });
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(
      snapshots.at(-1)?.players.every((player) => player.buttons.length === 0),
    ).toBe(true);
    input(second.socket, server.getState().epoch, 2, ["a"]);
    await sleep(30);
    expect(server.getState().players[1].buttons).toEqual([]);
    input(first.socket, server.getState().epoch, 2, ["a"]);
    await waitUntil(
      () => snapshots.at(-1)?.players[0].buttons.includes("a") === true,
    );
    expect(server.getState().native.status).toBe("running");
  });

  it("routes bounded real-game rumble only to its matching approved split-screen phone", async () => {
    await setupNative();
    server.updateNativeState({
      ...server.getState().native,
      games: { "idol-showdown": true, "hotwheels-unleashed": true },
      gamepad: { available: true },
    });
    const first = await connect((await approve("Driver 1")).token);
    const second = await connect((await approve("Driver 2")).token);
    const third = await connect((await approve("Audience")).token);
    const events: ServerMessage[][] = [[], [], []];
    [first, second, third].forEach((item, index) =>
      item.socket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as ServerMessage;
        if (message.type === "haptics") events[index].push(message);
      }),
    );
    await server.command({ type: "startGame", gameId: "hotwheels-unleashed" });
    await server.command({ type: "setLayout", mode: "split-2" });
    await server.command({ type: "nativeControls", mode: "race" });
    const epoch = server.getState().epoch;
    server.relayNativeRumble({
      slot: 2,
      epoch,
      largeMotor: 255,
      smallMotor: 255,
    });
    await waitUntil(() => events[1].length === 1);
    expect(events[1][0]).toEqual({ type: "haptics", epoch, durationMs: 140 });
    expect(events[0]).toEqual([]);
    expect(events[2]).toEqual([]);
    for (let index = 0; index < 30; index++)
      server.relayNativeRumble({
        slot: 2,
        epoch,
        largeMotor: 200,
        smallMotor: 50,
      });
    await sleep(25);
    expect(events[1]).toHaveLength(1);
    server.relayNativeRumble({ slot: 2, epoch, largeMotor: 0, smallMotor: 0 });
    await waitUntil(() => events[1].length === 2);
    expect(events[1][1]).toEqual({ type: "haptics", epoch, durationMs: 0 });
    for (const bad of [
      { slot: 3, epoch, largeMotor: 200, smallMotor: 0 },
      { slot: "2", epoch, largeMotor: 200, smallMotor: 0 },
      { slot: 2, epoch: epoch - 1, largeMotor: 200, smallMotor: 0 },
      { slot: 2, epoch, largeMotor: -1, smallMotor: 0 },
      { slot: 2, epoch, largeMotor: 256, smallMotor: 0 },
    ])
      server.relayNativeRumble(bad);
    await sleep(25);
    expect(events[1]).toHaveLength(2);
    expect(events[2]).toEqual([]);
  });

  it("suppresses rumble in Solo for P2, in menus, without focus, and after disconnect", async () => {
    await setupNative();
    server.updateNativeState({
      ...server.getState().native,
      games: { "idol-showdown": true, "hotwheels-unleashed": true },
      gamepad: { available: true },
    });
    const first = await connect((await approve("Driver 1")).token);
    const second = await connect((await approve("Driver 2")).token);
    const firstEvents: ServerMessage[] = [],
      secondEvents: ServerMessage[] = [];
    first.socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "haptics") firstEvents.push(message);
    });
    second.socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "haptics") secondEvents.push(message);
    });
    await server.command({ type: "startGame", gameId: "hotwheels-unleashed" });
    server.relayNativeRumble({
      slot: 1,
      epoch: server.getState().epoch,
      largeMotor: 100,
      smallMotor: 0,
    });
    await sleep(25);
    expect(firstEvents).toEqual([]);
    await server.command({ type: "nativeControls", mode: "race" });
    server.relayNativeRumble({
      slot: 2,
      epoch: server.getState().epoch,
      largeMotor: 100,
      smallMotor: 0,
    });
    server.relayNativeRumble({
      slot: 1,
      epoch: server.getState().epoch,
      largeMotor: 100,
      smallMotor: 0,
    });
    await waitUntil(() => firstEvents.length === 1);
    expect(secondEvents).toEqual([]);
    server.updateNativeState({
      ...server.getState().native,
      focused: false,
      status: "paused",
    });
    server.relayNativeRumble({
      slot: 1,
      epoch: server.getState().epoch,
      largeMotor: 200,
      smallMotor: 0,
    });
    await sleep(25);
    expect(firstEvents).toHaveLength(1);
    second.socket.close();
    await sleep(30);
    server.relayNativeRumble({
      slot: 2,
      epoch: server.getState().epoch,
      largeMotor: 100,
      smallMotor: 0,
    });
    expect(secondEvents).toEqual([]);
  });

  it("neutralizes native input on watchdog, disconnection and focus loss", async () => {
    const { snapshots } = await setupNative();
    const device = await approve();
    const { socket } = await connect(device.token);
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    let epoch = server.getState().epoch;
    input(socket, epoch, 1, ["a"]);
    await waitUntil(
      () => snapshots.at(-1)?.players[0].buttons.includes("a") === true,
    );
    await waitUntil(() => server.getState().players[0].buttons.length === 0);
    expect(snapshots.at(-1)!.players[0].buttons).toEqual([]);
    input(socket, epoch, 2, ["x"]);
    await waitUntil(() => server.getState().players[0].buttons.includes("x"));
    server.updateNativeState({
      available: true,
      status: "paused",
      controls: "menu",
      focused: false,
    });
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(snapshots.at(-1)!.players[0].buttons).toEqual([]);
    input(socket, epoch, 3, ["a"]);
    await sleep(30);
    expect(server.getState().players[0].buttons).toEqual([]);
    server.updateNativeState({
      available: true,
      status: "running",
      controls: "menu",
      focused: true,
    });
    epoch = server.getState().epoch;
    input(socket, epoch, 1, ["b"]);
    await waitUntil(() => server.getState().players[0].buttons.includes("b"));
    socket.close();
    await waitUntil(() => !server.getState().players[0].connected);
    expect(snapshots.at(-1)!.players[0].buttons).toEqual([]);
  });

  it("allows only the navigator to change controls and resets the epoch before mode changes", async () => {
    const { commands, snapshots } = await setupNative();
    const first = await connect((await approve("Navigator")).token);
    const second = await connect((await approve("Second")).token);
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    const epoch = server.getState().epoch;
    input(first.socket, epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.includes("a"));
    const denied = receive(second.socket, "error");
    second.socket.send(
      JSON.stringify({ type: "native-controls", mode: "fight" }),
    );
    expect(await denied).toMatchObject({
      type: "error",
      code: "not_navigator",
    });
    expect(server.getState().native.controls).toBe("menu");
    first.socket.send(
      JSON.stringify({ type: "native-controls", mode: "fight" }),
    );
    await waitUntil(() => server.getState().native.controls === "fight");
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(server.getState().players[0].buttons).toEqual([]);
    expect(snapshots.at(-1)).toMatchObject({
      controls: "fight",
      players: [
        { slot: 1, buttons: [] },
        { slot: 2, buttons: [] },
      ],
    });
    await waitUntil(() =>
      commands.some(
        (command) => command.type === "controls" && command.mode === "fight",
      ),
    );
    input(first.socket, epoch, 2, ["x"]);
    await sleep(30);
    expect(server.getState().players[0].buttons).toEqual([]);
    expect(await server.command({ type: "nativeFocus" })).toEqual({ ok: true });
    expect(commands.at(-1)).toEqual({ type: "focus" });
  });

  it.each([
    "openHome",
    "stopGame",
    "resetSession",
    "setNetwork",
    "close",
  ] as const)("stops native input and runtime on %s", async (action) => {
    const { commands, snapshots } = await setupNative();
    const { socket } = await connect((await approve()).token);
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    input(socket, server.getState().epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.includes("a"));
    if (action === "close") await server.close();
    else if (action === "setNetwork")
      await server.command({ type: "setNetwork", address: "127.0.0.1" });
    else await server.command({ type: action });
    expect(commands.filter((command) => command.type === "stop")).toHaveLength(
      1,
    );
    expect(
      snapshots.at(-1)!.players.every((player) => player.buttons.length === 0),
    ).toBe(true);
    expect(server.getState().phase).not.toBe("native");
  });

  it("returns Home with a safe error when launch fails or the native runtime exits", async () => {
    await setupNative(async (command) =>
      command.type === "start"
        ? {
            ok: false,
            error: String.raw`Cannot open E:\Games\private\Idol.exe`,
          }
        : { ok: true },
    );
    expect(
      (await server.command({ type: "startGame", gameId: "idol-showdown" })).ok,
    ).toBe(false);
    expect(server.getState()).toMatchObject({
      phase: "home",
      profile: "menu",
      native: { status: "error" },
    });
    expect(JSON.stringify(server.getState().native)).not.toContain("E:");
    await setupNative();
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    const epoch = server.getState().epoch;
    server.updateNativeState({
      available: true,
      status: "idle",
      controls: "menu",
      focused: false,
    });
    expect(server.getState()).toMatchObject({
      phase: "home",
      profile: "menu",
      native: { status: "idle" },
    });
    expect(server.getState().epoch).toBeGreaterThan(epoch);
  });

  it("keeps inputs neutral while asynchronous launch or stop is pending", async () => {
    let finishStart: ((result: CommandResult) => void) | undefined;
    let finishStop: ((result: CommandResult) => void) | undefined;
    const { snapshots } = await setupNative(async (command) => {
      if (command.type === "start")
        return new Promise((resolve) => {
          finishStart = resolve;
        });
      if (command.type === "stop")
        return new Promise((resolve) => {
          finishStop = resolve;
        });
      return { ok: true };
    });
    const { socket } = await connect((await approve()).token);
    try {
      const starting = server.command({
        type: "startGame",
        gameId: "idol-showdown",
      });
      await waitUntil(
        () =>
          finishStart !== undefined &&
          server.getState().native.status === "starting",
      );
      input(socket, server.getState().epoch, 1, ["a"]);
      await sleep(30);
      expect(server.getState().players[0].buttons).toEqual([]);
      expect(snapshots.at(-1)!.players[0].buttons).toEqual([]);
      server.updateNativeState({
        available: true,
        status: "running",
        controls: "menu",
        focused: true,
      });
      finishStart!({ ok: true });
      await starting;
      input(socket, server.getState().epoch, 1, ["a"]);
      await waitUntil(() => server.getState().players[0].buttons.includes("a"));
      const stopping = server.command({ type: "stopGame" });
      await waitUntil(
        () =>
          finishStop !== undefined &&
          server.getState().native.status === "paused",
      );
      server.updateNativeState({
        available: true,
        status: "running",
        controls: "menu",
        focused: true,
      });
      input(socket, server.getState().epoch, 1, ["x"]);
      await sleep(30);
      expect(server.getState().players[0].buttons).toEqual([]);
      expect(
        snapshots
          .at(-1)!
          .players.every((player) => player.buttons.length === 0),
      ).toBe(true);
      finishStop!({ ok: true });
      await stopping;
      expect(server.getState().phase).toBe("home");
    } finally {
      finishStart?.({ ok: true });
      finishStop?.({ ok: true });
    }
  });
});
afterEach(async () => {
  for (const socket of liveSockets.splice(0)) socket.terminate();
  await server.close();
  vi.restoreAllMocks();
  if (
    !path
      .resolve(root)
      .startsWith(path.resolve(process.cwd(), ".local", "tests") + path.sep)
  ) {
    throw new Error("Test cleanup escaped its scratch directory");
  }
  await rm(root, { recursive: true, force: true });
});

describe("console sound feedback", () => {
  it("emits one host cue per accepted selection or confirmation across PC and phone input", async () => {
    await server.command({ type: "openHome" });
    await server.command({ type: "selectGame", gameId: "idol-showdown" });
    expect(server.getState().feedback).toEqual({ sequence: 1, sound: "move" });
    await server.command({ type: "toggleFavorite", gameId: "idol-showdown" });
    await server.command({ type: "startGame", gameId: "idol-showdown" });
    expect(server.getState().feedback.sequence).toBe(1);
    const player = await approve();
    const client = await connect(player.token);
    expect(client.state).not.toHaveProperty("feedback");
    input(client.socket, client.state.epoch, 1, ["left"]);
    await waitUntil(() => server.getState().feedback.sequence === 2);
    expect(server.getState().feedback.sound).toBe("move");
    input(client.socket, client.state.epoch, 1, ["left"]);
    input(client.socket, client.state.epoch, 2, ["left"]);
    await sleep(50);
    expect(server.getState().feedback.sequence).toBe(2);
    input(client.socket, client.state.epoch, 3, []);
    input(client.socket, client.state.epoch, 4, ["confirm"]);
    await waitUntil(() => server.getState().phase === "lab");
    expect(server.getState().feedback).toEqual({
      sequence: 3,
      sound: "confirm",
    });
    await server.command({ type: "toggleMute" });
    expect(server.getState().feedback.sequence).toBe(3);
  });
});

describe("LAN boundary and pairing", () => {
  it("serves only controller assets and public metadata, with CSP and no private state", async () => {
    const response = await fetch(url("/controller"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(await response.text()).toContain("Controller");
    expect((await fetch(url("/assets/app.js"))).status).toBe(200);
    expect((await fetch(url("/host.html"))).status).toBe(404);
    expect((await fetch(url("/api/state"))).status).toBe(404);
    expect(
      (await fetch(url("/api/public"))).headers.get(
        "access-control-allow-origin",
      ),
    ).toBeNull();
    const metadata = await (await fetch(url("/api/public"))).json();
    expect(metadata).toEqual({
      version: 1,
      name: "WaterConsole",
      capacity: 4,
      pairingLocked: false,
    });
    expect(await rawGet("/assets/%2e%2e/host.html")).toBe(400);
    expect(await rawGet("/api/public", "attacker.example:8787")).toBe(403);
  });

  it("requires matching Origin for pairing and WebSocket upgrades", async () => {
    const rejected = await fetch(url("/api/pair"), {
      method: "POST",
      headers: { ...headers(), Origin: "https://attacker.example" },
      body: JSON.stringify({
        name: "Intruder",
        code: server.getState().pairing.code,
      }),
    });
    expect(rejected.status).toBe(403);
    const socket = openSocket("https://attacker.example");
    const status = await new Promise<number>((resolve) =>
      socket.once("unexpected-response", (_request, response) => {
        response.resume();
        socket.terminate();
        resolve(response.statusCode!);
      }),
    );
    expect(status).toBe(403);
  });

  it("requires PC approval and a secret ticket before issuing a device token", async () => {
    const ticket = await requestPair("Green player");
    expect(server.getState().players).toHaveLength(0);
    expect(server.getState().pending[0].verificationCode).toBe(
      ticket.verificationCode,
    );
    expect((await fetch(url(`/api/pair/${ticket.id}`))).status).toBe(404);
    const pending = await (
      await fetch(url(`/api/pair/${ticket.id}`), {
        headers: { Authorization: `Bearer ${ticket.secret}` },
      })
    ).json();
    expect(pending).toEqual({ status: "pending" });
    const socket = openSocket();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    const end = closed(socket);
    socket.send(
      JSON.stringify({ type: "auth", version: 1, token: ticket.secret }),
    );
    expect(await end).toBe(1008);
  });

  it("rejects non-ASCII secrets without throwing or terminating the server", async () => {
    await approve();
    const response = await fetch(url("/api/pair"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: "Unicode", nonce: "é".repeat(32) }),
    });
    expect(response.status).toBe(403);
    const socket = openSocket();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    const end = closed(socket);
    socket.send(
      JSON.stringify({ type: "auth", version: 1, token: "é".repeat(64) }),
    );
    expect(await end).toBe(1008);
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });

  it("allocates unique slots to four approved devices and rejects a fifth", async () => {
    for (let i = 1; i <= 4; i++) await approve(`Player ${i}`);
    expect(server.getState().players.map((player) => player.slot)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(
      server.getState().players.filter((player) => player.canNavigate),
    ).toHaveLength(1);
    const response = await fetch(url("/api/pair"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: "Fifth",
        code: server.getState().pairing.code,
      }),
    });
    expect(response.status).toBe(409);
  });

  it("expires pairing codes and tickets, rejects requests, and honors pairing lock", async () => {
    const ticket = await requestPair();
    await server.command({ type: "reject", requestId: ticket.id });
    expect(
      await (
        await fetch(url(`/api/pair/${ticket.id}`), {
          headers: { Authorization: `Bearer ${ticket.secret}` },
        })
      ).json(),
    ).toMatchObject({ status: "rejected" });
    await server.command({ type: "setPairingLocked", locked: true });
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            name: "Locked",
            code: server.getState().pairing.code,
          }),
        })
      ).status,
    ).toBe(423);
    await server.command({ type: "setPairingLocked", locked: false });
    const oldCode = server.getState().pairing.code;
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 121_000);
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ name: "Expired", code: oldCode }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await server.command({ type: "approve", requestId: ticket.id })).ok,
    ).toBe(false);
  });

  it("limits pairing guesses and rejects oversized requests", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (
          await fetch(url("/api/pair"), {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ name: "Guess", code: "bad" }),
          })
        ).status,
      ).toBe(403);
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ name: "Guess", code: "bad" }),
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ name: "x".repeat(10_000), code: "bad" }),
        })
      ).status,
    ).toBe(413);
  });
});

describe("controller state and recovery", () => {
  it("neutralizes stale input after 300ms, ignores old epochs and duplicate sequence frames", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    await server.command({ type: "startGame", gameId: "controller-lab" });
    const epoch = server.getState().epoch;
    input(socket, epoch - 1, 1, ["right"]);
    await sleep(30);
    expect(server.getState().players[0].buttons).toEqual([]);
    input(socket, epoch, 2, ["right", "a"]);
    await waitUntil(() => server.getState().players[0].buttons.length === 2);
    input(socket, epoch, 1, ["left"]);
    await sleep(30);
    expect(server.getState().players[0].buttons).toEqual(["right", "a"]);
    expect(server.getState().players[0].pressCount).toBe(2);
    await waitUntil(() => server.getState().players[0].buttons.length === 0);
    expect(server.getState().players[0].position.x).toBeGreaterThan(0.5);
  });

  it("reconnects the same slot with neutral input and invalidates old tokens on session reset", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    await server.command({ type: "startGame", gameId: "controller-lab" });
    input(socket, server.getState().epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.length === 1);
    socket.close();
    await waitUntil(() => !server.getState().players[0].connected);
    expect(server.getState().players[0].buttons).toEqual([]);
    const reconnect = await connect(device.token);
    expect(reconnect.state.players[0]).toMatchObject({
      id: device.playerId,
      slot: 1,
      buttons: [],
    });
    await server.command({ type: "resetSession" });
    const old = openSocket();
    await new Promise<void>((resolve) => old.once("open", resolve));
    const end = closed(old);
    old.send(JSON.stringify({ type: "auth", version: 1, token: device.token }));
    expect(await end).toBe(1008);
  });

  it("ignores in-flight lab actions after returning Home but rejects a wrong protocol version", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    await server.command({ type: "startGame", gameId: "controller-lab" });
    const labEpoch = server.getState().epoch;
    input(socket, labEpoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.includes("a"));
    await server.command({ type: "stopGame" });
    input(socket, labEpoch, 2, ["a", "x"]);
    await sleep(50);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(server.getState().players[0]).toMatchObject({
      connected: true,
      buttons: [],
    });
    const end = closed(socket);
    socket.send(
      JSON.stringify({
        type: "input",
        version: 2,
        epoch: server.getState().epoch,
        seq: 3,
        buttons: [],
        axes: { x: 0, y: 0 },
      }),
    );
    expect(await end).toBe(1008);
  });

  it("releases a disconnected slot after 30 seconds", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    socket.close();
    await waitUntil(() => !server.getState().players[0].connected);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 30_100);
    await waitUntil(() => server.getState().players.length === 0);
  });

  it("rejects forbidden actions, raw keycodes and non-finite axes", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    const end = closed(socket);
    socket.send(
      JSON.stringify({
        type: "input",
        version: 1,
        epoch: server.getState().epoch,
        seq: 1,
        buttons: ["a"],
        axes: { x: 0, y: 0 },
        keycode: 65,
      }),
    );
    expect(await end).toBe(1008);
    const reconnect = await connect(device.token);
    const invalid = closed(reconnect.socket);
    reconnect.socket.send(
      JSON.stringify({
        type: "input",
        version: 1,
        epoch: server.getState().epoch,
        seq: 1,
        buttons: [],
        axes: { x: null, y: 0 },
      }),
    );
    expect(await invalid).toBe(1008);
  });

  it("rejects simultaneous connections for the same player and floods", async () => {
    const device = await approve();
    const first = await connect(device.token);
    const duplicate = openSocket();
    await new Promise<void>((resolve) => duplicate.once("open", resolve));
    const endDuplicate = closed(duplicate);
    duplicate.send(
      JSON.stringify({ type: "auth", version: 1, token: device.token }),
    );
    expect(await endDuplicate).toBe(1008);
    const endFlood = closed(first.socket);
    for (let i = 0; i < 185; i++)
      first.socket.send(JSON.stringify({ type: "ping", id: i, at: 0 }));
    expect(await endFlood).toBe(1008);
  });

  it("rejects malformed JSON and oversized WebSocket frames without stopping the server", async () => {
    const malformed = openSocket();
    await new Promise<void>((resolve) => malformed.once("open", resolve));
    const malformedEnd = closed(malformed);
    malformed.send("{broken");
    expect(await malformedEnd).toBe(1008);
    const oversized = openSocket();
    await new Promise<void>((resolve) => oversized.once("open", resolve));
    const oversizedEnd = closed(oversized);
    oversized.send("x".repeat(9000));
    expect(await oversizedEnd).toBe(1009);
    expect((await fetch(url("/api/public"))).status).toBe(200);
    expect(server.getState().players).toHaveLength(0);
  });

  it("closes an unauthenticated socket after its authentication deadline", async () => {
    const socket = openSocket();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    const started = Date.now();
    expect(await closed(socket)).toBe(1008);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
    expect(server.getState().players).toHaveLength(0);
  });

  it("does not expose unsupported asset file types", async () => {
    await writeFile(
      path.join(root, "public", "assets", "notes.txt"),
      "PRIVATE NOTES",
    );
    const response = await fetch(url("/assets/notes.txt"));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("PRIVATE NOTES");
  });

  it("recovers from damaged preferences with safe defaults", async () => {
    await server.close();
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "data", "preferences.json"), "{broken");
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
    });
    expect(server.getState().favorites).toEqual([]);
    expect(server.getState().recent).toEqual([]);
    expect(server.getState().muted).toBe(false);
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });

  it("drops collection navigation bursts rather than queuing moves", async () => {
    await server.command({ type: "openHome" });
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      await Promise.all(Array.from({ length: 50 }, () => server.command({ type: "navigate", action: "right" })));
      expect(server.getState().selectedGameId).toBe("idol-showdown");
      now += COLLECTION_MOVE_INTERVAL - 1;
      await server.command({ type: "navigate", action: "right" });
      expect(server.getState().selectedGameId).toBe("idol-showdown");
      now++;
      await server.command({ type: "navigate", action: "right" });
      expect(server.getState().selectedGameId).toBe("hotwheels-unleashed");
    } finally { clock.mockRestore(); }
    await sleep(COLLECTION_MOVE_INTERVAL + 30);
    expect(server.getState().selectedGameId).toBe("hotwheels-unleashed");
  });

  it("repeats a live navigator's held collection direction and stops on release or stale input", async () => {
    const navigator = await approve("Held navigation");
    const { socket } = await connect(navigator.token);
    await server.command({ type: "openHome" });
    const epoch = server.getState().epoch;
    let seq = 1;
    input(socket, epoch, seq++, ["right"]);
    await waitUntil(() => server.getState().selectedGameId === "idol-showdown");
    const keepAlive = setInterval(() => input(socket, epoch, seq++, ["right"]), 80);
    try {
      await waitUntil(() => server.getState().selectedGameId === "hotwheels-unleashed");
    } finally { clearInterval(keepAlive); }
    input(socket, epoch, seq++);
    await sleep(NAVIGATION_HOLD_INTERVAL + 50);
    expect(server.getState().selectedGameId).toBe("hotwheels-unleashed");
    input(socket, epoch, seq++, ["right"]);
    await waitUntil(() => server.getState().selectedGameId === "disney-speedstorm");
    await sleep(NAVIGATION_HOLD_INTERVAL + 80);
    expect(server.getState().selectedGameId).toBe("disney-speedstorm");
    expect(server.getState().players[0].buttons).toEqual([]);
  });

  it("lets only the assigned navigator operate Home and switches controller epochs", async () => {
    const one = await approve("One");
    const two = await approve("Two");
    const first = await connect(one.token);
    const second = await connect(two.token);
    await server.command({ type: "openHome" });
    const epoch = server.getState().epoch;
    input(second.socket, epoch, 1, ["right"]);
    await sleep(40);
    expect(server.getState().selectedGameId).toBe("controller-lab");
    input(first.socket, epoch, 1, ["right"]);
    await waitUntil(() => server.getState().selectedGameId === "idol-showdown");
    expect(
      (await server.command({ type: "startGame", gameId: "idol-showdown" })).ok,
    ).toBe(false);
    await server.command({ type: "assignNavigator", playerId: two.playerId });
    await sleep(NAVIGATION_HOLD_INTERVAL);
    input(second.socket, epoch, 2);
    input(second.socket, epoch, 3, ["right"]);
    await waitUntil(
      () => server.getState().selectedGameId === "hotwheels-unleashed",
    );
    input(second.socket, epoch, 4);
    await sleep(NAVIGATION_HOLD_INTERVAL);
    input(second.socket, epoch, 5, ["right"]);
    await waitUntil(
      () => server.getState().selectedGameId === "disney-speedstorm",
    );
    input(second.socket, epoch, 6);
    await sleep(NAVIGATION_HOLD_INTERVAL);
    input(second.socket, epoch, 7, ["right"]);
    await waitUntil(() => server.getState().selectedGameId === "brawlhalla");
    input(second.socket, epoch, 8);
    await sleep(NAVIGATION_HOLD_INTERVAL);
    input(second.socket, epoch, 9, ["right"]);
    await waitUntil(
      () => server.getState().selectedGameId === "controller-lab",
    );
    input(second.socket, epoch, 10);
    input(second.socket, epoch, 11, ["confirm"]);
    await waitUntil(() => server.getState().heroMode === "detail");
    expect(server.getState().phase).toBe("home");
    input(second.socket, epoch, 12);
    input(second.socket, epoch, 13, ["confirm"]);
    await waitUntil(() => server.getState().phase === "lab");
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(
      server.getState().players.every((player) => player.buttons.length === 0),
    ).toBe(true);
    await server.command({ type: "setLayout", mode: "split-4" });
    expect(server.getState().displayMode).toBe("split-4");
    const labEpoch = server.getState().epoch;
    second.socket.send(JSON.stringify({ type: "nav", action: "library" }));
    await waitUntil(() => server.getState().phase === "home");
    expect(server.getState().profile).toBe("menu");
    expect(server.getState().epoch).toBeGreaterThan(labEpoch);
  });
});

describe("lifecycle and preferences", () => {
  it("persists favorites, history and mute across a clean restart", async () => {
    await server.command({ type: "toggleFavorite", gameId: "controller-lab" });
    await server.command({ type: "toggleMute" });
    await server.command({ type: "startGame", gameId: "controller-lab" });
    await server.close();
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
    });
    expect(server.getState()).toMatchObject({
      favorites: ["controller-lab"],
      recent: ["controller-lab"],
      muted: true,
      phase: "lobby",
      players: [],
    });
    await server.command({ type: "setView", view: "favorites" });
    await server.command({ type: "setSearch", query: "Idol" });
    expect(server.getState().search).toBe("Idol");
  });

  it("selects a free port when the preferred port is occupied", async () => {
    const occupied = net.createServer();
    await new Promise<void>((resolve) =>
      occupied.listen(0, "127.0.0.1", resolve),
    );
    const busyPort = (occupied.address() as net.AddressInfo).port;
    await server.close();
    try {
      server = await createWaterConsoleServer({
        address: "127.0.0.1",
        port: busyPort,
        publicDir: path.join(root, "public"),
        dataDir: path.join(root, "data"),
      });
      expect(server.port).not.toBe(busyPort);
      expect(server.getState().pairing.url).toContain(
        `:${server.port}/controller`,
      );
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it("rebinds without preserving old session credentials and keeps preferences", async () => {
    const device = await approve();
    await server.command({ type: "toggleFavorite", gameId: "controller-lab" });
    const result = await server.command({
      type: "setNetwork",
      address: "127.0.0.1",
    });
    expect(result).toEqual({ ok: true });
    expect(server.getState().players).toEqual([]);
    expect(server.getState().favorites).toEqual(["controller-lab"]);
    const old = openSocket();
    await new Promise<void>((resolve) => old.once("open", resolve));
    const end = closed(old);
    old.send(JSON.stringify({ type: "auth", version: 1, token: device.token }));
    expect(await end).toBe(1008);
  });

  it("reports failed network binding and permits a later recovery attempt", async () => {
    const originalListen = net.Server.prototype.listen;
    let failures = 2;
    const listener = vi
      .spyOn(net.Server.prototype, "listen")
      .mockImplementation(function (
        this: net.Server,
        ...args: Parameters<net.Server["listen"]>
      ) {
        if (failures-- > 0) {
          queueMicrotask(() =>
            this.emit(
              "error",
              Object.assign(new Error("Address unavailable"), {
                code: "EADDRNOTAVAIL",
              }),
            ),
          );
          return this;
        }
        return originalListen.apply(this, args);
      });
    expect(
      (await server.command({ type: "setNetwork", address: "127.0.0.1" })).ok,
    ).toBe(false);
    expect(server.getState().network).toMatchObject({
      status: "error",
      error: expect.stringContaining("could not bind"),
    });
    listener.mockRestore();
    expect(
      (await server.command({ type: "setNetwork", address: "127.0.0.1" })).ok,
    ).toBe(true);
    expect(server.getState().network.status).toBe("offline");
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });

  it("serializes concurrent network changes and closes every previous listener", async () => {
    await server.close();
    const ports = new Set<number>();
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
      onState: (state) => ports.add(state.network.port),
    });
    const results = await Promise.all([
      server.command({ type: "setNetwork", address: "127.0.0.1" }),
      server.command({ type: "setNetwork", address: "127.0.0.1" }),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect((await fetch(url("/api/public"))).status).toBe(200);
    for (const oldPort of ports)
      expect(await portOpen(oldPort)).toBe(oldPort === server.port);
    const change = server.command({ type: "setNetwork", address: "127.0.0.1" });
    await server.close();
    expect(await change).toEqual({ ok: true });
    for (const oldPort of ports) expect(await portOpen(oldPort)).toBe(false);
    expect((await server.command({ type: "openHome" })).ok).toBe(false);
  });

  it("publishes the recovered pairing URL and neutral session after a failed requested bind", async () => {
    await server.close();
    const snapshots: ReturnType<Server["getState"]>[] = [];
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
      onState: (state) => snapshots.push(state),
    });
    await approve();
    const oldUrl = server.getState().pairing.url;
    const originalListen = net.Server.prototype.listen;
    let fail = true;
    const listener = vi
      .spyOn(net.Server.prototype, "listen")
      .mockImplementation(function (
        this: net.Server,
        ...args: Parameters<net.Server["listen"]>
      ) {
        if (fail) {
          fail = false;
          queueMicrotask(() =>
            this.emit(
              "error",
              Object.assign(new Error("Address unavailable"), {
                code: "EADDRNOTAVAIL",
              }),
            ),
          );
          return this;
        }
        return originalListen.apply(this, args);
      });
    expect(
      (await server.command({ type: "setNetwork", address: "127.0.0.1" })).ok,
    ).toBe(false);
    listener.mockRestore();
    const published = snapshots.at(-1)!;
    expect(published.players).toEqual([]);
    expect(published.pairing.url).not.toBe(oldUrl);
    expect(published.pairing.url).toBe(server.getState().pairing.url);
    expect(published.network.port).toBe(server.port);
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });
});
