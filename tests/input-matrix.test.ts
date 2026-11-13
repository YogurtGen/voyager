import { describe, it, expect } from "vitest";
import { newLocalGame, KEYS, type OutputBinding } from "../src/shared/studio-model";
import { setButtonOutputs } from "../src/shared/binding-tools";
import { resolveBindings } from "../src/shared/studio-engine";
import { validateGame } from "../src/shared/studio-validation";
import { gamepadModel } from "../src/shared/device-models";

const empty = () => ({ buttons: [] as string[], keys: [] as string[], axes: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 } });
const canonical = (key: string) => ({ Shift: "ShiftLeft", Control: "ControlLeft", Alt: "AltLeft" } as Record<string, string>)[key] ?? key;
for (const slot of [1, 2, 3, 4]) {
  describe(`P${slot} complete output matrix`, () => {
    for (const key of KEYS) it(`holds and releases keyboard ${key}`, () => {
      const game = newLocalGame();
      game.inputMethod = "keyboard";
      const mode = game.controller.modes[1], button = mode.controls.find(c => c.label === "A")!;
      setButtonOutputs(game, mode.id, slot, button.id, [{ kind: "key", code: key }]);
      validateGame(game);
      const input = { revision: game.controller.revision, modeId: mode.id, variant: "classic" as const, pressed: [button.id], values: {} };
      expect(resolveBindings(game.controller, game.bindings, "keyboard", slot, input)).toEqual({ ...empty(), keys: [canonical(key)] });
      expect(resolveBindings(game.controller, game.bindings, "keyboard", slot, { ...input, pressed: [] })).toEqual(empty());
    });
    for (const ps of [false, true]) {
      for (const target of gamepadModel(ps).filter(target => target.output)) it(`holds and releases ${ps ? "PlayStation" : "Xbox"} ${target.label}`, () => {
        const game = newLocalGame();
        const mode = game.controller.modes[1], button = mode.controls.find(c => c.label === "A")!, output = target.output as OutputBinding;
        setButtonOutputs(game, mode.id, slot, button.id, [output]);
        validateGame(game);
        const expected = empty();
        if (output.kind === "button") expected.buttons = [output.code];
        if (output.kind === "axis") expected.axes[output.code] = output.value;
        const input = { revision: game.controller.revision, modeId: mode.id, variant: "classic" as const, pressed: [button.id], values: {} };
        expect(resolveBindings(game.controller, game.bindings, "gamepad", slot, input)).toEqual(expected);
        expect(resolveBindings(game.controller, game.bindings, "gamepad", slot, { ...input, pressed: [] })).toEqual(empty());
      });
    }
  });
}
