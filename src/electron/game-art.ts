import { readFile, stat } from "node:fs/promises";
import path from "node:path";

function steamArtworkDirectories(appId: string) {
  return [
    process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
    process.env.ProgramFiles || "C:/Program Files",
  ].map((root) => path.join(root, "Steam/appcache/librarycache", appId));
}

export async function loadLocalGameArtwork(
  privateDirectory: string,
  hotwheelsDirectory?: string,
  speedstormDirectory?: string,
  brawlhallaDirectory?: string,
  localLibraryDirectory?: string,
  bundledLibraryDirectory?: string,
) {
  const artwork = new Map<string, Uint8Array>();
  const collections = [
    {
      game: "idol-showdown",
      directories: [
        process.env.WATERCONSOLE_ART_DIRECTORY,
        localLibraryDirectory &&
          path.join(localLibraryDirectory, "idol-showdown"),
        privateDirectory,
        bundledLibraryDirectory &&
          path.join(bundledLibraryDirectory, "idol-showdown"),
        ...steamArtworkDirectories("1742020"),
      ],
    },
    {
      game: "hotwheels-unleashed",
      directories: [
        process.env.WATERCONSOLE_HOTWHEELS_ART_DIRECTORY,
        localLibraryDirectory &&
          path.join(localLibraryDirectory, "hotwheels-unleashed"),
        hotwheelsDirectory,
        bundledLibraryDirectory &&
          path.join(bundledLibraryDirectory, "hotwheels-unleashed"),
      ],
    },
    {
      game: "disney-speedstorm",
      directories: [
        process.env.WATERCONSOLE_SPEEDSTORM_ART_DIRECTORY,
        localLibraryDirectory &&
          path.join(localLibraryDirectory, "disney-speedstorm"),
        speedstormDirectory,
        bundledLibraryDirectory &&
          path.join(bundledLibraryDirectory, "disney-speedstorm"),
        ...steamArtworkDirectories("1537830"),
      ],
    },
    {
      game: "brawlhalla",
      directories: [
        process.env.WATERCONSOLE_BRAWLHALLA_ART_DIRECTORY,
        localLibraryDirectory && path.join(localLibraryDirectory, "brawlhalla"),
        brawlhallaDirectory,
        bundledLibraryDirectory &&
          path.join(bundledLibraryDirectory, "brawlhalla"),
        ...steamArtworkDirectories("291550"),
      ],
    },
  ];
  for (const collection of collections) {
    const directories = collection.directories.filter(
      (directory): directory is string => !!directory,
    );
    for (const [variant, names] of [
      ["cover", ["library_header.jpg", "header.jpg", "library_600x900.jpg"]],
      ["hero", ["library_hero.jpg"]],
    ] as const) {
      let found = false;
      for (const directory of directories) {
        for (const name of names) {
          try {
            const filename = path.join(directory, name);
            const info = await stat(filename);
            if (!info.isFile() || info.size < 4 || info.size > 8 * 1024 * 1024)
              continue;
            const bytes = await readFile(filename);
            if (bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;
            artwork.set(
              `library-art/${collection.game}-${variant}`,
              new Uint8Array(bytes),
            );
            found = true;
            break;
          } catch {
            /* Local artwork is optional; the renderer has an original fallback. */
          }
        }
        if (found) break;
      }
    }
  }
  return artwork;
}
