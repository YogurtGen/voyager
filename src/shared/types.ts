import type { ArtworkSlot, ControllerDefinition, StudioInput, StudioSession, LibraryCommand, LibraryResult } from "./studio-model";
export const PROTOCOL_VERSION = 1 as const;
export const COLORS = ["#32e49e", "#55a5ff", "#ffb95e", "#cf88ff"] as const;
export const ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "confirm",
  "back",
  "a",
  "b",
  "x",
  "y",
  "start",
  "l",
  "r",
  "lt",
  "rt",
  "select",
] as const;
export type Action = (typeof ACTIONS)[number];
export type DisplayMode = "shared" | "split-2" | "split-4";
export type Phase = "lobby" | "home" | "lab" | "native";
export type LibraryView = "all" | "favorites" | "recent";
export interface LibraryFilters { tag: string; players: string; connection: string; setup: string; }
export const EMPTY_LIBRARY_FILTERS: LibraryFilters = { tag: "", players: "", connection: "", setup: "" };
export function matchesLibraryFilters(game: GameManifest, filters = EMPTY_LIBRARY_FILTERS) {
  return (!filters.tag || game.tags?.includes(filters.tag)) && (!filters.players || game.maxPlayers >= Number(filters.players)) && (!filters.connection || game.connection === filters.connection) && (!filters.setup || game.setup === filters.setup);
}
export type NativeGameId =
  "idol-showdown" | "hotwheels-unleashed" | "disney-speedstorm" | "brawlhalla" | `local-${string}`;
export type NativeControls = "menu" | "fight" | "race" | "game";
export interface GameManifest {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  runtime: "web" | "native";
  displayModes: DisplayMode[];
  controllerProfile:
    "menu" | "lab" | "idol" | "racing" | "speedstorm" | "brawlhalla" | "gamepad";
  availability: "available" | "planned";
  launchRequirement?: { label: string; description: string };
  offlineNote?: string;
  requiresGamepad?: boolean;
  connection?: "offline" | "online" | "offline-online";
  local?: boolean; tags?: string[]; cover?:ArtworkSlot; banner?:ArtworkSlot; setup?:string;
  trailerAvailable?: boolean;
}
export const GAME_PRESETS: GameManifest[] = [
  {
    id: "controller-lab",
    tags: ["Controller test", "Party"],
    title: "Controller Lab",
    subtitle: "A little room for every player.",
    description:
      "Connect your phones, find your color, and put every button to the test. One screen. Up to four controllers. All on your own network.",
    minPlayers: 1,
    maxPlayers: 4,
    runtime: "web",
    displayModes: ["shared", "split-2", "split-4"],
    controllerProfile: "lab",
    availability: "available",
  },
  {
    id: "idol-showdown",
    tags: ["Fighting", "Arcade"],
    title: "Idol Showdown",
    subtitle: "Your PC. Your arena.",
    description:
      "Launch the original Idol Showdown from your own Steam installation. One or two phone controllers share one arena. Uses the game's default keyboard bindings; custom bindings may need to be reset in-game.",
    minPlayers: 1,
    maxPlayers: 2,
    runtime: "native",
    displayModes: ["shared"],
    controllerProfile: "idol",
    availability: "available",
  },
  {
    id: "hotwheels-unleashed",
    tags: ["Racing", "Arcade"],
    title: "HOT WHEELS UNLEASHED",
    subtitle: "Your phone. Your starting grid.",
    description:
      "Race solo or connect two phones for Quick Modes → Split Screen. Player 2 requires PC controller setup.",
    minPlayers: 1,
    maxPlayers: 2,
    runtime: "native",
    displayModes: ["shared", "split-2"],
    controllerProfile: "racing",
    availability: "available",
    connection: "online",
    offlineNote:
      "Online · Epic Games. Internet and Epic sign-in may be required to launch this edition.",
  },
  {
    id: "disney-speedstorm",
    tags: ["Racing", "Party"],
    title: "Disney Speedstorm",
    subtitle: "Four phones. One starting grid.",
    description:
      "Race together in Friendly Race → Local Race with up to four independent phone controllers. Local races work offline; online modes need an internet connection.",
    minPlayers: 1,
    maxPlayers: 4,
    runtime: "native",
    displayModes: ["shared", "split-2", "split-4"],
    controllerProfile: "speedstorm",
    availability: "available",
    connection: "offline-online",
    offlineNote:
      "Offline · Online. Local Race / Local Freeplay supports offline split screen. Other modes require internet.",
  },
  {
    id: "brawlhalla",
    tags: ["Fighting", "Party"],
    title: "Brawlhalla",
    subtitle: "Four phones. One arena.",
    description:
      "Join Offline Play → Couch Party with up to four independent phone controllers in a shared arena. Online modes need an internet connection.",
    minPlayers: 1,
    maxPlayers: 4,
    runtime: "native",
    displayModes: ["shared"],
    controllerProfile: "brawlhalla",
    availability: "available",
    connection: "offline-online",
    offlineNote:
      "Offline · Online. Offline Play supports local matches; online modes require internet. Steam offline cold launch is not yet verified on this PC.",
  },
];
export const GAMES: GameManifest[] = GAME_PRESETS.filter(game => game.id === "controller-lab");

