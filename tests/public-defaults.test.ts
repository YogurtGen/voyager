import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { GAMES } from "../src/shared/types";
import { createWaterConsoleServer } from "../src/server/index";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(path.resolve(".local/tests") + path.sep))
      throw new Error("Test escaped workspace");
    await rm(root, { recursive: true, force: true });
  }
});
describe("first public release", () => {
  it("ships Controller Lab as its sole default catalog entry", () => {
    expect(GAMES.map((game) => game.id)).toEqual(["controller-lab"]);
    expect(GAMES[0].runtime).toBe("web");
  });
  it("starts a fresh server without any saved or native games in its catalog", async () => {
    await mkdir(path.resolve(".local/tests"), { recursive: true });
    const root = await mkdtemp(path.resolve(".local/tests", "public-default-"));
    roots.push(root);
    const server = await createWaterConsoleServer({
      dataDir: root,
      address: "127.0.0.1",
      port: 0,
      publicDir: path.resolve("assets/public"),
    });
    try {
      expect(server.getState().catalog?.map((game) => game.id)).toEqual([
        "controller-lab",
      ]);
    } finally {
      await server.close();
    }
  });
});
