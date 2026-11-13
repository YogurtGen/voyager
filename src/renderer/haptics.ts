import {
  nativeSlotAllowed,
  type Action,
  type SessionState,
} from "../shared/types";

const PREFERENCE_KEY = "waterconsole.vibration";
const BOOST_MS = 30;
const MAX_RUMBLE_MS = 140;
const ATTACK_MS: Partial<Record<Action, number>> = {
  a: 20,
  b: 20,
  x: 20,
  y: 20,
  l: 35,
  r: 35,
  lt: 35,
  rt: 35,
};

function savedPreference() {
  try {
    return localStorage.getItem(PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function racingHapticsAllowed(
  state: SessionState | null,
  playerId: string,
) {
  if (
    !state ||
    state.phase !== "native" ||
    state.native.controls !== "race" ||
    state.native.status !== "running" ||
    !state.native.focused ||
    state.native.quitting
  )
    return false;
  const slot = state.players.find(
    (player) => player.id === playerId && player.connected,
  )?.slot;
  if (slot === undefined) return false;
  const profileMatches =
    (state.profile === "speedstorm" &&
      state.native.gameId === "disney-speedstorm") ||
    (state.profile === "racing" &&
      state.native.gameId === "hotwheels-unleashed");
  return (
    profileMatches && nativeSlotAllowed(state.native, state.displayMode, slot)
  );
}

export function fightingHapticsAllowed(
  state: SessionState | null,
  playerId: string,
) {
  if (
    !state ||
    state.phase !== "native" ||
    state.profile !== "idol" ||
    state.native.gameId !== "idol-showdown" ||
    state.native.controls !== "fight" ||
    state.native.status !== "running" ||
    !state.native.focused ||
    state.native.quitting
  )
    return false;
  const player = state.players.find(
    (player) => player.id === playerId && player.connected,
  );
  return (
    !!player && nativeSlotAllowed(state.native, state.displayMode, player.slot)
  );
}

export function brawlhallaHapticsAllowed(
  state: SessionState | null,
  playerId: string,
) {
  if (
    !state ||
    state.phase !== "native" ||
    state.profile !== "brawlhalla" ||
    state.native.gameId !== "brawlhalla" ||
    state.native.controls !== "fight" ||
    state.native.status !== "running" ||
    !state.native.focused ||
    state.native.quitting
  )
    return false;
  const player = state.players.find(
    (player) => player.id === playerId && player.connected,
  );
  return (
    !!player && nativeSlotAllowed(state.native, state.displayMode, player.slot)
  );
}

export class ControllerHaptics {
  readonly supported = typeof navigator.vibrate === "function";
  enabled = savedPreference();
  suspended = false;
  private activated = false;
  private lastBoost = -Infinity;
  private lastRumble = -Infinity;
  private lastAttack = -Infinity;

  activate() {
    this.activated = true;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try {
      localStorage.setItem(PREFERENCE_KEY, enabled ? "on" : "off");
    } catch {
      // A storage restriction should not prevent changing feedback for this visit.
    }
    if (!enabled) this.stop();
  }

  private play(durationMs: number) {
    if (!this.supported || !this.enabled || !this.activated || this.suspended) return;
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Browsers may expose the API while declining vibration.
    }
  }

  boost() {
    const now = performance.now();
    if (now - this.lastBoost < 120) return;
    this.lastBoost = now;
    this.play(BOOST_MS);
  }

  attack(action: Action) {
    const duration = ATTACK_MS[action];
    if (!duration) return;
    const now = performance.now();
    if (now - this.lastAttack < 60) return;
    this.lastAttack = now;
    this.play(duration);
  }

  brawlAttack(action: Action) {
    const duration =
      action === "b" ? 35 : action === "x" || action === "y" ? 20 : 0;
    if (!duration) return;
    const now = performance.now();
    if (now - this.lastAttack < 60) return;
    this.lastAttack = now;
    this.play(duration);
  }

  rumble(durationMs: number) {
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) return;
    if (durationMs === 0) {
      this.stop();
      return;
    }
    const now = performance.now();
    if (
      now - this.lastBoost < 100 ||
      now - this.lastRumble < 70 ||
      now - this.lastAttack < 60
    )
      return;
    this.lastRumble = now;
    this.play(Math.min(durationMs, MAX_RUMBLE_MS));
  }

  cue(durationMs:number) {
    if(!Number.isFinite(durationMs)||durationMs<=0)return;
    const now=performance.now();if(now-this.lastAttack<60)return;this.lastAttack=now;this.play(Math.min(100,Math.round(durationMs)));
  }

  test() {
    this.activate();
    const suspended=this.suspended;
    this.suspended=false;
    this.play(50);
    this.suspended=suspended;
  }

  stop() {
    if (!this.supported || !this.activated) return;
    try {
      navigator.vibrate(0);
    } catch {
      // Stopping an unsupported/denied vibration remains a no-op.
    }
    this.lastBoost = -Infinity;
    this.lastRumble = -Infinity;
    this.lastAttack = -Infinity;
  }
}

export function studioHapticsAllowed(state:SessionState|null,playerId:string){if(!state||!state.studio||state.studio.preview||state.profile!=="gamepad"||state.phase!=="native"||state.native.controls!=="game"||state.native.status!=="running"||!state.native.focused||state.native.quitting)return false;const player=state.players.find(p=>p.id===playerId&&p.connected);return !!player&&nativeSlotAllowed(state.native,state.displayMode,player.slot);}
