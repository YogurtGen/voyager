import { open, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { officialBytes } from "./store-metadata";
import { steamTrailerAppId } from "../shared/presentation";

const videoHosts = new Set([
  "video.fastly.steamstatic.com",
  "video.akamai.steamstatic.com",
  "cdn.akamai.steamstatic.com",
  "cdn.cloudflare.steamstatic.com",
  "steamcdn-a.akamaihd.net",
  "shared.fastly.steamstatic.com",
  "shared.akamai.steamstatic.com",
]);
export function steamVideoURL(value: string) {
  return steamResourceURL(value, /\.(mp4|webm)$/i);
}
function steamResourceURL(value: string, format: RegExp) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !videoHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !format.test(url.pathname)
  )
    throw new Error(
      "The store did not provide a supported downloadable trailer. Choose a local video instead.",
    );
  return url;
}
export async function downloadSteamTrailer(
  gameId: string,
  directory: string,
  fetcher: typeof fetch = fetch,
  storeRef?: { store: string; id: string },
): Promise<{ filename: string; name: string; audioFilename?: string }> {
  const appId = steamTrailerAppId(gameId, storeRef);
  if (!appId) throw new Error("Use a local trailer for this game.");
  const data = JSON.parse(
    (
      await officialBytes(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&filters=movies`,
        false,
        fetcher,
      )
    ).toString("utf8"),
  );
  const movies = data?.[String(appId)]?.data?.movies;
  const playable = (m: any) =>
    m?.mp4?.max ||
    m?.webm?.max ||
    m?.mp4?.[480] ||
    m?.webm?.[480] ||
    m?.hls_h264;
  const movie = Array.isArray(movies)
    ? movies.find(
        (m) =>
          playable(m) &&
          /launch|full trailer|overview|cgi trailer/i.test(m.name || ""),
      ) || movies.find(playable)
    : undefined;
  let next =
    movie?.mp4?.max ||
    movie?.mp4?.[480] ||
    movie?.webm?.max ||
    movie?.webm?.[480] ||
    movie?.hls_h264;
  if (typeof next !== "string")
    throw new Error(
      "No downloadable Steam trailer is available. Choose a local MP4 or WebM instead.",
    );
  await mkdir(directory, { recursive: true });
  const name = `Steam · ${typeof movie.name === "string" ? movie.name.slice(0, 120) : "Game trailer"}`;
  if (next === movie?.hls_h264)
    return downloadHlsTrailer(next, directory, fetcher, name);
  let temporary: string | undefined;
  try {
    for (let i = 0; i < 4; i++) {
      const url = steamVideoURL(next);
      const response = await fetcher(url, {
        redirect: "manual",
        credentials: "omit",
        signal: AbortSignal.timeout(90000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        next = new URL(response.headers.get("location") || "", url).href;
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(
          "Steam's trailer is unavailable. Choose a local video or try again later.",
        );
      }
      const max = 512 * 1024 * 1024;
      if (Number(response.headers.get("content-length")) > max) {
        await response.body.cancel();
        throw new Error(
          "This trailer exceeds 512 MB. Choose a smaller local video.",
        );
      }
      temporary = path.join(
        directory,
        randomUUID() + path.extname(url.pathname).toLowerCase(),
      );
      const file = await open(temporary, "wx");
      let total = 0;
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          total += chunk.byteLength;
          if (total > max) throw new Error("This trailer exceeds 512 MB.");
          await file.writeFile(chunk);
        }
      } finally {
        await file.close();
      }
      return {
        filename: temporary,
        name,
      };
    }
    throw new Error("Steam's trailer redirected too many times.");
  } catch (error) {
    if (temporary) await rm(temporary, { force: true });
    throw error;
  }
}

export function hlsVideoVariant(text: string, base: string) {
  const lines = text.trim().split(/\r?\n/);
  const variants: { url: string; height: number }[] = [];
  lines.forEach((line, i) => {
    if (!line.startsWith("#EXT-X-STREAM-INF:")) return;
    const height = Number(/RESOLUTION=\d+x(\d+)/.exec(line)?.[1]);
    const uri = lines[i + 1]?.trim();
    if (height && uri && !uri.startsWith("#"))
      variants.push({ url: new URL(uri, base).href, height });
  });
  const usable = variants
    .filter((v) => v.height <= 1080)
    .sort((a, b) => b.height - a.height);
  return (usable[0] || variants.sort((a, b) => a.height - b.height)[0])?.url;
}
export function hlsVideoSegments(text: string, base: string) {
  if (
    !text.startsWith("#EXTM3U") ||
    !text.includes("#EXT-X-ENDLIST") ||
    /#EXT-X-(KEY|BYTERANGE|DISCONTINUITY)/.test(text)
  )
    throw new Error("Unsupported store stream. Choose a local MP4 or WebM.");
  const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(text)?.[1];
  const parts = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  if (!init || !parts.length || parts.length > 1000)
    throw new Error("Unsupported store stream. Choose a local MP4 or WebM.");
  return [init, ...parts].map((p) =>
    steamResourceURL(new URL(p, base).href, /\.(m4s|mp4)$/i),
  );
}
async function steamResource(
  value: string,
  format: RegExp,
  fetcher: typeof fetch,
) {
  let next = value;
  for (let i = 0; i < 4; i++) {
    const url = steamResourceURL(next, format);
    const response = await fetcher(url, {
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(90000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      next = new URL(response.headers.get("location") || "", url).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(
        "Steam trailer unavailable. Choose a local video or retry.",
      );
    }
    return { response, url };
  }
  throw new Error("Too many Steam video redirects.");
}
async function playlist(value: string, fetcher: typeof fetch) {
  const { response, url } = await steamResource(value, /\.m3u8$/i, fetcher);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > 512 * 1024) throw new Error("Store playlist too large.");
    chunks.push(chunk);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), url: url.href };
}
async function downloadHlsTrailer(
  value: string,
  directory: string,
  fetcher: typeof fetch,
  name: string,
) {
  const master = await playlist(value, fetcher);
  const variant = hlsVideoVariant(master.text, master.url);
  const media = variant ? await playlist(variant, fetcher) : master;
  const video = await downloadFragments(
    media,
    directory,
    fetcher,
    name,
    ".mp4",
  );
  try {
    const audio = await downloadHlsAudio(master, directory, fetcher, name);
    return { ...video, audioFilename: audio?.filename };
  } catch (error) {
    await rm(video.filename, { force: true });
    throw error;
  }
}
async function downloadHlsAudio(
  master: { text: string; url: string },
  directory: string,
  fetcher: typeof fetch,
  name: string,
) {
  const audioLine = master.text
    .split(/\r?\n/)
    .find(
      (line) => line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO"),
    );
  const uri = audioLine && /(?:^|,)URI="([^"]+)"/.exec(audioLine)?.[1];
  if (!uri) return;
  const media = await playlist(new URL(uri, master.url).href, fetcher);
  return downloadFragments(media, directory, fetcher, name, ".m4a");
}
export async function downloadSteamTrailerAudio(
  gameId: string,
  directory: string,
  fetcher: typeof fetch = fetch,
  storeRef?: { store: string; id: string },
  trailerName?: string,
) {
  const appId = steamTrailerAppId(gameId, storeRef);
  if (!appId) throw new Error("No store audio is available for this game.");
  const data = JSON.parse(
    (
      await officialBytes(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&filters=movies`,
        false,
        fetcher,
      )
    ).toString("utf8"),
  );
  const movies = data?.[String(appId)]?.data?.movies;
  const expected = trailerName?.replace(/^Steam · /, "");
  const movie = Array.isArray(movies)
    ? movies.find((m) => m.name === expected)
    : undefined;
  if (!movie)
    throw new Error(
      "This trailer changed on Steam. Replace it through Edit game to restore matching audio.",
    );
  if (!movie.hls_h264) return;
  await mkdir(directory, { recursive: true });
  return downloadHlsAudio(
    await playlist(movie.hls_h264, fetcher),
    directory,
    fetcher,
    trailerName || "Steam trailer audio",
  );
}
async function downloadFragments(
  media: { text: string; url: string },
  directory: string,
  fetcher: typeof fetch,
  name: string,
  extension: ".mp4" | ".m4a",
) {
  const parts = hlsVideoSegments(media.text, media.url);
  const filename = path.join(directory, randomUUID() + extension),
    file = await open(filename, "wx");
  let total = 0,
    complete = false;
  try {
    for (const part of parts) {
      const { response } = await steamResource(
        part.href,
        /\.(m4s|mp4)$/i,
        fetcher,
      );
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > (extension === ".m4a" ? 30 : 512) * 1024 * 1024)
          throw new Error("This trailer exceeds 512 MB.");
        await file.writeFile(chunk);
      }
    }
    complete = true;
    return { filename, name };
  } finally {
    await file.close();
    if (!complete) await rm(filename, { force: true });
  }
}
