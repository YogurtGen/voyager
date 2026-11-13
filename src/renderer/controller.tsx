import {PersonalLayoutEditor,usePersonalLayout} from "./personal-layout";
import {StudioPhone} from "./studio-phone";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  PROTOCOL_VERSION,
  nativeSlotAllowed,
  type Action,
  type ClientMessage,
  type PairStatus,
  type PairTicket,
  type Player,
  type ServerMessage,
  type SessionState,
  type ToolbarAction,
} from "../shared/types";
import { Avatar, Brand, Icon, IconButton, Mark } from "./ui";
import {
  ControllerHaptics,
  racingHapticsAllowed,
  studioHapticsAllowed,
  fightingHapticsAllowed,
  brawlhallaHapticsAllowed,
} from "./haptics";

import { readDirectionPad } from "./direction-pad";

const SESSION_TOKEN = "waterconsole.token";
const PAIR_TICKET = "waterconsole.ticket";
const SPEEDSTORM_STYLE_KEY = "waterconsole.speedstorm.control-style";
type SpeedstormControlStyle = "classic" | "assist";
function savedSpeedstormControlStyle(): SpeedstormControlStyle {
  try {
    return localStorage.getItem(SPEEDSTORM_STYLE_KEY) === "classic"
      ? "classic"
      : "assist";
  } catch {
    return "assist";
  }
}
const initialNonce =
  new URLSearchParams(location.hash.slice(1)).get("nonce") || "";
if (location.hash)
  history.replaceState(null, "", location.pathname + location.search);
function stored(key: string) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function save(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable in private mode. */
  }
}
function readTicket(): PairTicket | null {
  try {
    const t = JSON.parse(stored(PAIR_TICKET));
    return t?.id && t?.secret && t.expiresAt > Date.now() ? t : null;
  } catch {
    return null;
  }
}
type Connection =
  "idle" | "connecting" | "connected" | "reconnecting" | "ended";
