import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalGameArtwork } from "../src/electron/game-art";
let fixture: string;
const jpeg = (marker: number) => Buffer.from([0xff, 0xd8, marker, 0xff, 0xd9]);
const games = [
  "idol-showdown",
  "hotwheels-unleashed",
  "disney-speedstorm",
  "brawlhalla",
];
async function image(directory: string, name: string, bytes: Uint8Array) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), bytes);
}
function load() {
  return loadLocalGameArtwork(
    path.join(fixture, "project-idol"),
    path.join(fixture, "project-hotwheels"),
    path.join(fixture, "project-disney"),
    path.join(fixture, "project-brawl"),
    path.join(fixture, "different-install-location", "library-art"),
    path.join(fixture, "installed-resources", "library-art"),
  );
}
beforeEach(async () => {
  await mkdir(path.resolve(".local"), { recursive: true });
  fixture = await mkdtemp(path.resolve(".local", "artwork-test-"));
  for (const name of [
    "WATERCONSOLE_ART_DIRECTORY",
    "WATERCONSOLE_HOTWHEELS_ART_DIRECTORY",
    "WATERCONSOLE_SPEEDSTORM_ART_DIRECTORY",
    "WATERCONSOLE_BRAWLHALLA_ART_DIRECTORY",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("ProgramFiles(x86)", fixture);
  vi.stubEnv("ProgramFiles", fixture);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (!fixture.startsWith(path.resolve(".local") + path.sep))
    throw Error("Fixture escaped test workspace");
  await rm(fixture, { recursive: true, force: true });
});
describe("installed library artwork", () => {
  it("loads installer-bundled posters without any project, private data or Steam cache", async () => {
    for (const [index, game] of games.entries()) {
      const directory = path.join(
        fixture,
        "installed-resources",
        "library-art",
        game,
      );
      await image(directory, "library_header.jpg", jpeg(index));
      await image(directory, "library_hero.jpg", jpeg(index + 10));
    }
    const art = await load();
    expect(art.size).toBe(8);
    for (const [index, game] of games.entries()) {
      expect(art.get(`library-art/${game}-cover`)).toEqual(
        new Uint8Array(jpeg(index)),
      );
      expect(art.get(`library-art/${game}-hero`)).toEqual(
        new Uint8Array(jpeg(index + 10)),
      );
    }
  });
  it("prefers custom PC artwork and fills an absent banner from the bundle", async () => {
    const custom = path.join(
      fixture,
      "different-install-location",
      "library-art",
      "hotwheels-unleashed",
    );
    const bundled = path.join(
      fixture,
      "installed-resources",
      "library-art",
      "hotwheels-unleashed",
    );
    await image(custom, "library_header.jpg", jpeg(20));
    await image(bundled, "library_header.jpg", jpeg(21));
    await image(bundled, "library_hero.jpg", jpeg(22));
    const art = await load();
    expect(art.get("library-art/hotwheels-unleashed-cover")).toEqual(
      new Uint8Array(jpeg(20)),
    );
    expect(art.get("library-art/hotwheels-unleashed-hero")).toEqual(
      new Uint8Array(jpeg(22)),
    );
  });
  it("loads all four games beside a relocated installation without source folders or Steam cache", async () => {
    for (const [index, game] of games.entries()) {
      const directory = path.join(
        fixture,
        "different-install-location/library-art",
        game,
      );
      await image(directory, "library_header.jpg", jpeg(index));
      await image(directory, "library_hero.jpg", jpeg(index + 10));
    }
    const art = await load();
    expect(art.size).toBe(8);
    for (const [index, game] of games.entries()) {
      expect(art.get(`library-art/${game}-cover`)).toEqual(
        new Uint8Array(jpeg(index)),
      );
      expect(art.get(`library-art/${game}-hero`)).toEqual(
        new Uint8Array(jpeg(index + 10)),
      );
    }
  });
  it("retains PC override precedence and can fill its missing banner from the installation", async () => {
    const override = path.join(fixture, "override"),
      installed = path.join(
        fixture,
        "different-install-location/library-art/hotwheels-unleashed",
      );
    vi.stubEnv("WATERCONSOLE_HOTWHEELS_ART_DIRECTORY", override);
    await image(override, "library_header.jpg", jpeg(1));
    await image(installed, "library_header.jpg", jpeg(2));
    await image(installed, "library_hero.jpg", jpeg(3));
    const art = await load();
    expect(art.get("library-art/hotwheels-unleashed-cover")).toEqual(
      new Uint8Array(jpeg(1)),
    );
    expect(art.get("library-art/hotwheels-unleashed-hero")).toEqual(
      new Uint8Array(jpeg(3)),
    );
  });
  it("keeps the existing project-private source fallback", async () => {
    await image(
      path.join(fixture, "project-hotwheels"),
      "library_header.jpg",
      jpeg(4),
    );
    expect((await load()).get("library-art/hotwheels-unleashed-cover")).toEqual(
      new Uint8Array(jpeg(4)),
    );
  });
  it("ignores invalid or oversized installed images and continues to a valid source", async () => {
    const installed = path.join(
      fixture,
      "different-install-location/library-art/hotwheels-unleashed",
    );
    await image(installed, "library_header.jpg", Buffer.from("not a JPEG"));
    const large = Buffer.alloc(8 * 1024 * 1024 + 1);
    large[0] = 0xff;
    large[1] = 0xd8;
    await image(installed, "library_hero.jpg", large);
    await image(
      path.join(fixture, "project-hotwheels"),
      "library_header.jpg",
      jpeg(5),
    );
    const art = await load();
    expect(art.get("library-art/hotwheels-unleashed-cover")).toEqual(
      new Uint8Array(jpeg(5)),
    );
    expect(art.has("library-art/hotwheels-unleashed-hero")).toBe(false);
  });
  it("does not reuse one game's image for another game", async () => {
    await image(
      path.join(
        fixture,
        "different-install-location/library-art/hotwheels-unleashed",
      ),
      "library_header.jpg",
      jpeg(6),
    );
    expect([...(await load()).keys()]).toEqual([
      "library-art/hotwheels-unleashed-cover",
    ]);
  });
  it("returns no desktop artwork when all optional local sources are absent", async () => {
    expect((await load()).size).toBe(0);
  });
});
