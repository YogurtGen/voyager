import { describe, it, expect } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  steamVideoURL,
  downloadSteamTrailer,
  hlsVideoVariant,
  hlsVideoSegments,
  downloadSteamTrailerAudio,
} from "../src/electron/trailer-download";
describe("Steam trailer import", () => {
  it("restores only the matching cached trailer's separate HLS audio", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voyager-audio-"));
    try {
      const requests: string[] = [];
      const fetcher = (async (url: RequestInfo | URL) => {
        const value = String(url);
        requests.push(value);
        if (value.includes("appdetails"))
          return Response.json({
            "291550": {
              data: {
                movies: [
                  {
                    name: "New trailer",
                    hls_h264:
                      "https://video.akamai.steamstatic.com/new/master.m3u8",
                  },
                  {
                    name: "Original trailer",
                    hls_h264:
                      "https://video.akamai.steamstatic.com/original/master.m3u8",
                  },
                ],
              },
            },
          });
        if (value.endsWith("master.m3u8"))
          return new Response(
            '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"',
          );
        if (value.endsWith("audio.m3u8"))
          return new Response(
            '#EXTM3U\n#EXT-X-MAP:URI="init.m4s"\n#EXTINF:3\naudio.m4s\n#EXT-X-ENDLIST',
          );
        return new Response(
          new Uint8Array(value.endsWith("init.m4s") ? [1, 2] : [3, 4]),
        );
      }) as typeof fetch;
      const result = await downloadSteamTrailerAudio(
        "brawlhalla",
        root,
        fetcher,
        undefined,
        "Steam · Original trailer",
      );
      expect(result?.filename.endsWith(".m4a")).toBe(true);
      expect(await readFile(result!.filename)).toEqual(
        Buffer.from([1, 2, 3, 4]),
      );
      expect(requests.some((u) => u.includes("/new/"))).toBe(false);
      await expect(
        downloadSteamTrailerAudio(
          "brawlhalla",
          root,
          fetcher,
          undefined,
          "Steam · Removed trailer",
        ),
      ).rejects.toThrow("changed on Steam");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("accepts only known HTTPS video CDNs and downloadable formats", () => {
    expect(
      steamVideoURL(
        "https://video.fastly.steamstatic.com/store_trailers/123/movie.mp4",
      ).hostname,
    ).toBe("video.fastly.steamstatic.com");
    for (const value of [
      "http://video.fastly.steamstatic.com/a.mp4",
      "https://localhost/a.mp4",
      "https://video.fastly.steamstatic.com.evil.test/a.mp4",
      "https://video.fastly.steamstatic.com/a.m3u8",
      "https://user:pass@video.fastly.steamstatic.com/a.mp4",
    ])
      expect(() => steamVideoURL(value)).toThrow();
  });
  it("downloads only on request and follows only validated CDN redirects", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voyager-trailer-"));
    try {
      const urls: string[] = [];
      const fetcher = (async (url: RequestInfo | URL) => {
        urls.push(String(url));
        return urls.length === 1
          ? Response.json({
              "291550": {
                data: {
                  movies: [
                    {
                      name: "Trailer",
                      mp4: {
                        max: "https://video.fastly.steamstatic.com/one.mp4",
                      },
                    },
                  ],
                },
              },
            })
          : urls.length === 2
            ? new Response(null, {
                status: 302,
                headers: {
                  location: "https://video.akamai.steamstatic.com/two.mp4",
                },
              })
            : new Response(new Uint8Array([1, 2, 3, 4]));
      }) as typeof fetch;
      const result = await downloadSteamTrailer("brawlhalla", root, fetcher);
      expect(await readFile(result.filename)).toEqual(
        Buffer.from([1, 2, 3, 4]),
      );
      expect(urls).toHaveLength(3);
      await expect(
        downloadSteamTrailer("controller-lab", root, fetcher),
      ).rejects.toThrow("local trailer");
      expect(urls).toHaveLength(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("selects the highest bounded video rendition and rejects unsafe/unsupported HLS segments", () => {
    const base =
      "https://video.akamai.steamstatic.com/store_trailers/208650/master.m3u8";
    expect(
      hlsVideoVariant(
        "#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nhigh.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\nlow.m3u8",
        base,
      ),
    ).toBe(new URL("high.m3u8", base).href);
    const media =
      '#EXTM3U\n#EXT-X-MAP:URI="init.m4s"\n#EXTINF:3\npart.m4s\n#EXT-X-ENDLIST';
    expect(hlsVideoSegments(media, base).map((u) => u.pathname)).toEqual([
      "/store_trailers/208650/init.m4s",
      "/store_trailers/208650/part.m4s",
    ]);
    expect(() =>
      hlsVideoSegments(
        media.replace("part.m4s", "http://127.0.0.1/part.m4s"),
        base,
      ),
    ).toThrow();
    expect(() =>
      hlsVideoSegments(
        media.replace("#EXT-X-MAP:", "#EXT-X-KEY:METHOD=AES-128\n#EXT-X-MAP:"),
        base,
      ),
    ).toThrow();
  });
  it("keeps HLS video and audio in separate local files and accepts imported Steam IDs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voyager-hls-"));
    try {
      const visited: string[] = [];
      const fetcher = (async (url: RequestInfo | URL) => {
        const value = String(url);
        visited.push(value);
        if (value.includes("appdetails"))
          return Response.json({
            "208650": {
              data: {
                movies: [
                  {
                    name: "Full Trailer",
                    hls_h264:
                      "https://video.akamai.steamstatic.com/test/master.m3u8",
                  },
                ],
              },
            },
          });
        if (value.endsWith("master.m3u8"))
          return new Response(
            '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nvideo.m3u8',
          );
        if (value.endsWith("video.m3u8"))
          return new Response(
            '#EXTM3U\n#EXT-X-MAP:URI="init.m4s"\n#EXTINF:3\npart.m4s\n#EXT-X-ENDLIST',
          );
        if (value.endsWith("audio.m3u8"))
          return new Response(
            '#EXTM3U\n#EXT-X-MAP:URI="a-init.m4s"\n#EXTINF:3\na-part.m4s\n#EXT-X-ENDLIST',
          );
        if (value.endsWith("a-init.m4s"))
          return new Response(new Uint8Array([5, 6]));
        if (value.endsWith("a-part.m4s"))
          return new Response(new Uint8Array([7, 8]));
        return new Response(
          new Uint8Array(value.endsWith("init.m4s") ? [1, 2] : [3, 4]),
        );
      }) as typeof fetch;
      const result = await downloadSteamTrailer("local-batman", root, fetcher, {
        store: "steam",
        id: "208650",
      });
      expect(await readFile(result.filename)).toEqual(
        Buffer.from([1, 2, 3, 4]),
      );
      expect(visited[0]).toContain("appids=208650");
      expect(await readFile(result.audioFilename!)).toEqual(
        Buffer.from([5, 6, 7, 8]),
      );
      expect(visited).toHaveLength(8);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects private-network redirects before connecting to them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voyager-trailer-"));
    let count = 0;
    try {
      const fetcher = (async () =>
        ++count === 1
          ? Response.json({
              "291550": {
                data: {
                  movies: [
                    {
                      mp4: {
                        max: "https://video.fastly.steamstatic.com/a.mp4",
                      },
                    },
                  ],
                },
              },
            })
          : new Response(null, {
              status: 302,
              headers: { location: "http://127.0.0.1/secret.mp4" },
            })) as typeof fetch;
      await expect(
        downloadSteamTrailer("brawlhalla", root, fetcher),
      ).rejects.toThrow();
      expect(count).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