function ControllerApp() {
  const [haptics] = useState(() => new ControllerHaptics());
  const [vibrationEnabled, setVibrationEnabled] = useState(haptics.enabled);
  const [feedbackSettings, setFeedbackSettings] = useState(false);
  const [speedstormControlStyle, setSpeedstormControlStyle] = useState(
    savedSpeedstormControlStyle,
  );
  const speedstormControlStyleRef = useRef(speedstormControlStyle);
  const [token, setToken] = useState(() => stored(SESSION_TOKEN));
  const [ticket, setTicket] = useState<PairTicket | null>(readTicket);
  const [name, setName] = useState(() => stored("waterconsole.name") || "");
  const [code, setCode] = useState("");
  const [nonce, setNonce] = useState(initialNonce);
  const [state, setState] = useState<SessionState | null>(null),
    [playerId, setPlayerId] = useState("");
  const [connection, setConnection] = useState<Connection>(
    token ? "connecting" : "idle",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [entered, setEntered] = useState(false),
    [rtt, setRtt] = useState<number | null>(null),
    [held, setHeld] = useState<Action[]>([]),
    [editing, setEditing] = useState(false),
    [searching, setSearching] = useState(false),
    [query, setQuery] = useState(""),
    [fullscreen, setFullscreen] = useState(!!document.fullscreenElement),
    [fullscreenHint, setFullscreenHint] = useState("");
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
  const socket = useRef<WebSocket | null>(null),
    current = useRef<SessionState | null>(null),
    seq = useRef(0),
    pointers = useRef(new Map<number, Action>()),
    dragPointer = useRef<number | null>(null),
    dragDirections = useRef<Action[]>([]),
    actions = useRef<Action[]>([]),
    enteredRef = useRef(false),
    ownPlayerId = useRef(""),
    feedbackSettingsRef = useRef(false),
    nameRef = useRef<HTMLInputElement>(null);
  const send = useCallback((message: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(message));
  }, []);
  const sendInput = useCallback(() => {
    const s = current.current;
    if(s?.studio)return;
    if (
      !s ||
      !enteredRef.current ||
      socket.current?.readyState !== WebSocket.OPEN
    )
      return;
    const buttons = actions.current;
    send({
      type: "input",
      version: PROTOCOL_VERSION,
      epoch: s.epoch,
      seq: seq.current++,
      buttons,
      axes: {
        x:
          (buttons.includes("right") ? 1 : 0) -
          (buttons.includes("left") ? 1 : 0),
        y:
          (buttons.includes("down") ? 1 : 0) - (buttons.includes("up") ? 1 : 0),
      },
    });
  }, [send]);
  const neutral = useCallback(() => {
    haptics.stop();
    pointers.current.clear();
    dragPointer.current = null;
    dragDirections.current = [];
    setStickPosition({ x: 0, y: 0 });
    actions.current = [];
    setHeld([]);
    sendInput();
  }, [sendInput, haptics]);
  const layoutRoot=useRef<HTMLElement>(null);
  const personal=usePersonalLayout(layoutRoot,`${entered ? 'entered' : 'waiting'}.${state?.selectedGameId??'home'}.${state?.profile??'none'}.${state?.native.controls??'menu'}.${speedstormControlStyle}`,neutral);
  feedbackSettingsRef.current=feedbackSettings||personal.editing;

  const chooseSpeedstormControlStyle = (style: SpeedstormControlStyle) => {
    neutral();
    speedstormControlStyleRef.current = style;
    setSpeedstormControlStyle(style);
    try {
      localStorage.setItem(SPEEDSTORM_STYLE_KEY, style);
    } catch {
      // The selected style still applies for this visit when storage is blocked.
    }
  };
  const updateActions = useCallback(() => {
    const pressed = new Set([
      ...pointers.current.values(),
      ...dragDirections.current,
    ]);
    const session = current.current;
    if (
      session?.profile === "speedstorm" &&
      session.native.controls === "race" &&
      speedstormControlStyleRef.current === "assist"
    ) {
      if (pressed.has("lt")) pressed.add("a");
      if (pressed.has("b")) pressed.delete("a");
    }
    actions.current = [...pressed];
    setHeld(actions.current);
    sendInput();
  }, [sendInput]);
  const press = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, action: Action) => {
      e.preventDefault();
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const newAction = !actions.current.includes(action);
      pointers.current.set(e.pointerId, action);
      updateActions();
      if (
        enteredRef.current &&
        !feedbackSettingsRef.current &&
        !document.hidden &&
        document.hasFocus() &&
        socket.current?.readyState === WebSocket.OPEN
      ) {
        if (
          action === "x" &&
          racingHapticsAllowed(current.current, ownPlayerId.current)
        ) {
          haptics.boost();
        } else if (
          newAction &&
          fightingHapticsAllowed(current.current, ownPlayerId.current)
        ) {
          haptics.attack(action);
        } else if (
          newAction &&
          brawlhallaHapticsAllowed(current.current, ownPlayerId.current)
        ) {
          haptics.brawlAttack(action);
        }
      }
    },
    [updateActions, haptics],
  );
  const release = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      if (e.type === "pointercancel" || e.type === "lostpointercapture")
        haptics.stop();
      pointers.current.delete(e.pointerId);
      updateActions();
    },
    [updateActions, haptics],
  );
  const endStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointer.current !== e.pointerId) return;
    if (e.type === "pointercancel" || e.type === "lostpointercapture")
      haptics.stop();
    dragPointer.current = null;
    dragDirections.current = [];
    setStickPosition({ x: 0, y: 0 });
    updateActions();
  };
  const moveStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointer.current !== e.pointerId) return;
    // Pending capture can be cancelled before a lostpointercapture event exists.
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
      haptics.stop();
      endStick(e);
      return;
    }
    const session = current.current;
    const own = session?.players.find((p) => p.id === ownPlayerId.current);
    if (
      !session ||
      session.profile !== "brawlhalla" ||
      session.phase !== "native" ||
      session.native.gameId !== "brawlhalla" ||
      !own?.connected ||
      !nativeSlotAllowed(session.native, session.displayMode, own.slot) ||
      !session.native.focused ||
      session.native.status !== "running" ||
      session.native.quitting ||
      !enteredRef.current ||
      document.hidden ||
      !document.hasFocus() ||
      socket.current?.readyState !== WebSocket.OPEN
    )
      return;
    const point = readDirectionPad(
      e.clientX,
      e.clientY,
      e.currentTarget.getBoundingClientRect(),
    );
    setStickPosition({ x: point.x, y: point.y });
    if (point.directions.join() === dragDirections.current.join()) return;
    dragDirections.current = point.directions;
    updateActions();
  };
  const startStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (
      e.currentTarget.getAttribute("aria-disabled") === "true" ||
      dragPointer.current !== null ||
      (e.pointerType === "mouse" && e.button !== 0)
    )
      return;
    e.preventDefault();
    dragPointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveStick(e);
  };
  useEffect(() => {
    if (token || ticket) return;
    let active = true;
    const abort = new AbortController();
    const metadata = () =>
      fetch("/api/public", { cache: "no-store", signal: abort.signal })
        .then((r) => r.json())
        .then((data) => {
          if (active) setLocked(!!data.pairingLocked);
        })
        .catch(() => {});
    void metadata();
    const timer = setInterval(metadata, 2000);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
    };
  }, [token, ticket]);
  useEffect(() => {
    if (!ticket) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const poll = async () => {
      if (ticket.expiresAt <= Date.now()) {
        save(PAIR_TICKET, "");
        setTicket(null);
        setNonce("");
        setError("This request expired. Scan the current QR code on your PC.");
        return;
      }
      try {
        const response = await fetch(
          `/api/pair/${encodeURIComponent(ticket.id)}`,
          {
            headers: { Authorization: `Bearer ${ticket.secret}` },
            cache: "no-store",
            signal: abort.signal,
          },
        );
        const data = await response.json();
        if (stopped) return;
        if (!response.ok) {
          if ([403, 404, 410].includes(response.status)) {
            save(PAIR_TICKET, "");
            setTicket(null);
            setNonce("");
            setError(
              data.error ||
                "Pairing request expired. Scan the current QR code.",
            );
            return;
          }
          throw new Error(data.error || "Unable to reach the console.");
        }
        const result = data as PairStatus;
        if (result.status === "approved") {
          save(SESSION_TOKEN, result.token);
          save(PAIR_TICKET, "");
          setToken(result.token);
          setPlayerId(result.playerId);
          setTicket(null);
          setError("");
          return;
        }
        if (result.status === "rejected") {
          save(PAIR_TICKET, "");
          setTicket(null);
          setError(result.message || "Your request was declined on the PC.");
          return;
        }
      } catch (e) {
        if (stopped) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setError(
          e instanceof Error ? e.message : "Unable to contact the console.",
        );
      }
      if (!stopped) timer = setTimeout(poll, 1200);
    };
    void poll();
    return () => {
      stopped = true;
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [ticket]);
  useEffect(() => {
    if (!token) return;
    let disposed = false,
      retryTimer: ReturnType<typeof setTimeout> | undefined,
      heartbeat: ReturnType<typeof setInterval> | undefined,
      ping: ReturnType<typeof setInterval> | undefined;
    let attempts = 0,
      disconnectedAt = 0,
      fatal = false;
    const clearTimers = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (ping) clearInterval(ping);
      heartbeat = undefined;
      ping = undefined;
    };
    const end = (message: string) => {
      fatal = true;
      clearTimers();
      neutral();
      current.current = null;
      setState(null);
      setConnection("ended");
      setError(message);
      save(SESSION_TOKEN, "");
      socket.current?.close(1000);
    };
    const connect = () => {
      if (disposed || fatal) return;
      setConnection(disconnectedAt ? "reconnecting" : "connecting");
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      socket.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        send({ type: "auth", version: PROTOCOL_VERSION, token });
      };
      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (disposed) return;
        if (message.type === "authenticated") {
          attempts = 0;
          disconnectedAt = 0;
          current.current = message.state;
          ownPlayerId.current = message.playerId;
          setState(message.state);
          setPlayerId(message.playerId);
          setConnection("connected");
          setError("");
          neutral();
          clearTimers();
          heartbeat = setInterval(sendInput, 100);
          ping = setInterval(
            () =>
              send({
                type: "ping",
                id: Math.floor(performance.now()),
                at: performance.now(),
              }),
            1500,
          );
          send({
            type: "ping",
            id: Math.floor(performance.now()),
            at: performance.now(),
          });
        } else if (message.type === "state") {
          const changed =
            current.current?.epoch !== message.state.epoch ||
            current.current?.profile !== message.state.profile ||
            current.current?.native.controls !==
              message.state.native.controls ||
            current.current?.native.focused !== message.state.native.focused ||
            current.current?.native.status !== message.state.native.status ||
            current.current?.native.quitting !==
              message.state.native.quitting ||
            current.current?.native.gameId !== message.state.native.gameId ||
            current.current?.displayMode !== message.state.displayMode ||
            current.current?.native.gamepad?.available !==
              message.state.native.gamepad?.available;
          current.current = message.state;
          if (changed) neutral();
          setState(message.state);
        } else if (message.type === "haptics") {
          if (message.epoch !== current.current?.epoch) return;
          if (message.durationMs === 0) {
            haptics.stop();
          } else if (
            enteredRef.current &&
            !feedbackSettingsRef.current &&
            !document.hidden &&
            document.hasFocus() &&
            (studioHapticsAllowed(current.current, ownPlayerId.current) || racingHapticsAllowed(current.current, ownPlayerId.current) ||
              brawlhallaHapticsAllowed(current.current, ownPlayerId.current))
          ) {
            haptics.rumble(message.durationMs);
          }
        } else if (message.type === "pong") {
          setRtt(Math.max(0, Math.round(performance.now() - message.at)));
        } else if (message.type === "error") {
          setError(message.message);
        } else if (message.type === "ended") {
          end(message.message);
        }
      };
      ws.onerror = () => {};
      ws.onclose = (e) => {
        clearTimers();
        neutral();
        if (disposed || fatal) return;
        if (e.code === 1008 || e.code === 1009) {
          end(
            e.reason || "Your session expired. Scan the QR to connect again.",
          );
          return;
        }
        if (!disconnectedAt) disconnectedAt = Date.now();
        if (Date.now() - disconnectedAt >= 30000) {
          end(
            "The console could not reconnect within 30 seconds. Scan the QR to join again.",
          );
          return;
        }
        setConnection("reconnecting");
        setError("Connection interrupted. Reconnecting to your console…");
        const wait = Math.min(3000, 400 * 2 ** attempts++);
        retryTimer = setTimeout(connect, wait);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimers();
      if (retryTimer) clearTimeout(retryTimer);
      neutral();
      socket.current?.close(1000);
      socket.current = null;
    };
  }, [token, send, sendInput, neutral, haptics]);
  useEffect(() => {
    const reset = () => neutral();
    const visibility = () => {
      if (document.hidden) neutral();
    };
    window.addEventListener("blur", reset);
    window.addEventListener("pagehide", reset);
    window.addEventListener("orientationchange", reset);
    document.addEventListener("visibilitychange", visibility);
    const fs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("blur", reset);
      window.removeEventListener("pagehide", reset);
      window.removeEventListener("orientationchange", reset);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, [neutral]);
  const wantLandscape = !!state && (
    state.phase === 'native' || !!state.studio || state.profile !== 'menu'
  );
  useEffect(()=>{
    const orientation=screen.orientation as ScreenOrientation & {lock?:(value:string)=>Promise<void>};let active=true;
    if(!entered || !wantLandscape){orientation?.unlock?.();setFullscreenHint('');return;}
    if(!fullscreen){setFullscreenHint('Tap fullscreen to rotate automatically, or turn your phone sideways.');return;}
    neutral();
    if(!orientation?.lock){setFullscreenHint('Turn your phone sideways. This browser cannot lock orientation.');return;}
    void orientation.lock('landscape').then(()=>{if(active)setFullscreenHint('');}).catch(()=>{if(active)setFullscreenHint('Turn your phone sideways. Your browser could not lock orientation.');});
    return()=>{active=false;orientation?.unlock?.();};
  },[entered,fullscreen,wantLandscape,neutral]);
  useEffect(() => {
    if (editing) setTimeout(() => nameRef.current?.focus(), 0);
  }, [editing]);
  const pair = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Player",
          ...(nonce ? { nonce } : { code: code.replace(/\s/g, "") }),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to request a connection.");
      save("waterconsole.name", name.trim() || "Player");
      save(PAIR_TICKET, JSON.stringify(data));
      setTicket(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The console is unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const enter = () => {
    haptics.activate();
    setFullscreenHint("");
    const request = document.documentElement.requestFullscreen?.();
    request?.catch(() =>
      setFullscreenHint(
        "Fullscreen is unavailable here. Your controller still works.",
      ),
    );
    if (!document.documentElement.requestFullscreen)
      setFullscreenHint(
        "Your browser keeps its controls visible. Your controller still works.",
      );
    enteredRef.current = true;
    setEntered(true);
    neutral();
  };
  const newPair = () => {
    socket.current?.close(1000);
    save(SESSION_TOKEN, "");
    save(PAIR_TICKET, "");
    setToken("");
    setTicket(null);
    setState(null);
    current.current = null;
    setConnection("idle");
    setEntered(false);
    enteredRef.current = false;
    setNonce("");
    setError("");
  };
  const player = state?.players.find((p) => p.id === playerId);
  const brawlhalla = state?.profile === "brawlhalla";
  const arenaProfile = brawlhalla || state?.profile === "idol";
  const speedstorm = state?.profile === "speedstorm";
  const racingProfile = speedstorm || state?.profile === "racing";
  const racingTitle = speedstorm ? "DISNEY SPEEDSTORM" : "HOT WHEELS UNLEASHED";
  const racingPlayerLimit =
    state?.displayMode === "shared"
      ? 1
      : state?.displayMode === "split-2"
        ? 2
        : 4;
  const racingLayoutModes = speedstorm
    ? (["shared", "split-2", "split-4"] as const)
    : (["shared", "split-2"] as const);
  const racingSplit = state?.displayMode === "split-2";
  const racingGamepadReady = !!state?.native.gamepad?.available;
  const nav = (action: ToolbarAction, searchQuery?: string) => {
    neutral();
    send({
      type: "nav",
      action,
      ...(searchQuery !== undefined ? { query: searchQuery } : {}),
    });
  };
  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    send({ type: "rename", name: n });
    save("waterconsole.name", n);
    setEditing(false);
  };
  const touchButton = (
    action: Action,
    label: string,
    className = "",
    children?: React.ReactNode,
  ) => (
    <button
      type="button"
      data-layout-id={action+"-"+label}
      className={`touch-button ${className} ${held.includes(action) ? "held" : ""}`}
      disabled={
        connection !== "connected" ||
        (state?.profile === "menu" && !player?.canNavigate) ||
        ((arenaProfile || racingProfile) &&
          (!player ||
            !nativeSlotAllowed(state.native, state.displayMode, player.slot) ||
            !state.native.focused ||
            state.native.status !== "running" ||
            state.native.quitting))
      }
      aria-label={label}
      onPointerDown={(e) => {if(!personal.editingRef.current)press(e, action);}}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {children || label}
    </button>
  );
  const stickDisabled =
    state?.phase !== "native" ||
    state?.native.gameId !== "brawlhalla" ||
    connection !== "connected" ||
    !player ||
    !state ||
    !nativeSlotAllowed(state.native, state.displayMode, player.slot) ||
    !state.native.focused ||
    state.native.status !== "running" ||
    !!state.native.quitting;
  const dpad = brawlhalla ? (
    <div
      className="brawl-stick"
      role="group"
      aria-label="Directional pad"
      aria-disabled={stickDisabled}
      onPointerDown={startStick}
      onPointerMove={moveStick}
      onPointerUp={endStick}
      onPointerCancel={endStick}
      onLostPointerCapture={endStick}
      style={
        {
          "--stick-x": `${stickPosition.x * 34}px`,
          "--stick-y": `${stickPosition.y * 34}px`,
        } as CSSProperties
      }
    >
      {(["up", "right", "down", "left"] as const).map((direction, index) => (
        <button
          key={direction}
          type="button"
          aria-label={direction[0].toUpperCase() + direction.slice(1)}
          aria-pressed={held.includes(direction)}
          disabled={stickDisabled}
          data-layout-id={direction}
      className={`touch-button brawl-stick-direction stick-${direction} ${held.includes(direction) ? "held" : ""}`}
          onKeyDown={(e) => {
            if (!["Enter", " "].includes(e.key)) return;
            e.preventDefault();
            pointers.current.set(-100 - index, direction);
            updateActions();
          }}
          onKeyUp={(e) => {
            if (!["Enter", " "].includes(e.key)) return;
            e.preventDefault();
            pointers.current.delete(-100 - index);
            updateActions();
          }}
        >
          <span aria-hidden="true">{["▲", "▶", "▼", "◀"][index]}</span>
        </button>
      ))}
      <div className="brawl-stick-thumb" aria-hidden="true">
        <Mark size={25} />
      </div>
    </div>
  ) : (
    <div className="dpad" role="group" aria-label="Directional pad">
      {touchButton("up", "Up", "direction up", <span>▲</span>)}
      {touchButton("right", "Right", "direction right", <span>▶</span>)}
      {touchButton("down", "Down", "direction down", <span>▼</span>)}
      {touchButton("left", "Left", "direction left", <span>◀</span>)}
      {state?.profile === "menu" ? (
        touchButton(
          "confirm",
          "Confirm",
          "confirm",
          <Icon name="check" size={36} />,
        )
      ) : (
        <div className="dpad-center">
          <Mark size={32} />
        </div>
      )}
    </div>
  );
  if (!token || !state || !player) {
    return (
      <main className="phone-onboarding">
        <div className="phone-brand">
          <Brand />
        </div>
        <section className="phone-pair-card">
          {connection === "ended" ? (
            <>
              <div className="pair-illustration">
                <Icon name="wifi" size={48} />
              </div>
              <span className="eyebrow">UNTIL NEXT TIME</span>
              <h1>Session ended.</h1>
              <p>{error}</p>
              <button className="button primary full-width" onClick={newPair}>
                Connect again
                <Icon name="arrow" />
              </button>
            </>
          ) : token ? (
            <>
              <div className="pair-illustration">
                <Mark size={52} />
              </div>
              <span className="eyebrow">YOUR LOCAL CONSOLE</span>
              <h1>
                {connection === "reconnecting"
                  ? "Finding your room…"
                  : "Connecting you…"}
              </h1>
              <p>{error || "Connecting to your approved player slot."}</p>
              <button className="button ghost" onClick={newPair}>
                Use a new pairing code
              </button>
            </>
          ) : ticket ? (
            <>
              <div className="pair-illustration">
                <Icon name="monitor" size={48} />
              </div>
              <span className="eyebrow">ONE LAST CHECK</span>
              <h1>Look at the big screen.</h1>
              <p>
                Approve <strong>{name || "your phone"}</strong> on the PC.
                <br />
                Make sure this code matches.
              </p>
              <div className="verification-code">{ticket.verificationCode}</div>
              <span className="waiting-label">
                <span className="status-dot" />
                Waiting for approval on the PC
              </span>
              {error && (
                <p className="phone-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button ghost"
                onClick={() => {
                  save(PAIR_TICKET, "");
                  setTicket(null);
                }}
              >
                Cancel request
              </button>
            </>
          ) : (
            <>
              <div className="pair-illustration">
                <Icon name="phone" size={48} />
                <span>+</span>
                <Icon name="monitor" size={48} />
              </div>
              <span className="eyebrow">YOUR PHONE. YOUR CONTROLLER.</span>
              <h1>
                Let's get you
                <br />
                in the room.
              </h1>
              <p>
                {nonce
                  ? "Your console is ready. Pick a name, then check the PC to approve your phone."
                  : "On the same Wi-Fi as your PC? Enter the code shown in Voyager."}
              </p>
              <form onSubmit={pair}>
                <label className="field-label">
                  Your name
                  <input
                    autoComplete="nickname"
                    value={name}
                    maxLength={24}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Player name"
                    required
                  />
                </label>
                {!nonce && (
                  <label className="field-label">
                    Pairing code
                    <input
                      inputMode="numeric"
                      autoComplete="off"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      maxLength={12}
                      placeholder="Code from the PC"
                      required
                    />
                  </label>
                )}
                {error && (
                  <p className="phone-error" role="alert">
                    {error}
                  </p>
                )}
                {locked && (
                  <p className="phone-error">
                    Pairing is locked. Ask the host to unlock it.
                  </p>
                )}
                <button className="button primary full-width" disabled={busy}>
                  {busy ? "Sending request…" : "Connect to console"}
                  <Icon name="arrow" size={19} />
                </button>
              </form>
              <small className="pair-privacy">
                <Icon name="lock" size={14} />
                Local connection. Approval required.
              </small>
            </>
          )}
        </section>
        <footer className="phone-footer">GOOD TIMES STAY IN THE ROOM.</footer>
      </main>
    );
  }
  if (!entered)
    return (
      <main className="phone-onboarding">
        <div className="phone-brand">
          <Brand />
        </div>
        <section className="phone-pair-card welcome">
          <Avatar name={player.name} color={player.color} />
          <span className="eyebrow">YOU'RE PLAYER {player.slot}</span>
          <h1>
            You're in,
            <br />
            {player.name}.
          </h1>
          <p>
            Your phone is now connected.
            <br />
            Let's give those thumbs some room.
          </p>
          <button
            className="button primary full-width"
            onClick={enter}
            disabled={connection !== "connected"}
          >
            <Icon name="expand" />
            Enter controller
          </button>
          <small>
            Tap to enter fullscreen. You can leave fullscreen without
            disconnecting.
          </small>
          {error && <p className="phone-error">{error}</p>}
        </section>
        <footer className="phone-footer">
          {state.players.length} OF 4 PLAYERS CONNECTED
        </footer>
      </main>
    );
  if(state.studio)return <StudioPhone state={state} player={player} token={token} connection={connection} send={send} nextSequence={()=>seq.current++} haptics={haptics} error={error} rtt={rtt} fullscreenHint={fullscreenHint} onFullscreen={()=>{neutral();if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void enter();}}/>;
  return (
    <main
      ref={layoutRoot}
      className={`phone-controller ${arenaProfile || racingProfile ? `profile-lab profile-idol${brawlhalla ? ` profile-brawlhalla brawl-mode-${state.native.controls}` : ""}${racingProfile ? " profile-racing" : ""}${speedstorm ? ` profile-speedstorm control-style-${speedstormControlStyle}` : ""}` : `profile-${state.profile}`}`}
      style={{ "--player": player.color } as CSSProperties}
    >
      <header className="controller-top">
        <Brand compact />
        <span
          className={`controller-connection ${connection === "connected" ? "" : "interrupted"}`}
        >
          <span className="status-dot" />
          {connection === "connected"
            ? `P${player.slot} · ${rtt === null ? "Connected" : `${rtt} ms`}`
            : "Reconnecting…"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <IconButton
            name="settings"
            label="Controller settings"
            onClick={() => {
              neutral();
              feedbackSettingsRef.current = true;
              setFeedbackSettings(true);
            }}
          />
          <IconButton
            name="expand"
            label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => {
              neutral();
              if (document.fullscreenElement)
                document.exitFullscreen().catch(() => {});
              else enter();
            }}
          />
        </div>
      </header>
      {state.profile === "menu" ? (
        <>
          <section className="controller-identity">
            <Avatar name={player.name} color={player.color} />
            <button
              className="player-edit"
              onClick={() => {
                neutral();
                setName(player.name);
                setEditing(true);
              }}
            >
              <span className="edit-circle">
                <Icon name="edit" size={18} />
              </span>
              <h1>{player.name}</h1>
            </button>
            <span className="navigator-status">
              {player.canNavigate
                ? "You control the big screen"
                : "Your host can give you navigation"}
            </span>
          </section>
          <nav className="controller-toolbar" aria-label="Console navigation">
            {(
              [
                { icon: "search", action: "search", label: "Search games" },
                {
                  icon: "download",
                  action: "recent",
                  label: "Recently played",
                },
                { icon: "grid", action: "library", label: "Library" },
                { icon: "heart", action: "favorites", label: "Favorites" },
                {
                  icon: state.muted ? "muted" : "volume",
                  action: "mute",
                  label: state.muted ? "Unmute" : "Mute",
                },
              ] as const
            ).map((item) => (
              <IconButton
                key={item.action}
                name={item.icon}
                label={item.label}
                disabled={
                  !player.canNavigate ||
                  connection !== "connected" ||
                  state.native.quitting
                }
                onClick={() => {
                  neutral();
                  if (item.action === "search") {
                    setQuery(state.search);
                    setSearching(true);
                  } else nav(item.action);
                }}
              />
            ))}
          </nav>
          <section className="menu-controls">
            {dpad}
            <div className="menu-bottom">
              {touchButton(
                "back",
                "Back",
                "back-control",
                <>
                  <Icon name="back" />
                  Back
                </>,
              )}
              <button
                className={`ready-control ${player.ready ? "is-ready" : ""}`}
                onClick={() => send({ type: "ready", ready: !player.ready })}
              >
                <Icon name="check" size={18} />
                {player.ready ? "Ready" : "I’m ready"}
              </button>
            </div>
            {!player.canNavigate && (
              <p className="navigator-note">
                Ready when you are. The navigator controls the menu.
              </p>
            )}
          </section>
        </>
      ) : racingProfile ? (
        <>
          <div className="lab-controller-title">
            <div>
              <span className="eyebrow">{racingTitle}</span>
              <strong>
                <span style={{ background: player.color }} />P{player.slot} ·{" "}
                {player.name}
              </strong>
            </div>
            <button
              className="return-console"
              disabled={
                !player.canNavigate ||
                connection !== "connected" ||
                state.native.quitting
              }
              onClick={() => nav("library")}
            >
              <Icon name="back" size={17} />
              {state.native.quitting ? "Closing game…" : "Stop & return Home"}
            </button>
          </div>
          <div className="native-phone-toolbar native-racing-toolbar">
            <div className="native-phone-session-switches">
              <div
                className="native-phone-modes"
                role="group"
                aria-label={
                  speedstorm
                    ? "Disney Speedstorm controller mode"
                    : "HOT WHEELS controller mode"
                }
              >
                {(["menu", "race"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={state.native.controls === mode ? "active" : ""}
                    aria-pressed={state.native.controls === mode}
                    disabled={
                      !player.canNavigate ||
                      connection !== "connected" ||
                      state.native.quitting
                    }
                    onClick={() => {
                      neutral();
                      send({ type: "native-controls", mode });
                    }}
                  >
                    {mode === "menu" ? "Menus" : "Race"}
                  </button>
                ))}
              </div>
              <div
                className="native-phone-modes native-phone-layouts"
                role="group"
                aria-label={
                  speedstorm
                    ? "Disney Speedstorm local players"
                    : "HOT WHEELS local players"
                }
              >
                {racingLayoutModes.map((mode) => (
                  <button
                    key={mode}
                    className={state.displayMode === mode ? "active" : ""}
                    aria-pressed={state.displayMode === mode}
                    aria-label={
                      speedstorm
                        ? mode === "shared"
                          ? "One phone: Local Race"
                          : mode === "split-2"
                            ? "Two phones: Local Race"
                            : "Four phones: Local Race"
                        : mode === "shared"
                          ? "Solo: one phone"
                          : "Two phones: Split Screen"
                    }
                    disabled={
                      !player.canNavigate ||
                      connection !== "connected" ||
                      state.native.status === "starting" ||
                      state.native.quitting ||
                      ((speedstorm || mode === "split-2") &&
                        !racingGamepadReady)
                    }
                    onClick={() => {
                      neutral();
                      send({ type: "native-layout", mode });
                    }}
                  >
                    {speedstorm
                      ? mode === "shared"
                        ? "1P"
                        : mode === "split-2"
                          ? "2P"
                          : "4P"
                      : mode === "shared"
                        ? "Solo"
                        : "2P"}
                  </button>
                ))}
              </div>
            </div>
            <span
              className={
                state.native.focused && state.native.status === "running"
                  ? "native-phone-live"
                  : "native-phone-paused"
              }
            >
              <span className="status-dot" />
              {state.native.quitting
                ? "Closing game…"
                : state.native.status === "starting"
                  ? "Launching…"
                  : state.native.focused && state.native.status === "running"
                    ? "Game in focus"
                    : "Input paused · focus game on PC"}
            </span>
          </div>
          {!speedstorm && player.slot > 2 ? (
            <section className="native-spectator">
              <Icon name="people" size={45} />
              <h2>You're in the audience.</h2>
              <p>
                HOT WHEELS supports two drivers in Split Screen. P1 and P2
                drive; your phone stays connected for the console.
              </p>
            </section>
          ) : (speedstorm || player.slot === 2) && !racingGamepadReady ? (
            <section
              className="native-spectator native-setup-needed"
              role="status"
            >
              <Icon name="monitor" size={45} />
              <h2>
                {speedstorm
                  ? "Controller setup needed on PC."
                  : "Player 2 needs PC setup."}
              </h2>
              <p>
                {state.native.gamepad?.message ||
                  (speedstorm
                    ? "Set up controller support on the Voyager PC to play Local Race."
                    : "Set up the second controller on the Voyager PC to play Split Screen.")}
              </p>
              <p>
                {speedstorm
                  ? "Your phone stays connected while controller support is set up."
                  : "Your phone will become the second racing controller when setup is ready."}
              </p>
            </section>
          ) : speedstorm && player.slot > racingPlayerLimit ? (
            <section className="native-spectator" role="status">
              <Icon name="people" size={45} />
              <h2>Ready for Local Race.</h2>
              <p>
                Ask the navigator to enable more player slots, then choose
                Friendly Race → Local Freeplay in the game.
              </p>
            </section>
          ) : !speedstorm && player.slot === 2 && !racingSplit ? (
            <section className="native-spectator" role="status">
              <Icon name="people" size={45} />
              <h2>Ready for a second driver.</h2>
              <p>
                Ask the navigator to enable 2P, then choose Quick Modes → Split
                Screen inside the game. Press Confirm on your phone to join.
              </p>
            </section>
          ) : (
            <>
              <p className="rotate-hint">
                <Icon name="rotate" size={18} />
                Turn your phone sideways for more room.
              </p>
              {state.native.controls === "menu" ? (
                <section className="race-menu-controls">
                  {dpad}
                  <div className="race-menu-actions">
                    {touchButton(
                      "confirm",
                      "Confirm",
                      "race-confirm",
                      speedstorm ? <>Confirm / Ready</> : undefined,
                    )}
                    {touchButton("back", "Back", "utility-control")}
                    <div className="race-tab-buttons">
                      {touchButton("l", "Previous tab", "utility-control")}
                      {touchButton("r", "Next tab", "utility-control")}
                    </div>
                    <div className="race-tab-buttons">
                      {touchButton(
                        "start",
                        speedstorm ? "Start" : "Ready",
                        "utility-control",
                      )}
                      {touchButton("x", "X action", "utility-control")}
                    </div>
                  </div>
                </section>
              ) : speedstorm ? (
                <section
                  className="speedstorm-race-controls"
                  aria-label="Speedstorm racing controls"
                >
                  <div className="speedstorm-driving">
                    <div className="speedstorm-techniques">
                      {speedstormControlStyle === "classic" &&
                        touchButton(
                          "lt",
                          "Drift",
                          "speedstorm-drift",
                          <>
                            <strong>DRIFT</strong>
                            <small>HOLD</small>
                          </>,
                        )}
                      {touchButton(
                        "y",
                        "Hop / stunt",
                        "speedstorm-hop",
                        <>
                          <strong>HOP</strong>
                          <small>STUNT</small>
                        </>,
                      )}
                    </div>
                    <div
                      className="speedstorm-steering"
                      role="group"
                      aria-label="Steering"
                    >
                      {touchButton(
                        "left",
                        "Steer left",
                        "race-steer",
                        <>
                          <span>◀</span>
                          <small>LEFT</small>
                        </>,
                      )}
                      {touchButton(
                        "right",
                        "Steer right",
                        "race-steer",
                        <>
                          <span>▶</span>
                          <small>RIGHT</small>
                        </>,
                      )}
                    </div>
                    <div
                      className="speedstorm-dashes"
                      role="group"
                      aria-label="Side dash"
                    >
                      {touchButton(
                        "l",
                        "Dash left",
                        "speedstorm-dash",
                        <>
                          <span>◀</span> DASH
                        </>,
                      )}
                      {touchButton(
                        "r",
                        "Dash right",
                        "speedstorm-dash",
                        <>
                          DASH <span>▶</span>
                        </>,
                      )}
                    </div>
                  </div>
                  <div className="speedstorm-abilities">
                    <div
                      className="speedstorm-skills"
                      role="group"
                      aria-label="Skill: tap or hold to charge"
                    >
                      {touchButton(
                        "up",
                        "Skill",
                        "speedstorm-skill",
                        <>
                          <strong>SKILL</strong>
                          <small>TAP TO USE</small>
                        </>,
                      )}
                      {touchButton(
                        "down",
                        "Charge skill",
                        "speedstorm-skill",
                        <>
                          <strong>CHARGE</strong>
                          <small>HOLD SKILL</small>
                        </>,
                      )}
                    </div>
                    <div className="speedstorm-tools">
                      {touchButton(
                        "select",
                        "Superkart skill",
                        "speedstorm-superkart",
                        <>
                          <strong>SUPERKART</strong>
                          <small>SKILL</small>
                        </>,
                      )}
                      {touchButton(
                        "rt",
                        "Look back",
                        "speedstorm-rearview",
                        <>
                          <strong>LOOK BACK</strong>
                          <small>HOLD</small>
                        </>,
                      )}
                    </div>
                    {touchButton("start", "Pause", "speedstorm-pause")}
                  </div>
                  <div className="speedstorm-pedals">
                    {touchButton(
                      "x",
                      "Boost",
                      "race-boost",
                      <>
                        <Icon name="play" size={19} />
                        <span>BOOST</span>
                      </>,
                    )}
                    {speedstormControlStyle === "assist" &&
                      touchButton(
                        "lt",
                        "Drift",
                        "speedstorm-drift",
                        <>
                          <strong>DRIFT</strong>
                          <small>GAS + DRIFT · HOLD</small>
                        </>,
                      )}
                    {touchButton(
                      "b",
                      "Brake",
                      "race-brake",
                      <span>BRAKE</span>,
                    )}
                    {touchButton(
                      "a",
                      "Throttle",
                      "race-throttle",
                      <>
                        <span>THROTTLE</span>
                        <small>HOLD TO DRIVE</small>
                      </>,
                    )}
                  </div>
                </section>
              ) : (
                <section className="race-controls" aria-label="Racing controls">
                  <div
                    className="race-steering"
                    role="group"
                    aria-label="Steering"
                  >
                    {touchButton(
                      "left",
                      "Steer left",
                      "race-steer",
                      <>
                        <span>◀</span>
                        <small>LEFT</small>
                      </>,
                    )}
                    {touchButton(
                      "right",
                      "Steer right",
                      "race-steer",
                      <>
                        <span>▶</span>
                        <small>RIGHT</small>
                      </>,
                    )}
                  </div>
                  <div className="race-utility">
                    {touchButton("start", "Pause", "utility-control")}
                    {touchButton("y", "Reset car", "utility-control")}
                    {touchButton("select", "Look back", "utility-control")}
                    <div className="race-air-controls">
                      {touchButton("up", "Pitch forward", "utility-control")}
                      {touchButton("down", "Pitch back", "utility-control")}
                    </div>
                    <div className="race-air-controls">
                      {touchButton("l", "Roll left", "utility-control")}
                      {touchButton("r", "Roll right", "utility-control")}
                    </div>
                  </div>
                  <div className="race-pedals">
                    {touchButton(
                      "x",
                      "Boost",
                      "race-boost",
                      <>
                        <Icon name="play" size={20} />
                        <span>BOOST</span>
                      </>,
                    )}
                    {touchButton(
                      "b",
                      "Brake",
                      "race-brake",
                      <>
                        <span>BRAKE</span>
                        <small>HOLD TO REVERSE</small>
                      </>,
                    )}
                    {touchButton(
                      "a",
                      "Throttle",
                      "race-throttle",
                      <>
                        <span>THROTTLE</span>
                        <small>HOLD TO DRIVE</small>
                      </>,
                    )}
                  </div>
                </section>
              )}
            </>
          )}
          <footer className="lab-controller-footer native-phone-footer">
            <span>
              {speedstorm
                ? !racingGamepadReady
                  ? "Complete controller setup on the PC"
                  : player.slot > racingPlayerLimit
                    ? "Waiting for the navigator to enable more player slots"
                    : state.native.controls === "menu"
                      ? "Online: select Gamepad in game settings · Local: Friendly Race → Local Freeplay"
                      : speedstormControlStyle === "assist"
                        ? "Two thumbs: steer + hold Drift for gas · Brake overrides gas"
                        : "Hold throttle + steer · Tap skills or hold to charge · Pause opens the menu"
                : player.slot > 2
                  ? "Two drivers maximum · P3/P4 are spectators"
                  : player.slot === 2 && !racingGamepadReady
                    ? "Complete controller setup on the PC"
                    : player.slot === 2 && !racingSplit
                      ? "Waiting for the navigator to enable 2P"
                      : state.native.controls === "menu"
                        ? racingSplit
                          ? "Split Screen: P2 Confirm joins · Both drivers Ready · Race on the grid"
                          : "D-pad navigates · Confirm selects · Race on the grid"
                        : "Hold throttle + steer together · Pause opens the game menu"}
            </span>
            <span>
              {speedstorm ? "Offline · Online" : "Online · Epic Games"}
            </span>
          </footer>
        </>
      ) : brawlhalla ? (
        <>
          <div className="lab-controller-title">
            <div>
              <span className="eyebrow">BRAWLHALLA</span>
              <strong>
                <span style={{ background: player.color }} />P{player.slot} ·{" "}
                {player.name}
              </strong>
            </div>
            <button
              className="return-console"
              disabled={
                !player.canNavigate ||
                connection !== "connected" ||
                state.native.quitting
              }
              onClick={() => nav("library")}
            >
              <Icon name="back" size={17} />
              {state.native.quitting ? "Closing game…" : "Stop & return Home"}
            </button>
          </div>
          <div className="native-phone-toolbar">
            <div
              className="native-phone-modes"
              role="group"
              aria-label="Brawlhalla controller mode"
            >
              {(["menu", "fight"] as const).map((mode) => (
                <button
                  key={mode}
                  className={state.native.controls === mode ? "active" : ""}
                  aria-pressed={state.native.controls === mode}
                  disabled={
                    !player.canNavigate ||
                    connection !== "connected" ||
                    state.native.quitting
                  }
                  onClick={() => {
                    neutral();
                    send({ type: "native-controls", mode });
                  }}
                >
                  {mode === "menu" ? "Menus" : "Fight"}
                </button>
              ))}
            </div>
            {state.native.controls === "fight" &&
              state.native.gamepad?.available && (
                <div className="brawl-utilities">
                  {touchButton("select", "Taunt", "brawl-utility")}
                  {touchButton("start", "Pause", "brawl-utility")}
                </div>
              )}
            <span
              className={
                state.native.focused && state.native.status === "running"
                  ? "native-phone-live"
                  : "native-phone-paused"
              }
            >
              <span className="status-dot" />
              {state.native.quitting
                ? "Closing game…"
                : state.native.status === "starting"
                  ? "Launching…"
                  : state.native.focused && state.native.status === "running"
                    ? "Game in focus"
                    : "Input paused · focus game on PC"}
            </span>
          </div>
          {!state.native.gamepad?.available ? (
            <section className="native-spectator" role="status">
              <Icon name="monitor" size={45} />
              <h2>Controller setup needed on PC.</h2>
              <p>
                {state.native.gamepad?.message ||
                  "Brawlhalla needs four separate Xbox controllers on this PC. Complete controller setup before playing."}
              </p>
            </section>
          ) : (
            <>
              <p className="rotate-hint">
                <Icon name="rotate" size={18} />
                Turn your phone sideways for more room.
              </p>
              {state.native.controls === "fight" ? (
                <section
                  className="brawl-combat-layout"
                  aria-label="Brawlhalla controls"
                >
                  {dpad}
                  <div
                    className="brawl-actions brawl-combat-actions"
                    role="group"
                    aria-label="Brawlhalla fighting actions"
                  >
                    {touchButton(
                      "rt",
                      "Dash / Dodge",
                      "brawl-action brawl-dodge",
                      <strong>DODGE / DASH</strong>,
                    )}
                    {touchButton(
                      "y",
                      "Throw weapon",
                      "brawl-action brawl-throw",
                      <strong>THROW</strong>,
                    )}
                    {touchButton(
                      "x",
                      "Light / Pick up",
                      "brawl-action brawl-light",
                      <>
                        <strong>LIGHT</strong>
                        <small>ATTACK / PICK UP</small>
                      </>,
                    )}
                    {touchButton(
                      "b",
                      "Heavy attack",
                      "brawl-action brawl-heavy",
                      <>
                        <strong>HEAVY</strong>
                        <small>HOLD TO CHARGE</small>
                      </>,
                    )}
                    {touchButton(
                      "a",
                      "Jump",
                      "brawl-action brawl-jump",
                      <>
                        <strong>JUMP</strong>
                        <small>JUMP / AIR JUMP</small>
                      </>,
                    )}
                  </div>
                </section>
              ) : (
                <>
                  <div className="native-shoulders brawl-shoulders">
                    <div>{touchButton("l", "Previous tab", "shoulder")}</div>
                    <div>{touchButton("r", "Next tab", "shoulder")}</div>
                  </div>
                  <section
                    className="lab-controls native-fight-controls brawl-fight-controls"
                    aria-label="Brawlhalla controls"
                  >
                    {dpad}
                    <div className="lab-middle native-utility">
                      {touchButton("start", "Start", "utility-control")}
                    </div>
                    <div
                      className="brawl-actions"
                      role="group"
                      aria-label="Brawlhalla menu actions"
                    >
                      {touchButton(
                        "confirm",
                        "Confirm / Join / Ready",
                        "brawl-action brawl-jump",
                        <>
                          <strong>CONFIRM</strong>
                          <small>JOIN / READY</small>
                        </>,
                      )}
                      {touchButton("back", "Back", "brawl-action brawl-heavy")}
                      {touchButton(
                        "x",
                        "Manage party",
                        "brawl-action brawl-light",
                      )}
                      {touchButton(
                        "y",
                        "Match settings",
                        "brawl-action brawl-throw",
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="lab-controller-footer native-phone-footer">
            <span>
              {!state.native.gamepad?.available
                ? "Complete controller setup on the PC"
                : state.native.controls === "menu"
                  ? "Offline Play → Couch Party · Each phone joins with Confirm"
                  : "Slide to move · Hold Heavy to charge · Dodge + direction to dash"}
            </span>
            <span>Offline · Online</span>
          </footer>
        </>
      ) : state.profile === "idol" ? (
        <>
          <div className="lab-controller-title">
            <div>
              <span className="eyebrow">IDOL SHOWDOWN</span>
              <strong>
                <span style={{ background: player.color }} />P{player.slot} ·{" "}
                {player.name}
              </strong>
            </div>
            <button
              className="return-console"
              disabled={
                !player.canNavigate ||
                connection !== "connected" ||
                state.native.quitting
              }
              onClick={() => nav("library")}
            >
              <Icon name="back" size={17} />
              {state.native.quitting ? "Closing game…" : "Stop & return Home"}
            </button>
          </div>
          <div className="native-phone-toolbar">
            <div
              className="native-phone-modes"
              role="group"
              aria-label="Game controller mode"
            >
              {(["menu", "fight"] as const).map((mode) => (
                <button
                  key={mode}
                  className={state.native.controls === mode ? "active" : ""}
                  aria-pressed={state.native.controls === mode}
                  disabled={
                    !player.canNavigate ||
                    connection !== "connected" ||
                    state.native.quitting
                  }
                  onClick={() => {
                    neutral();
                    send({ type: "native-controls", mode });
                  }}
                >
                  {mode === "menu" ? "Menus" : "Fight"}
                </button>
              ))}
            </div>
            <span
              className={
                state.native.focused && state.native.status === "running"
                  ? "native-phone-live"
                  : "native-phone-paused"
              }
            >
              <span className="status-dot" />
              {state.native.quitting
                ? "Closing game…"
                : state.native.status === "starting"
                  ? "Launching…"
                  : state.native.focused && state.native.status === "running"
                    ? "Game in focus"
                    : "Input paused · focus game on PC"}
            </span>
          </div>
          {player.slot > 2 ? (
            <section className="native-spectator">
              <Icon name="people" size={45} />
              <h2>You're in the audience.</h2>
              <p>
                Idol Showdown supports two players. P1 and P2 control the game;
                your phone stays connected for the console.
              </p>
            </section>
          ) : (
            <>
              <p className="rotate-hint">
                <Icon name="rotate" size={18} />
                Turn your phone sideways for more room.
              </p>
              <div className="native-shoulders">
                <div>
                  {touchButton("lt", "LT", "shoulder")}
                  {touchButton("l", "L", "shoulder")}
                </div>
                <div>
                  {touchButton("r", "R", "shoulder")}
                  {touchButton("rt", "RT", "shoulder")}
                </div>
              </div>
              <section className="lab-controls native-fight-controls">
                {dpad}
                <div className="lab-middle native-utility">
                  <div>
                    {touchButton("select", "Select", "utility-control")}
                    {touchButton("start", "Start", "utility-control")}
                  </div>
                  <div>
                    {touchButton(
                      "confirm",
                      "Confirm",
                      "utility-control native-confirm",
                    )}
                    {touchButton("back", "Back", "utility-control")}
                  </div>
                </div>
                <div className="face-buttons" aria-label="Fighting buttons">
                  {touchButton("y", "Y", "face y")}
                  {touchButton("x", "X", "face x")}
                  {touchButton("b", "B", "face b")}
                  {touchButton("a", "A", "face a")}
                </div>
              </section>
            </>
          )}
          <footer className="lab-controller-footer native-phone-footer">
            <span>
              {player.slot > 2
                ? "Two players maximum · shared screen"
                : state.native.controls === "menu"
                  ? `D-pad · Confirm / Back · Device select: ${player.slot === 1 ? "Left" : "Right"}, then Confirm`
                  : "Fight: D-pad moves · action buttons attack · Start pauses"}
            </span>
            <button
              onClick={() => {
                neutral();
                setName(player.name);
                setEditing(true);
              }}
            >
              <Icon name="edit" size={15} />
              Edit name
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="lab-controller-title">
            <div>
              <span className="eyebrow">CONTROLLER LAB</span>
              <strong>
                <span style={{ background: player.color }} />P{player.slot} ·{" "}
                {player.name}
              </strong>
            </div>
            <button
              className="return-console"
              disabled={
                !player.canNavigate ||
                connection !== "connected" ||
                state.native.quitting
              }
              onClick={() => nav("library")}
            >
              <Icon name="back" size={17} />
              Return to console
            </button>
          </div>
          <p className="rotate-hint">
            <Icon name="rotate" size={18} />
            Turn your phone sideways for more room.
          </p>
          <section className="lab-controls">
            {dpad}
            <div className="lab-middle">
              {touchButton("start", "Start", "utility-control")}
              {touchButton("back", "Back", "utility-control")}
            </div>
            <div className="face-buttons" aria-label="Action buttons">
              {touchButton("y", "Y", "face y")}
              {touchButton("x", "X", "face x")}
              {touchButton("b", "B", "face b")}
              {touchButton("a", "A", "face a")}
            </div>
          </section>
          <footer className="lab-controller-footer">
            <span>Hold directions. Press any button. Watch your player.</span>
            <button
              onClick={() => {
                neutral();
                setName(player.name);
                setEditing(true);
              }}
            >
              <Icon name="edit" size={15} />
              Edit name
            </button>
          </footer>
        </>
      )}
      {connection !== "connected" && (
        <div className="controller-reconnect" role="status">
          <Icon name="wifi" />
          {error || "Reconnecting…"}
          <small>All input has been released.</small>
        </div>
      )}
      {fullscreenHint &&
        state.profile !== "idol" &&
        state.profile !== "racing" &&
        state.profile !== "speedstorm" &&
        state.profile !== "brawlhalla" && (
          <div className="fullscreen-hint" role="status">
            {fullscreenHint}
            <button
              aria-label="Dismiss fullscreen notice"
              onClick={() => setFullscreenHint("")}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
      {error && connection === "connected" && (
        <div className="controller-message" role="alert">
          {error}
          <button aria-label="Dismiss message" onClick={() => setError("")}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      <PersonalLayoutEditor model={personal}/>
      {feedbackSettings && (
        <div className="phone-modal-overlay">
          <section
            className={`phone-edit-modal${speedstorm ? " speedstorm-settings" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="controller-settings-title"
          >
            <div className="modal-heading">
              <h2 id="controller-settings-title">Controller settings</h2>
              <IconButton
                name="close"
                label="Close controller settings"
                onClick={() => {
                  haptics.stop();
                  feedbackSettingsRef.current = false;
                  setFeedbackSettings(false);
                }}
              />
            </div>
            {speedstorm && (
              <section className="speedstorm-style-settings">
                <h3>Speedstorm control style</h3>
                <div
                  className="speedstorm-style-choices"
                  role="group"
                  aria-label="Speedstorm control style"
                >
                  <button
                    type="button"
                    aria-label="Classic"
                    aria-pressed={speedstormControlStyle === "classic"}
                    onClick={() => chooseSpeedstormControlStyle("classic")}
                  >
                    <strong>Classic</strong>
                    <span>
                      Separate gas and drift. Large gas and brake pedals.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Drift assist"
                    aria-pressed={speedstormControlStyle === "assist"}
                    onClick={() => chooseSpeedstormControlStyle("assist")}
                  >
                    <strong>Drift assist</strong>
                    <span>
                      Drift also holds gas. Brake overrides gas while held.
                    </span>
                  </button>
                </div>
                <p>Only this phone · Saved for Disney Speedstorm</p>
              </section>
            )}
            {speedstorm && (
              <section className="speedstorm-style-settings speedstorm-input-help">
                <h3>Menus work, but the car won’t move?</h3>
                <p>
                  On the PC, open Speedstorm: Options → Settings → Controls.
                  Choose Gamepad {player.slot} → Select. P1 is the first Gamepad
                  after Keyboard. “Change” only edits the button layout.
                </p>
                <p>
                  Online races use the selected Gamepad. For P1–P4 together,
                  choose Friendly Race → Local Freeplay. Switch this controller
                  to Race on the starting grid.
                </p>
              </section>
            )}
            <button className="button full-width" onClick={()=>{neutral();feedbackSettingsRef.current=false;setFeedbackSettings(false);personal.begin();}}>Adjust layout</button><p className="layout-settings-hint">Move and resize controls on this phone. Bindings and other players stay the same.</p>
            <button
              className="button full-width"
              aria-label="Phone vibration"
              aria-pressed={haptics.supported && vibrationEnabled}
              disabled={!haptics.supported}
              onClick={() => {
                haptics.activate();
                const enabled = !vibrationEnabled;
                haptics.setEnabled(enabled);
                setVibrationEnabled(enabled);
              }}
            >
              {haptics.supported
                ? `Vibration: ${vibrationEnabled ? "On" : "Off"}`
                : "Vibration unavailable"}
            </button>
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: "14px 0" }}>
              {haptics.supported
                ? state.profile === "idol" || brawlhalla
                  ? "Touch feedback for attack buttons in Fight mode."
                  : "Feel boost and supported game feedback on this phone."
                : "This browser does not support phone vibration."}
            </p>
            <button
              className="button primary full-width"
              disabled={!haptics.supported || !vibrationEnabled}
              onClick={() => haptics.test()}
            >
              Test vibration
            </button>
          </section>
        </div>
      )}
      {editing && (
        <div className="phone-modal-overlay">
          <form className="phone-edit-modal" onSubmit={saveName}>
            <div className="modal-heading">
              <h2>Make it yours.</h2>
              <IconButton
                name="close"
                label="Cancel name change"
                onClick={() => setEditing(false)}
              />
            </div>
            <label className="field-label">
              Your name
              <input
                ref={nameRef}
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
                required
              />
            </label>
            <button className="button primary full-width">Save name</button>
          </form>
        </div>
      )}
      {searching && (
        <div className="phone-modal-overlay">
          <form
            className="phone-edit-modal"
            onSubmit={(e) => {
              e.preventDefault();
              nav("search", query);
              setSearching(false);
            }}
          >
            <div className="modal-heading">
              <h2>Find a game.</h2>
              <IconButton
                name="close"
                label="Close search"
                onClick={() => setSearching(false)}
              />
            </div>
            <label className="field-label">
              Search the library
              <input
                autoFocus
                value={query}
                maxLength={80}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Game title"
              />
            </label>
            <button className="button primary full-width">
              <Icon name="search" />
              Search
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<ControllerApp />);