export interface ControllerProfile {
  id: "menu" | "lab" | "idol" | "racing" | "speedstorm" | "brawlhalla" | "gamepad";
  orientation: "portrait" | "landscape";
  actions: Action[];
}
export const PROFILES: Record<
  "menu" | "lab" | "idol" | "racing" | "speedstorm" | "brawlhalla" | "gamepad",
  ControllerProfile
> = {
  gamepad: {id:"gamepad",orientation:"landscape",actions:[...ACTIONS]},
  menu: {
    id: "menu",
    orientation: "portrait",
    actions: ["up", "down", "left", "right", "confirm", "back"],
  },
  lab: {
    id: "lab",
    orientation: "landscape",
    actions: [
      "up",
      "down",
      "left",
      "right",
      "confirm",
      "back",
      "a",
      "b",
      "x",
      "y",
      "start",
    ],
  },
  idol: { id: "idol", orientation: "landscape", actions: [...ACTIONS] },
  racing: { id: "racing", orientation: "landscape", actions: [...ACTIONS] },
  brawlhalla: {
    id: "brawlhalla",
    orientation: "landscape",
    actions: [...ACTIONS],
  },
  speedstorm: {
    id: "speedstorm",
    orientation: "landscape",
    actions: [...ACTIONS],
  },
};
export interface NativeRuntimeState {
  maxPlayers?: number;
  displayModes?: DisplayMode[];
  requiresGamepad?: boolean;
  quitting?: boolean;
  gamepad?: { available: boolean; message?: string };
  available: boolean;
  games?: Partial<Record<NativeGameId, boolean>>;
  gameId?: NativeGameId;
  status: "unavailable" | "idle" | "starting" | "running" | "paused" | "error";
  controls: NativeControls;
  focused: boolean;
  message?: string;
}
export const validGameId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
export function nativeAvailable(state: NativeRuntimeState, gameId: string) {
  if (gameId.startsWith("local-")) return state.games?.[gameId as NativeGameId] === true;
  if (
    ![
      "idol-showdown",
      "hotwheels-unleashed",
      "disney-speedstorm",
      "brawlhalla",
    ].includes(gameId)
  )
    return false;
  return state.games
    ? state.games[gameId as NativeGameId] === true
    : gameId === "idol-showdown" && state.available;
}
export function nativeRacingGame(gameId: string | undefined) {
  return gameId === "hotwheels-unleashed" || gameId === "disney-speedstorm";
}
export function nativeGamepadRequired(gameId: string | undefined) {
  return gameId === "disney-speedstorm" || gameId === "brawlhalla";
}
export function nativeSlotCount(gameId: string | undefined, configuredPlayers?:number) {
  if (gameId?.startsWith("local-")) return configuredPlayers ?? 4;
  return nativeGamepadRequired(gameId) ? 4 : 2;
}
export function nativeSlotAllowed(
  native: NativeRuntimeState,
  mode: DisplayMode,
  slot: number,
) {
  if (native.gameId?.startsWith("local-")) return Number.isInteger(slot) && slot >= 1 && slot <= (native.maxPlayers ?? 0) && nativeAvailable(native,native.gameId) && (native.displayModes ?? []).includes(mode) && (!native.requiresGamepad || native.gamepad?.available === true);
  if (
    !Number.isInteger(slot) ||
    slot < 1 ||
    slot > nativeSlotCount(native.gameId)
  )
    return false;
  if (native.gameId === "brawlhalla")
    return mode === "shared" && native.gamepad?.available === true;
  if (native.gameId === "disney-speedstorm")
    return (
      native.gamepad?.available === true &&
      slot <= (mode === "shared" ? 1 : mode === "split-2" ? 2 : 4)
    );
  if (native.gameId === "hotwheels-unleashed")
    return (
      slot === 1 || (mode === "split-2" && native.gamepad?.available === true)
    );
  return native.gameId === "idol-showdown" || native.gameId === undefined;
}
export type NativeCommand =
  | { type: "start"; gameId?: NativeGameId }
  | { type: "stop" }
  | { type: "focus" }
  | { type: "controls"; mode: NativeControls };
