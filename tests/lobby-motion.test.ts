import { describe, expect, it } from "vitest";
import {
  lobbyStep,
  orbitLayout,
  orbitTravel,
  pathOffset,
  ringAngles,
} from "../src/renderer/lobby-motion";

describe("lobby orbit", () => {
  it("allocates disjoint arcs for full labels and bounds a thousand-game orbit to five labels", () => {
    const titles = Array.from({ length: 1000 }, (_, i) =>
      i % 3 === 0
        ? "Batman™: Arkham Knight · The Complete Edition"
        : "Disney Speedstorm",
    );
    for (const index of [0, 1, 999]) {
      const labels = orbitLayout(titles, index).sort(
        (a, b) => a.angle - b.angle,
      );
      expect(labels.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < labels.length; i++)
        expect(
          labels[i].angle -
            labels[i].arc / 2 -
            (labels[i - 1].angle + labels[i - 1].arc / 2),
        ).toBeGreaterThanOrEqual(7.99);
    }
    const long = orbitLayout(["W".repeat(120), "Another full title"], 0);
    expect(long[0].width).toBeLessThanOrEqual(190);
    expect(orbitTravel(titles, 999, 1)).toBeGreaterThan(0);
  });
  it("keeps a sole game centered and bounds long libraries to the reference arc", () => {
    expect(ringAngles(0)).toEqual([]);
    expect(ringAngles(1)).toEqual([0]);
    expect(ringAngles(5)).toEqual([-66, -33, 0, 33, 66]);
    expect(ringAngles(200)[0]).toBe(-70);
    expect(ringAngles(200).at(-1)).toBe(70);
    expect(pathOffset(0)).toBe(25);
  });
  it("continues rolling forward or backward across the collection seam", () => {
    const ids = ["a", "b", "c", "d", "e"];
    expect(lobbyStep("e", "a", ids)).toBe(1);
    expect(lobbyStep("a", "e", ids)).toBe(-1);
    expect(lobbyStep("a", "d", ids)).toBe(-2);
    expect(lobbyStep("missing", "a", ids)).toBe(0);
  });
});
