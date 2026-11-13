import { describe, it, expect } from "vitest";
import {
  confirmHotwheelsQuit,
  waitForNativeQuit,
} from "../src/electron/hotwheels-quit";
import type { Action } from "../src/shared/types";
function fixture({
  exits = true,
  focused = true,
  early = false,
  loseAfterRight = false,
} = {}) {
  let running = true,
    clock = 0,
    focus = focused;
  const inputs: Action[][] = [];
  return {
    inputs,
    port: {
      requestClose: async () => {
        if (early) running = false;
      },
      isRunning: () => running,
      focused: () => focus,
      input: (buttons: Action[]) => {
        inputs.push([...buttons]);
        if (loseAfterRight && buttons.includes("right")) focus = false;
        if (exits && buttons.includes("confirm")) running = false;
      },
      wait: async (ms: number) => {
        clock += ms;
      },
      now: () => clock,
    },
  };
}
describe("owned HOT WHEELS normal quit confirmation", () => {
  it("selects Yes, confirms, neutralizes and waits for actual process exit", async () => {
    const { inputs, port } = fixture();
    expect(await confirmHotwheelsQuit(port)).toBe(true);
    expect(inputs).toEqual([["right"], [], ["confirm"], []]);
  });
  it("sends no menu input when normal close already exited", async () => {
    const { inputs, port } = fixture({ early: true });
    expect(await confirmHotwheelsQuit(port)).toBe(true);
    expect(inputs).toEqual([]);
  });
  it("keeps the session recoverable when focus is unavailable", async () => {
    const { inputs, port } = fixture({ focused: false });
    expect(await confirmHotwheelsQuit(port)).toBe(false);
    expect(inputs).toEqual([[]]);
  });
  it("releases input and avoids Confirm when focus changes", async () => {
    const { inputs, port } = fixture({ loseAfterRight: true });
    expect(await confirmHotwheelsQuit(port)).toBe(false);
    expect(inputs).toEqual([["right"], []]);
  });
  it("times out without claiming the still-live process closed", async () => {
    const { inputs, port } = fixture({ exits: false });
    expect(await confirmHotwheelsQuit(port)).toBe(false);
    expect(inputs.at(-1)).toEqual([]);
    expect(port.now()).toBeLessThan(7500);
  });
  it("neutralizes when input transport throws", async () => {
    const { port, inputs } = fixture();
    const send = port.input;
    port.input = (buttons) => {
      if (buttons.includes("confirm")) throw new Error("transport");
      send(buttons);
    };
    await expect(confirmHotwheelsQuit(port)).rejects.toThrow("transport");
    expect(inputs.at(-1)).toEqual([]);
  });
});

describe("owned native normal close verification", () => {
  it("accepts an observed exit without sending game input", async () => {
    const { port, inputs } = fixture({ early: true });
    expect(await waitForNativeQuit(port)).toBe(true);
    expect(inputs).toEqual([]);
  });
  it("preserves a still-open game without choosing an unobserved dialog", async () => {
    const { port, inputs } = fixture({ exits: false });
    expect(await waitForNativeQuit(port)).toBe(false);
    expect(inputs).toEqual([]);
    expect(port.now()).toBe(6000);
  });
});
