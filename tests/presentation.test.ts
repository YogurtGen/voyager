import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PresentationStore,
  byteRange,
  cleanSettings,
} from "../src/electron/presentation-store";

describe("Voyager local presentation media", () => {
  let root: string, store: PresentationStore;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "voyager-media-"));
    store = new PresentationStore(root);
    await store.initialize();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it("bounds preferences, ignores unknown values, and persists independently", async () => {
    expect(
      cleanSettings({ musicVolume: 8, motion: "spin", trailers: "yes" }),
    ).toMatchObject({ musicVolume: 1, motion: "system", trailers: true });
    await store.settings({ music: false, motion: "reduced" });
    const reloaded = new PresentationStore(root);
    await reloaded.initialize();
    expect(reloaded.get().settings).toMatchObject({
      music: false,
      motion: "reduced",
    });
    expect(reloaded.get().games).toEqual({});
  });
  it("keeps audio attached to its expected video and clears it when the user replaces the trailer", async () => {
    const old = "00000000-0000-4000-8000-000000000000.mp4",
      replacement = "11111111-1111-4111-8111-111111111111.mp4",
      audio = "22222222-2222-4222-8222-222222222222.m4a";
    await store.setMedia("brawlhalla", "trailer", old, "Steam trailer");
    await store.setTrailerAudio("brawlhalla", old, audio);
    expect(store.get().games.brawlhalla.trailerAudio).toBe(audio);
    await store.setMedia("brawlhalla", "trailer", replacement, "User video");
    await store.setTrailerAudio("brawlhalla", old, audio);
    expect(store.get().games.brawlhalla).toMatchObject({
      trailer: replacement,
      trailerAudioChecked: true,
    });
    expect(store.get().games.brawlhalla.trailerAudio).toBeUndefined();
    expect(
      cleanSettings({ trailerVolume: 20, trailerSound: false }),
    ).toMatchObject({ trailerVolume: 1, trailerSound: false });
  });
  it("copies a local trailer, supports seeking, and never exposes original paths", async () => {
    const bytes = Buffer.alloc(1024, 12);
    bytes.write("ftyp", 4);
    const source = path.join(root, "my-trailer.mp4");
    await writeFile(source, bytes);
    const asset = await store.importFile(source, "trailer");
    await store.setMedia("brawlhalla", "trailer", asset, "my-trailer.mp4");
    await writeFile(source, "original changed");
    const response = await store.response(asset, "bytes=10-19");
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 10-19/1024");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array(bytes.subarray(10, 20)),
    );
    expect(JSON.stringify(store.get())).not.toContain(root);
    expect((await store.response("../presentation.json", null)).status).toBe(
      404,
    );
    expect((await store.response(asset, "bytes=2000-3000")).status).toBe(416);
  });
  it("rejects renamed non-video files and unsafe game IDs", async () => {
    const file = path.join(root, "fake.mp4");
    await writeFile(file, Buffer.alloc(40));
    await expect(store.importFile(file, "trailer")).rejects.toThrow(
      "not a supported video",
    );
    await expect(store.setMedia("../oops", "banner", "x")).rejects.toThrow(
      "Unknown game",
    );
  });
  it("clears a user override without modifying the original game files", async () => {
    const id = await store.importBanner(new Uint8Array([1, 2, 3]));
    await store.setMedia("disney-speedstorm", "banner", id);
    await store.setMedia("disney-speedstorm", "banner");
    expect(store.get().games["disney-speedstorm"].banner).toBeUndefined();
    expect(await readFile(path.join(root, "media", id))).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });
  it("rejects malformed and multi-part ranges", () => {
    for (const range of [
      "bytes=1-2,4-5",
      "bytes=-0",
      "bytes=90-5",
      "bytes=100-",
      "bytes=-",
      "bytes=9007199254740999-",
    ])
      expect(byteRange(range, 100)).toBeNull();
    expect(byteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=0-1000", 100)).toEqual({ start: 0, end: 99 });
  });
  it("serializes simultaneous preference changes without losing either field", async () => {
    await Promise.all([
      store.settings({ music: false }),
      store.settings({ motion: "reduced" }),
      store.settings({ musicVolume: 0.2 }),
    ]);
    expect(store.get().settings).toMatchObject({
      music: false,
      motion: "reduced",
      musicVolume: 0.2,
    });
    const reloaded = new PresentationStore(root);
    await reloaded.initialize();
    expect(reloaded.get().settings).toEqual(store.get().settings);
  });
  it("persists an intentional trailer removal and clears that opt-out on replacement", async () => {
    const asset = "00000000-0000-4000-8000-000000000000.mp4";
    await store.setMedia(
      "disney-speedstorm",
      "trailer",
      asset,
      "Custom trailer",
    );
    await store.setMedia("disney-speedstorm", "trailer");
    const reloaded = new PresentationStore(root);
    await reloaded.initialize();
    expect(reloaded.get().games["disney-speedstorm"]).toMatchObject({
      trailerDisabled: true,
    });
    await reloaded.setMedia(
      "disney-speedstorm",
      "trailer",
      asset,
      "Replacement",
    );
    expect(reloaded.get().games["disney-speedstorm"]).toMatchObject({
      trailerDisabled: false,
      trailer: asset,
      trailerName: "Replacement",
    });
  });
  it("does not let a queued automatic download overwrite a user's upload or removal", async () => {
    const custom = "00000000-0000-4000-8000-000000000000.mp4",
      automatic = "11111111-1111-4111-8111-111111111111.mp4";
    await Promise.all([
      store.setMedia("brawlhalla", "trailer", custom, "User video"),
      store.setMedia("brawlhalla", "trailer", automatic, "Steam video", true),
    ]);
    expect(store.get().games.brawlhalla.trailer).toBe(custom);
    await Promise.all([
      store.setMedia("brawlhalla", "trailer"),
      store.setMedia("brawlhalla", "trailer", automatic, "Steam video", true),
    ]);
    expect(store.get().games.brawlhalla).toMatchObject({
      trailerDisabled: true,
    });
    expect(store.get().games.brawlhalla.trailer).toBeUndefined();
  });
});
