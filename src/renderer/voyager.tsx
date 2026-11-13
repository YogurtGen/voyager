import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  GAMES,
  EMPTY_LIBRARY_FILTERS,
  matchesLibraryFilters,
  nativeAvailable,
  type GameManifest,
  type HostCommand,
  type HostState,
} from "../shared/types";
import {
  DEFAULT_PRESENTATION,
  steamTrailerAppId,
  type PresentationCommand,
  type PresentationSettings,
  type PresentationState,
} from "../shared/presentation";
import type { ArtworkSlot } from "../shared/studio-model";
import { Brand, Icon, Mark } from "./ui";
import { LibraryCardMenu, type CardMenuAnchor } from "./library-card-menu";
import "./voyager.css";
import { LiquidLogo } from "./liquid-logo";
import { VoyagerCollection, visibleCollectionGames } from "./collection";
import { ConsoleMusic } from "./console-audio";
import { TrailerAudio } from "./trailer-audio";
import {
  lobbyStep,
  orbitLayout,
  orbitTravel,
  pathOffset,
} from "./lobby-motion";

export const mediaURL = (id: string) => `waterconsole://app/media/${id}`;
function NavigationArrow({
  direction = "right",
}: {
  direction?: "left" | "right";
}) {
  return (
    <svg
      className={`navigation-arrow ${direction}`}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function usePresentation() {
  const [value, setValue] = useState<PresentationState>({
    settings: DEFAULT_PRESENTATION,
    games: {},
  });
  const [ready, setReady] = useState(false);
  const call = async (command: PresentationCommand) => {
    const result = await window.waterconsole?.presentation?.(command);
    if (!result?.ok)
      throw new Error(
        result?.error || "Presentation settings are unavailable.",
      );
    if (result.state) setValue(result.state);
  };
  useEffect(() => {
    let active = true;
    if (!window.waterconsole?.presentation) {
      setReady(true);
      return;
    }
    window.waterconsole
      ?.presentation?.({ type: "get" })
      .then((r) => {
        if (active && r.state) setValue(r.state);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = value.settings.motion;
  }, [value.settings.motion]);
  return { value, call, ready };
}
export function Starfield() {
  return (
    <div className="voyager-stars" aria-hidden="true">
      {Array.from({ length: 76 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 47.13) % 100}%`,
            top: `${(i * 31.73) % 100}%`,
            opacity: 0.2 + (i % 4) * 0.16,
            width: i % 9 === 0 ? 3 : 1.5,
            height: i % 9 === 0 ? 3 : 1.5,
            background:
              i % 11 === 0 ? "#e8c77a" : i % 4 === 0 ? "#72a7ff" : "#f4f7ff",
          }}
        />
      ))}
    </div>
  );
}
export function PlayerBadge({
  state,
  onClick,
}: {
  state: HostState;
  onClick: () => void;
}) {
  const count = state.players.filter((p) => p.connected).length;
  return (
    <button
      className="voyager-player-badge"
      onClick={onClick}
      aria-label={`${count} of 4 players connected. Manage players`}
    >
      <span className="led-face" key={count}>
        <span className="led-dot" />
        {count}
        <span className="led-divider">/</span>4
      </span>
      <span>PLAYERS CONNECTED</span>
    </button>
  );
}
export function StartupReveal({
  ready,
  value,
  muted,
  onDone,
}: {
  ready: boolean;
  value: PresentationState;
  muted: boolean;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false),
    [wordmarkVisible, setWordmarkVisible] = useState(false),
    [glassReady, setGlassReady] = useState(false),
    [audioReady, setAudioReady] = useState(false),
    [duration, setDuration] = useState(3500),
    [startedAt, setStartedAt] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null),
    done = useRef(onDone),
    surface = useRef<HTMLDivElement>(null);
  done.current = onDone;
  const reduced =
    value.settings.motion === "reduced" ||
    (value.settings.motion === "system" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    if (!value.settings.startupSound || muted) {
      setAudioReady(true);
      return;
    }
    const sound = audio.current;
    if (!sound) return;
    sound.preload = "metadata";
    sound.volume = 0.85;
    const finish = () => {
      if (!active) return;
      const ms = Number.isFinite(sound.duration) ? sound.duration * 1000 : 3500;
      setDuration(Math.min(12000, Math.max(3500, ms)));
      setAudioReady(true);
    };
    sound.onloadedmetadata = finish;
    sound.onerror = finish;
    const timeout = setTimeout(finish, 1000);
    sound.load();
    return () => {
      active = false;
      clearTimeout(timeout);
      sound.pause();
    };
  }, [ready]);
  useEffect(() => {
    if (!ready || !glassReady || !audioReady) return;
    setStartedAt(performance.now());
    setWordmarkVisible(false);
    if (audio.current && !muted) void audio.current.play().catch(() => {});
    let holdTimer: ReturnType<typeof setTimeout>,
      finishTimer: ReturnType<typeof setTimeout>;
    const timer = setTimeout(
      () => {
        setWordmarkVisible(true);
        holdTimer = setTimeout(() => {
          setLeaving(true);
          finishTimer = setTimeout(() => done.current(), 180);
        }, 1000);
      },
      reduced && (!value.settings.startupSound || muted) ? 120 : duration,
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(holdTimer);
      clearTimeout(finishTimer);
      audio.current?.pause();
    };
  }, [ready, glassReady, audioReady, duration, reduced]);
  useEffect(() => {
    if (audio.current) audio.current.muted = muted;
  }, [muted]);
  return (
    <div
      ref={surface}
      tabIndex={-1}
      className={`voyager-opening ${leaving ? "leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Voyager opening"
      onKeyDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <LiquidLogo
        startedAt={startedAt}
        duration={duration}
        reduced={reduced}
        showWordmark={wordmarkVisible}
        onReady={() => setGlassReady(true)}
      />
      <audio
        hidden
        ref={audio}
        data-audio-bus="startup"
        src="waterconsole://app/audio/startup.ogg"
        preload="auto"
      />
    </div>
  );
}
export function VoyagerMusic(props: {
  scene: "pair" | "library" | "off";
  value: PresentationState;
  muted: boolean;
  onError?: (message: string) => void;
}) {
  return <ConsoleMusic {...props} />;
}
export function PresentationSettings({
  value,
  call,
}: {
  value: PresentationState;
  call: (c: PresentationCommand) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const update = (settings: Partial<PresentationSettings>) =>
    void call({ type: "settings", settings }).catch((e) => setError(e.message));
  return (
    <div className="voyager-preferences">
      <p className="modal-description">
        Music and trailer audio play on this PC.
      </p>
      <label>
        <span>Background music</span>
        <input
          type="checkbox"
          checked={value.settings.music}
          onChange={(e) => update({ music: e.target.checked })}
        />
      </label>
      <label>
        <span>Music volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value.settings.musicVolume}
          onChange={(e) => update({ musicVolume: Number(e.target.value) })}
        />
      </label>
      <label>
        <span>Startup sound</span>
        <input
          type="checkbox"
          checked={value.settings.startupSound}
          onChange={(e) => update({ startupSound: e.target.checked })}
        />
      </label>
      <p className="modal-description">Startup: Voyager · Select Ultimate</p>
      <label>
        <span>Motion</span>
        <select
          value={value.settings.motion}
          aria-label="Motion"
          onChange={(e) =>
            update({ motion: e.target.value as PresentationSettings["motion"] })
          }
        >
          <option value="system">Follow system</option>
          <option value="full">Full</option>
          <option value="reduced">Reduced</option>
        </select>
      </label>
      <label>
        <span>Game lobby trailers</span>
        <input
          type="checkbox"
          checked={value.settings.trailers}
          onChange={(e) => update({ trailers: e.target.checked })}
        />
      </label>
      <label>
        <span>Autoplay trailers</span>
        <input
          type="checkbox"
          checked={value.settings.autoplay}
          onChange={(e) => update({ autoplay: e.target.checked })}
        />
      </label>
      <label>
        <span>Trailer sound</span>
        <input
          type="checkbox"
          checked={value.settings.trailerSound}
          onChange={(e) => update({ trailerSound: e.target.checked })}
        />
      </label>
      <label>
        <span>Trailer volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step=".05"
          value={value.settings.trailerVolume}
          onChange={(e) => update({ trailerVolume: Number(e.target.value) })}
        />
      </label>
      <p className="preference-note">
        Trailers are cached on this PC. Replace a trailer through Edit game.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function GameMediaEditor({
  game,
  value,
  call,
  kinds = ["banner", "trailer"],
}: {
  game: GameManifest;
  value: PresentationState;
  call: (c: PresentationCommand) => Promise<void>;
  kinds?: ("banner" | "trailer")[];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const media = value.games[game.id] || {};
  const action = async (command: PresentationCommand) => {
    setBusy(true);
    setError("");
    try {
      await call(command);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="voyager-media-editor">
      <p className="modal-description">{game.title}</p>
      <small>Media changes are saved on this PC immediately.</small>
      {kinds.length > 1 && (
        <div className="media-explanation">
          <strong>Cover → disc label</strong>
          <strong>Banner → lobby background</strong>
          <strong>Trailer → lobby video and audio</strong>
        </div>
      )}
      {kinds.map((kind) => (
        <section key={kind}>
          <h3>{kind === "banner" ? "Lobby banner" : "Trailer"}</h3>
          <p>
            {kind === "banner"
              ? "A static image shown when video is off, missing or unavailable."
              : "Upload your own MP4 or WebM if a store trailer is blurry or broken. Maximum 512 MB. The file is copied into Voyager."}
          </p>
          <small>
            {kind === "trailer"
              ? media.trailerName || "No trailer. The banner will be shown."
              : media.banner
                ? "Custom banner loaded"
                : "Using game artwork"}
          </small>
          <div className="media-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void action({ type: "import", gameId: game.id, kind })
              }
            >
              {busy ? "Please wait…" : `Choose ${kind}`}
            </button>
            {media[kind] && (
              <button
                className="button ghost"
                disabled={busy}
                onClick={() =>
                  void action({ type: "remove", gameId: game.id, kind })
                }
              >
                {kind === "banner" ? "Restore game artwork" : "Remove trailer"}
              </button>
            )}
          </div>
        </section>
      ))}
      {(steamTrailerAppId(game.id) || game.trailerAvailable) && (
        <section>
          <h3>Steam trailer</h3>
          <p>
            Download a trailer from this game’s Steam store page. This uses your
            internet connection and replaces the current trailer only when you
            choose it.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void action({ type: "download", gameId: game.id })}
          >
            {busy
              ? "Please wait…"
              : media.trailer
                ? "Replace with Steam trailer"
                : "Download Steam trailer"}
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
type ArtworkProps = {
  gameId: string;
  art?: ArtworkSlot;
  variant: "cover" | "hero";
  alt?: string;
};
function DiscFace({
  game,
  Artwork,
  roll,
}: {
  game: GameManifest;
  Artwork: ComponentType<ArtworkProps>;
  roll?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const label = game.title.toUpperCase(),
    size = Math.max(
      6,
      Math.min(21, 194.36 / (Math.max(label.length, 1) * 0.56)),
    );
  return (
    <span className="disc-body">
      <span className="disc-edge" />
      <span className="disc-face">
        <span
          className="disc-roll"
          style={
            roll === undefined ? undefined : { transform: `rotate(${roll}deg)` }
          }
        >
          <span className="disc-print">
            <Artwork gameId={game.id} variant="cover" art={game.cover} />
            <svg className="disc-type" viewBox="0 0 200 200" aria-hidden="true">
              <defs>
                <path id={`${uid}top`} d="M28 100a72 72 0 1 1 144 0" />
                <path id={`${uid}bottom`} d="M14 100a86 86 0 0 0 172 0" />
              </defs>
              <text
                fill="#fff"
                fontSize={size}
                fontWeight="700"
                textAnchor="middle"
                textLength={Math.min(194.36, label.length * size * 0.56)}
                lengthAdjust="spacingAndGlyphs"
                stroke="#05070d99"
                strokeWidth=".8"
                paintOrder="stroke"
              >
                <textPath href={`#${uid}top`} startOffset="50%">
                  {label}
                </textPath>
              </text>
              <text
                fill="#f4f7ff"
                fontSize="5.2"
                letterSpacing=".7"
                textAnchor="middle"
                stroke="#05070dbb"
                strokeWidth=".5"
                paintOrder="stroke"
              >
                <textPath href={`#${uid}bottom`} startOffset="50%">
                  {game.minPlayers === game.maxPlayers
                    ? game.maxPlayers
                    : `${game.minPlayers}–${game.maxPlayers}`}{" "}
                  {game.maxPlayers === 1 ? "PLAYER" : "PLAYERS"} · VOYAGER
                </textPath>
              </text>
              <text
                x="100"
                y="150"
                fill="#fff"
                fontSize="8"
                fontWeight="700"
                letterSpacing=".6"
                textAnchor="middle"
                stroke="#05070d99"
                strokeWidth=".5"
                paintOrder="stroke"
              >
                VOYAGER
              </text>
            </svg>
          </span>
        </span>
        <svg className="disc-hub" viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}metal`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fbfbfc" />
              <stop offset=".45" stopColor="#a9adb3" />
              <stop offset=".55" stopColor="#eef0f2" />
              <stop offset="1" stopColor="#8f949a" />
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="100"
            r="35.5"
            fill="none"
            stroke={`url(#${uid}metal)`}
            strokeWidth="4"
          />
          <circle
            cx="100"
            cy="100"
            r="25.5"
            fill="rgba(232,235,239,.82)"
            stroke="rgba(232,235,239,.82)"
            strokeWidth="16"
          />
          <circle
            cx="100"
            cy="100"
            r="17.6"
            fill="none"
            stroke="rgba(255,255,255,.95)"
            strokeWidth="1.4"
          />
          <circle
            cx="100"
            cy="100"
            r="22"
            fill="none"
            stroke="rgba(0,0,0,.12)"
            strokeWidth=".6"
          />
          <circle
            cx="100"
            cy="100"
            r="27"
            fill="none"
            stroke="rgba(255,255,255,.75)"
            strokeWidth="1.6"
          />
          <circle
            cx="100"
            cy="100"
            r="28.6"
            fill="none"
            stroke="rgba(0,0,0,.1)"
            strokeWidth=".6"
          />
          <circle
            cx="100"
            cy="100"
            r="33.3"
            fill="none"
            stroke="rgba(0,0,0,.16)"
            strokeWidth=".7"
          />
          <circle
            cx="100"
            cy="100"
            r="99.3"
            fill="none"
            stroke="rgba(255,255,255,.4)"
            strokeWidth="1.2"
          />
        </svg>
        <span className="disc-sheen" />
      </span>
    </span>
  );
}
type Send = (c: HostCommand) => void;
export function VoyagerLibrary(props: {
  state: HostState;
  send: Send;
  openPair: () => void;
  onAdd: () => void;
  onEdit: (id: string, studio?: boolean) => void;
  onMedia: (id: string) => void;
  onPlayers: () => void;
  value: PresentationState;
  Artwork: ComponentType<ArtworkProps>;
  suspended: boolean;
  onEnsureMedia?: (gameId: string) => Promise<void>;
  onTrailerSound?: (enabled: boolean) => void;
}) {
  const [playback, setPlayback] = useState<"play" | "pause" | "off">(
    props.value.settings.autoplay ? "play" : "off",
  );
  useEffect(
    () => setPlayback(props.value.settings.autoplay ? "play" : "off"),
    [props.value.settings.autoplay],
  );
  const list = visibleCollectionGames(props.state);
  const game =
    (props.state.catalog || GAMES).find(
      (item) => item.id === props.state.selectedGameId,
    ) || (props.state.catalog || GAMES)[0];
  if (props.state.heroMode === "detail" && game)
    return (
      <GameLobby
        {...props}
        game={game}
        list={list}
        playback={playback}
        setPlayback={setPlayback}
      />
    );
  return <VoyagerCollection {...props} Disc={DiscFace} />;
}
function GameLobby({
  game,
  list,
  state,
  send,
  openPair,
  onEdit,
  onMedia,
  onPlayers,
  value,
  Artwork,
  suspended,
  onEnsureMedia,
  onTrailerSound,
  playback,
  setPlayback,
}: {
  game: GameManifest;
  list: GameManifest[];
  state: HostState;
  send: Send;
  openPair: () => void;
  onEdit: (id: string, studio?: boolean) => void;
  onMedia: (id: string) => void;
  onPlayers: () => void;
  value: PresentationState;
  Artwork: ComponentType<ArtworkProps>;
  suspended: boolean;
  onEnsureMedia?: (gameId: string) => Promise<void>;
  onTrailerSound?: (enabled: boolean) => void;
  playback: "play" | "pause" | "off";
  setPlayback: (mode: "play" | "pause" | "off") => void;
}) {
  const [discPose, setDiscPose] = useState({ id: game.id, angle: 0, orbit: 0 });
  if (discPose.id !== game.id) {
    const steps = lobbyStep(
      discPose.id,
      game.id,
      list.map((g) => g.id),
    );
    setDiscPose({
      id: game.id,
      angle: discPose.angle + steps * 45,
      orbit:
        discPose.orbit -
        orbitTravel(
          list.map((g) => g.title),
          list.findIndex((g) => g.id === discPose.id),
          steps,
        ),
    });
  }
  const orbitId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const orbitIndex = Math.max(
    0,
    list.findIndex((g) => g.id === game.id),
  );
  const orbitAngle = discPose.orbit;
  const orbitGames = orbitLayout(
    list.map((g) => g.title),
    orbitIndex,
  );
  const media = value.games[game.id] || {};
  const [loadingTrailer, setLoadingTrailer] = useState(false),
    [trailerError, setTrailerError] = useState("");
  useEffect(() => {
    let active = true;
    setLoadingTrailer(false);
    setTrailerError("");
    if (
      onEnsureMedia &&
      (steamTrailerAppId(game.id) || game.trailerAvailable) &&
      value.settings.trailers &&
      playback === "play" &&
      (!media.trailer ||
        (!media.trailerAudioChecked &&
          media.trailerName?.startsWith("Steam · "))) &&
      !media.trailerDisabled
    ) {
      setLoadingTrailer(true);
      void onEnsureMedia(game.id)
        .catch((e) => {
          if (active) setTrailerError(e.message);
        })
        .finally(() => {
          if (active) setLoadingTrailer(false);
        });
    }
    return () => {
      active = false;
    };
  }, [
    game.id,
    value.settings.trailers,
    value.settings.autoplay,
    media.trailerDisabled,
    playback,
  ]);
  const [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false),
    [videoRunning, setVideoRunning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const [audioError, setAudioError] = useState("");
  const soundMuted = state.muted || !value.settings.trailerSound;
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setVideoRunning(false);
    setAudioError("");
  }, [media.trailer, game.id]);
  const hasVideo = Boolean(
    media.trailer &&
    value.settings.trailers &&
    playback !== "off" &&
    !failed &&
    !suspended &&
    visible,
  );
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = soundMuted || Boolean(media.trailerAudio);
    element.volume = value.settings.trailerVolume;
    let active = true;
    if (hasVideo && playback === "play")
      void element.play().catch((error) => {
        if (active && error.name !== "AbortError") setPlayback("pause");
      });
    else element.pause();
    return () => {
      active = false;
    };
  }, [
    hasVideo,
    playback,
    media.trailer,
    game.id,
    soundMuted,
    media.trailerAudio,
    value.settings.trailerVolume,
  ]);
  const available =
    game.availability === "available" &&
    (game.runtime !== "native" || nativeAvailable(state.native, game.id));
  const current = list.findIndex((g) => g.id === game.id);
  const adjacent = (direction: number) => {
    if (list.length)
      send({
        type: "selectGame",
        gameId:
          list[(Math.max(0, current) + direction + list.length) % list.length]
            .id,
      });
  };
  return (
    <main className="voyager-game-lobby">
      <div className="game-lobby-backdrop" aria-hidden="true">
        {media.banner ? (
          <img src={mediaURL(media.banner)} alt="" />
        ) : (
          <Artwork gameId={game.id} variant="hero" art={game.banner} />
        )}
        {hasVideo && (
          <video
            key={media.trailer}
            ref={video}
            src={mediaURL(media.trailer!)}
            muted={soundMuted || Boolean(media.trailerAudio)}
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => setLoaded(true)}
            onPlaying={() => setVideoRunning(true)}
            onPause={() => setVideoRunning(false)}
            onWaiting={() => setVideoRunning(false)}
            onStalled={() => setVideoRunning(false)}
            onEmptied={() => setVideoRunning(false)}
            onError={() => {
              setFailed(true);
              setLoaded(false);
              setVideoRunning(false);
            }}
            className={loaded ? "loaded" : ""}
          />
        )}
        {hasVideo && media.trailerAudio && (
          <TrailerAudio
            video={video}
            src={mediaURL(media.trailerAudio)}
            playing={videoRunning && playback === "play"}
            muted={soundMuted}
            volume={value.settings.trailerVolume}
            onError={setAudioError}
          />
        )}
      </div>
      <div className="game-lobby-shade" />
      <div className="game-lobby-top">
        <button
          className="button ghost"
          onClick={() => send({ type: "navigate", action: "back" })}
        >
          <NavigationArrow direction="left" /> Collection
        </button>
        <PlayerBadge state={state} onClick={onPlayers} />
      </div>
      <div className="game-lobby-layout">
        <section className="game-lobby-copy">
          <span className="voyager-kicker">
            {game.runtime === "native"
              ? "FROM YOUR PC LIBRARY"
              : "BUILT INTO VOYAGER"}
          </span>
          <h1 title={game.title}>{game.title}</h1>
          <div className="game-lobby-meta">
            <span>
              <Icon name="people" size={18} />
              {game.minPlayers === game.maxPlayers
                ? game.maxPlayers
                : `${game.minPlayers}–${game.maxPlayers}`}{" "}
              {game.maxPlayers === 1 ? "player" : "players"}
            </span>
            <span>
              {game.connection === "online"
                ? "Online · Epic Games"
                : game.connection === "offline-online"
                  ? "Offline · Online"
                  : "Local play"}
            </span>
          </div>
          <div className="game-lobby-actions">
            <button
              className="button primary play-button"
              disabled={!available}
              onClick={() => send({ type: "startGame", gameId: game.id })}
            >
              <Icon name={available ? "play" : "clock"} />
              {available
                ? "Start game"
                : game.launchRequirement?.label || "Game not found"}
            </button>
            <button
              className="button ghost"
              aria-label={
                state.favorites.includes(game.id)
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
              aria-pressed={state.favorites.includes(game.id)}
              onClick={() => send({ type: "toggleFavorite", gameId: game.id })}
            >
              <Icon name="heart" />
            </button>
          </div>
          <p
            className="game-lobby-description"
            tabIndex={game.description.length > 350 ? 0 : undefined}
            aria-label="Game description"
          >
            {game.description}
          </p>
          {!available && (
            <p className="game-lobby-notice">
              {game.launchRequirement?.description ||
                `Install ${game.title}${game.id === "hotwheels-unleashed" ? " · Epic Games edition" : game.local ? "" : " · Steam edition"}, then restart Voyager to detect it.`}
            </p>
          )}
          {game.offlineNote && (
            <small className="game-lobby-note">{game.offlineNote}</small>
          )}
        </section>
        <section className="game-lobby-controller">
          <span className="voyager-kicker">PHONE CONTROLLERS</span>
          <h2>
            {game.maxPlayers === 4
              ? "Bring the whole crew."
              : "Ready for your co-pilot?"}
          </h2>
          <p>
            {game.controllerProfile === "racing"
              ? "Steering, drift, boost and race menus. Solo or 2-player split screen."
              : game.controllerProfile === "speedstorm"
                ? "Drift Assist, skill / charge, boost and four independent player slots."
                : game.controllerProfile === "brawlhalla"
                  ? "Eight-way movement, light / heavy attacks, jump, dodge and throw."
                  : "Your game’s dedicated controls, right on your phone."}
          </p>
          <button className="button" onClick={openPair}>
            <Icon name="phone" />
            Connect phones
          </button>
          {game.local ? (
            <>
              <button className="text-action" onClick={() => onEdit(game.id)}>
                Edit game
              </button>
              <button
                className="text-action"
                onClick={() => onEdit(game.id, true)}
              >
                Controller Studio
              </button>
            </>
          ) : (
            <button className="text-action" onClick={() => onMedia(game.id)}>
              Edit game
            </button>
          )}
        </section>
      </div>
      <div className="lobby-disc-stage">
        <div
          className="lobby-game-orbit"
          data-angle={orbitAngle}
          aria-label="Choose a game"
        >
          <svg
            className="lobby-orbit-track"
            viewBox="-100 -100 200 200"
            aria-hidden="true"
          >
            <circle r="87" fill="none" stroke="currentColor" strokeWidth=".3" />
            <circle className="lobby-orbit-dot" cy="-87" r="1.25" />
          </svg>
          <svg
            className="lobby-orbit-labels"
            viewBox="-100 -100 200 200"
            role="group"
            aria-label="Game orbit"
          >
            <defs>
              <path
                id={`${orbitId}ring`}
                d="M-92.8 0A92.8 92.8 0 1 1 92.8 0A92.8 92.8 0 1 1-92.8 0"
              />
            </defs>
            <g transform={`rotate(${orbitAngle})`}>
              {orbitGames.map(({ index, angle, fontSize, width }) => {
                const item = list[index];
                return (
                  <text
                    key={item.id}
                    textAnchor="middle"
                    role="button"
                    tabIndex={0}
                    aria-label={`Show ${item.title}`}
                    aria-pressed={item.id === game.id}
                    style={{ fontSize }}
                    textLength={width}
                    lengthAdjust="spacingAndGlyphs"
                    onClick={() =>
                      send({ type: "selectGame", gameId: item.id })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        send({ type: "selectGame", gameId: item.id });
                      }
                    }}
                  >
                    <title>{item.title}</title>
                    <textPath
                      href={`#${orbitId}ring`}
                      startOffset={`${pathOffset(angle - orbitAngle)}%`}
                    >
                      {item.title}
                    </textPath>
                  </text>
                );
              })}
            </g>
          </svg>
        </div>
        <button
          className="orbit-arrow"
          aria-label="Previous game"
          disabled={list.length < 2}
          onClick={() => adjacent(-1)}
        >
          <NavigationArrow direction="left" />
        </button>
        <div
          className="lobby-disc"
          data-roll={discPose.angle}
          data-spinning={
            hasVideo && playback === "play" && videoRunning ? "true" : "false"
          }
        >
          <DiscFace game={game} Artwork={Artwork} roll={discPose.angle} />
        </div>
        <button
          className="orbit-arrow"
          aria-label="Next game"
          disabled={list.length < 2}
          onClick={() => adjacent(1)}
        >
          <NavigationArrow />
        </button>
      </div>
      <div className="trailer-controls" aria-label="Trailer controls">
        <span>
          <Icon name={soundMuted ? "muted" : "volume"} size={15} />
          {loadingTrailer
            ? media.trailer
              ? "TRAILER · PREPARING AUDIO…"
              : "PREPARING TRAILER…"
            : trailerError && !media.trailer
              ? "TRAILER UNAVAILABLE · EDIT GAME TO REPLACE"
              : failed
                ? "Trailer unavailable · banner shown"
                : media.trailer
                  ? audioError || (trailerError && !media.trailerAudioChecked)
                    ? "TRAILER · AUDIO UNAVAILABLE"
                    : soundMuted
                      ? "TRAILER · MUTED"
                      : "TRAILER · SOUND ON"
                  : "BANNER · NO TRAILER"}
        </span>
        {media.trailer && value.settings.trailers && (
          <>
            {onTrailerSound && (
              <button
                aria-label={
                  value.settings.trailerSound
                    ? "Mute trailer"
                    : "Unmute trailer"
                }
                aria-pressed={value.settings.trailerSound}
                onClick={() => onTrailerSound(!value.settings.trailerSound)}
              >
                <Icon name={soundMuted ? "muted" : "volume"} size={16} />
              </button>
            )}
            <button
              aria-pressed={playback === "play"}
              onClick={() => {
                setFailed(false);
                setPlayback("play");
              }}
            >
              Play
            </button>
            <button
              aria-pressed={playback === "pause"}
              disabled={!hasVideo}
              onClick={() => setPlayback("pause")}
            >
              Pause
            </button>
            <button
              aria-pressed={playback === "off"}
              onClick={() => setPlayback("off")}
            >
              Off
            </button>
          </>
        )}
      </div>
    </main>
  );
}
export function PairingScene({
  state,
  children,
  onPlayers,
  onContinue,
}: {
  state: HostState;
  children: ReactNode;
  onPlayers: () => void;
  onContinue: () => void;
}) {
  return (
    <main className="voyager-pairing">
      <div className="pairing-orbit" aria-hidden="true">
        <Mark size={120} />
        <i />
        <i />
        <i />
      </div>
      <div className="pairing-welcome">
        <span className="voyager-kicker">WELCOME ABOARD</span>
        <h1>
          A shared screen.
          <br />
          Your own controllers.
        </h1>
        <p>Connect up to four phones and play together.</p>
        <PlayerBadge state={state} onClick={onPlayers} />
      </div>
      <section className="voyager-pair-panel">
        {children}
        <button className="button primary continue-button" onClick={onContinue}>
          Continue to Home <Icon name="arrow" size={18} />
        </button>
        <p className="lobby-footnote">
          You can connect more phones from your collection.
        </p>
      </section>
    </main>
  );
}