export interface NativeRumble {
  slot: number;
  epoch: number;
  largeMotor: number;
  smallMotor: number;
}
export interface NativeInputSnapshot {
  epoch: number;
  controls: NativeControls;
  players: Array<{ slot: number; buttons: Action[]; studio?:StudioInput }>;
}
export interface InputFrame {
  type: "input";
  version: 1;
  epoch: number;
  seq: number;
  buttons: Action[];
  axes: { x: number; y: number };
}
export interface Player {
  studio?:StudioInput;
  id: string;
  slot: number;
  name: string;
  color: string;
  connected: boolean;
  ready: boolean;
  canNavigate: boolean;
  buttons: Action[];
  axes: { x: number; y: number };
  position: { x: number; y: number };
  pressCount: number;
}
export interface Preferences {
  favorites: string[];
  recent: string[];
  muted: boolean;
  networkAddress?: string;
}
export interface SessionState {
  libraryFilters?: LibraryFilters;
  catalog?: GameManifest[]; studio?:StudioSession;
  version: 1;
  epoch: number;
  phase: Phase;
  players: Player[];
  selectedGameId: string;
  heroMode: "featured" | "detail";
  displayMode: DisplayMode;
  profile: "menu" | "lab" | "idol" | "racing" | "speedstorm" | "brawlhalla" | "gamepad";
  native: NativeRuntimeState;
  pairingLocked: boolean;
  search: string;
  libraryView: LibraryView;
  favorites: string[];
  recent: string[];
  muted: boolean;
  serverTime: number;
}
export interface PendingDevice {
  id: string;
  name: string;
  verificationCode: string;
  requestedAt: number;
}
export interface NetworkAddress {
  address: string;
  name: string;
  preferred: boolean;
}
export interface HostState extends SessionState {
  feedback: { sequence: number; sound: "move" | "confirm" };
  pending: PendingDevice[];
  pairing: { url: string; code: string; expiresAt: number };
  network: {
    address: string;
    port: number;
    interfaces: NetworkAddress[];
    status: "online" | "offline" | "error";
    error?: string;
  };
}
export type ToolbarAction =
  "library" | "favorites" | "recent" | "search" | "mute";
export type HostCommand =
  | { type: "approve"; requestId: string }
  | { type: "reject"; requestId: string }
  | { type: "kick"; playerId: string }
  | { type: "assignNavigator"; playerId: string }
  | { type: "openHome" }
  | { type: "showLobby" }
  | { type: "selectGame"; gameId: string }
  | { type: "browseGame"; gameId: string }
  | { type: "setFilters"; filters: LibraryFilters }
  | { type: "startGame"; gameId: string }
  | { type: "stopGame" }
  | { type: "nativeFocus" }
  | { type: "nativeControls"; mode: NativeControls }
  | { type: "setLayout"; mode: DisplayMode }
  | { type: "setPairingLocked"; locked: boolean }
  | { type: "resetSession" }
  | { type: "setSearch"; query: string }
  | { type: "setView"; view: LibraryView }
  | { type: "toggleFavorite"; gameId: string }
  | { type: "toggleMute" }
  | { type: "setNetwork"; address: string }
  | { type: "navigate"; action: Action }
  | { type:"studioMode"; modeId:string };
export interface CommandResult {
  ok: boolean;
  error?: string;
}
export interface HostBridge {
  presentation?(command: import("./presentation").PresentationCommand): Promise<import("./presentation").PresentationResult>;
  getState(): Promise<HostState>;
  command(command: HostCommand): Promise<CommandResult>;
  library?(command:LibraryCommand):Promise<LibraryResult>;
  onState(listener: (state: HostState) => void): () => void;
  toggleFullscreen(): Promise<boolean>;
  getFullscreen(): Promise<boolean>;
  minimize(): void;
  quit(): void;
}
export type ClientMessage =
  | { type: "auth"; version: 1; token: string }
  | InputFrame
  | {type:"studio-input";version:1;epoch:number;seq:number;input:StudioInput}
  | {type:"studio-mode";modeId:string}
  | { type: "rename"; name: string }
  | { type: "ready"; ready: boolean }
  | { type: "nav"; action: ToolbarAction; query?: string }
  | { type: "native-controls"; mode: NativeControls }
  | { type: "native-layout"; mode: "shared" | "split-2" | "split-4" }
  | { type: "ping"; id: number; at: number };
export type ServerMessage =
  | { type: "haptics"; epoch: number; durationMs: number }
  | { type: "authenticated"; playerId: string; state: SessionState }
  | { type: "state"; state: SessionState }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; id: number; at: number }
  | { type: "ended"; message: string };
export interface PairRequest {
  name: string;
  nonce?: string;
  code?: string;
}
export interface PairTicket {
  id: string;
  secret: string;
  verificationCode: string;
  expiresAt: number;
}
export type PairStatus =
  | { status: "pending" }
  | { status: "approved"; token: string; playerId: string }
  | { status: "rejected"; message: string };
export interface GameAdapter {
  manifest: GameManifest;
  available(): boolean;
  start(): void;
  stop(): void;
  input(playerId: string, frame: InputFrame): void;
  reset(playerId?: string): void;
}
declare global {
  interface Window {
    waterconsole?: HostBridge;
  }
}
