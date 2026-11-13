import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COLLECTION_MOVE_INTERVAL,
  NAVIGATION_HOLD_INTERVAL,
  createNavigationGate,
  createNavigationHold,
} from "../src/shared/navigation-pacing";

afterEach(() => vi.useRealTimers());

describe("collection navigation pacing", () => {
  it("drops a burst without delaying a move until after release", () => {
    const accept = createNavigationGate();
    expect(accept(0)).toBe(true);
    for (let t = 1; t < COLLECTION_MOVE_INTERVAL; t++)
      expect(accept(t)).toBe(false);
    expect(accept(COLLECTION_MOVE_INTERVAL)).toBe(true);
    expect(accept(COLLECTION_MOVE_INTERVAL + 1)).toBe(false);
  });

  it("repeats held navigation independently of OS repeat and stops on release", () => {
    vi.useFakeTimers();
    const move = vi.fn();
    const held = createNavigationHold(move);
    held.start("right");
    for (let i = 0; i < 40; i++) held.start("right");
    expect(move.mock.calls).toEqual([["right"]]);
    vi.advanceTimersByTime(NAVIGATION_HOLD_INTERVAL * 3 + 10);
    expect(move).toHaveBeenCalledTimes(4);
    held.stop("left");
    vi.advanceTimersByTime(NAVIGATION_HOLD_INTERVAL);
    expect(move).toHaveBeenCalledTimes(5);
    held.stop("right");
    vi.advanceTimersByTime(5000);
    expect(move).toHaveBeenCalledTimes(5);
  });

  it("replaces direction and cleanup leaves no repeating work", () => {
    vi.useFakeTimers();
    const move = vi.fn();
    const held = createNavigationHold(move);
    held.start(-1);
    vi.advanceTimersByTime(100);
    held.start(1);
    vi.advanceTimersByTime(NAVIGATION_HOLD_INTERVAL);
    expect(move.mock.calls).toEqual([[-1], [1], [1]]);
    held.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
