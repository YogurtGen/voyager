import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  stat,
  open,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_PRESENTATION,
  type PresentationState,
  type PresentationSettings,
} from "../shared/presentation";

export function cleanSettings(
  input: unknown,
  base = DEFAULT_PRESENTATION,
): PresentationSettings {
  const s =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  return {
    music: typeof s.music === "boolean" ? s.music : base.music,
    musicVolume:
      typeof s.musicVolume === "number" && Number.isFinite(s.musicVolume)
        ? Math.min(1, Math.max(0, s.musicVolume))
        : base.musicVolume,
    startupSound:
      typeof s.startupSound === "boolean" ? s.startupSound : base.startupSound,
    motion: ["system", "full", "reduced"].includes(String(s.motion))
      ? (s.motion as PresentationSettings["motion"])
      : base.motion,
    trailers: typeof s.trailers === "boolean" ? s.trailers : base.trailers,
    autoplay: typeof s.autoplay === "boolean" ? s.autoplay : base.autoplay,
    trailerSound:
      typeof s.trailerSound === "boolean" ? s.trailerSound : base.trailerSound,
    trailerVolume:
      typeof s.trailerVolume === "number" && Number.isFinite(s.trailerVolume)
        ? Math.min(1, Math.max(0, s.trailerVolume))
        : base.trailerVolume,
  };
}
const assetPattern = /^[a-f0-9-]{36}\.(mp4|m4a|webm|png|mp3|ogg|wav)$/;
export function byteRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!value) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(size - 1, Number(match[2]))
      : size - 1
    : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start < size &&
    end >= start
    ? { start, end }
    : null;
}
export class PresentationStore {
  private state: PresentationState = {
    settings: { ...DEFAULT_PRESENTATION },
    games: {},
  };
  private updates: Promise<unknown> = Promise.resolve();
  constructor(private root: string) {}
  async initialize() {
    await mkdir(path.join(this.root, "media"), { recursive: true });
    try {
      const data = JSON.parse(
        await readFile(path.join(this.root, "presentation.json"), "utf8"),
      );
      this.state.settings = cleanSettings(data.settings);
      if (data.games && typeof data.games === "object") {
        for (const [id, raw] of Object.entries(data.games)) {
          if (!/^[a-z0-9-]{1,100}$/.test(id) || !raw || typeof raw !== "object")
            continue;
          const media = raw as Record<string, unknown>;
          this.state.games[id] = {
            trailerDisabled: media.trailerDisabled === true,
            trailerAudio:
              typeof media.trailerAudio === "string" &&
              assetPattern.test(media.trailerAudio)
                ? media.trailerAudio
                : undefined,
            trailerAudioChecked: media.trailerAudioChecked === true,
            banner:
              typeof media.banner === "string" &&
              assetPattern.test(media.banner)
                ? media.banner
                : undefined,
            trailer:
              typeof media.trailer === "string" &&
              assetPattern.test(media.trailer)
                ? media.trailer
                : undefined,
            trailerName:
              typeof media.trailerName === "string"
                ? media.trailerName.slice(0, 160)
                : undefined,
          };
        }
      }
      if (typeof data.startup === "string" && assetPattern.test(data.startup))
        this.state.startup = data.startup;
    } catch {
      /* First launch or invalid preferences use defaults. */
    }
  }
  get() {
    return structuredClone(this.state);
  }
  private async save(next: PresentationState) {
    const temp = path.join(this.root, `presentation-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temp, path.join(this.root, "presentation.json"));
    this.state = next;
    return this.get();
  }
  private update(make: (state: PresentationState) => PresentationState) {
    const next = this.updates.then(() => this.save(make(this.state)));
    this.updates = next.catch(() => {});
    return next;
  }
  settings(input: unknown) {
    return this.update((state) => ({
      ...state,
      settings: cleanSettings(input, state.settings),
    }));
  }
  async importFile(
    filename: string,
    kind: "trailer" | "startup" | "trailer-audio",
  ) {
    const ext = path.extname(filename).toLowerCase();
    if (
      !(
        kind === "trailer"
          ? [".mp4", ".webm"]
          : kind === "trailer-audio"
            ? [".m4a"]
            : [".mp3", ".ogg", ".wav"]
      ).includes(ext)
    )
      throw new Error("Unsupported media format.");
    const info = await stat(filename);
    if (
      !info.isFile() ||
      info.size < 32 ||
      info.size > (kind === "trailer" ? 512 : 30) * 1024 * 1024
    )
      throw new Error("Choose a trailer under 512 MB or sound under 30 MB.");
    const file = await open(filename, "r");
    const header = Buffer.alloc(16);
    try {
      await file.read(header, 0, 16, 0);
    } finally {
      await file.close();
    }
    if (
      ([".mp4", ".m4a"].includes(ext) &&
        header.toString("ascii", 4, 8) !== "ftyp") ||
      (ext === ".webm" && header.readUInt32BE(0) !== 0x1a45dfa3)
    )
      throw new Error("This file is not a supported video.");
    const id = randomUUID() + ext;
    await copyFile(filename, path.join(this.root, "media", id));
    return id;
  }
  async importBanner(bytes: Uint8Array) {
    const id = randomUUID() + ".png";
    await writeFile(path.join(this.root, "media", id), bytes);
    return id;
  }
  async setMedia(
    gameId: string,
    kind: "trailer" | "banner",
    asset?: string,
    name?: string,
    onlyIfMissing = false,
    audioAsset?: string,
  ) {
    if (!/^[a-z0-9-]{1,100}$/.test(gameId)) throw new Error("Unknown game.");
    return this.update((state) => {
      if (
        kind === "trailer" &&
        onlyIfMissing &&
        (state.games[gameId]?.trailer || state.games[gameId]?.trailerDisabled)
      )
        return state;
      const media = { ...state.games[gameId], [kind]: asset };
      if (kind === "trailer") {
        media.trailerName = asset ? name : undefined;
        media.trailerDisabled = !asset;
        media.trailerAudio = asset ? audioAsset : undefined;
        media.trailerAudioChecked = Boolean(asset);
      }
      return { ...state, games: { ...state.games, [gameId]: media } };
    });
  }
  startup(asset: string) {
    return this.update((state) => ({ ...state, startup: asset }));
  }
  setTrailerAudio(gameId: string, expectedVideo: string, audioAsset?: string) {
    return this.update((state) =>
      state.games[gameId]?.trailer !== expectedVideo
        ? state
        : {
            ...state,
            games: {
              ...state.games,
              [gameId]: {
                ...state.games[gameId],
                trailerAudio: audioAsset,
                trailerAudioChecked: true,
              },
            },
          },
    );
  }
  async response(id: string, range: string | null) {
    if (!assetPattern.test(id))
      return new Response("Not found", { status: 404 });
    const filename = path.join(this.root, "media", id);
    const info = await stat(filename);
    const slice = byteRange(range, info.size);
    if (!slice)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    const types: Record<string, string> = {
      ".mp4": "video/mp4",
      ".m4a": "audio/mp4",
      ".webm": "video/webm",
      ".png": "image/png",
      ".mp3": "audio/mpeg",
      ".ogg": "audio/ogg",
      ".wav": "audio/wav",
    };
    const headers: Record<string, string> = {
      "Content-Type": types[path.extname(id)],
      "Accept-Ranges": "bytes",
      "Content-Length": String(slice.end - slice.start + 1),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    };
    if (range)
      headers["Content-Range"] =
        `bytes ${slice.start}-${slice.end}/${info.size}`;
    // Read in bounded chunks, including large local trailers and seeking requests.
    const file = await open(filename, "r");
    let position = slice.start;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const length = Math.min(256 * 1024, slice.end - position + 1);
          if (length <= 0) {
            await file.close();
            controller.close();
            return;
          }
          const bytes = Buffer.alloc(length);
          const { bytesRead } = await file.read(bytes, 0, length, position);
          if (!bytesRead) {
            await file.close();
            controller.close();
            return;
          }
          position += bytesRead;
          controller.enqueue(new Uint8Array(bytes.subarray(0, bytesRead)));
        } catch (error) {
          await file.close().catch(() => {});
          controller.error(error);
        }
      },
      async cancel() {
        await file.close().catch(() => {});
      },
    });
    return new Response(stream, { status: range ? 206 : 200, headers });
  }
}
