import { flushSync } from "react-dom";
import "./scene-transition.css";

let active: ViewTransition | undefined;
let sequence = 0;
export function transitionUI(
  update: () => void,
  kind:
    | "disc"
    | "panel"
    | "studio"
    | "game-next"
    | "game-prev"
    | "pair-home"
    | "home-pair" = "panel",
) {
  const reduced =
    document.documentElement.dataset.motion === "reduced" ||
    (document.documentElement.dataset.motion !== "full" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!document.startViewTransition || reduced || document.hidden) {
    flushSync(update);
    return;
  }
  active?.skipTransition();
  const id = ++sequence;
  document.documentElement.dataset.sceneTransition = kind;
  const oldRoll = Number(
    document.querySelector(".lobby-disc")?.getAttribute("data-roll") || 0,
  );
  const oldOrbit = Number(
    document.querySelector(".lobby-game-orbit")?.getAttribute("data-angle") ||
      0,
  );
  active = document.startViewTransition(() => {
    flushSync(update);
    if (kind.startsWith("game-")) {
      const roll = Number(
        document.querySelector(".lobby-disc")?.getAttribute("data-roll") || 0,
      );
      const orbit = Number(
        document
          .querySelector(".lobby-game-orbit")
          ?.getAttribute("data-angle") || 0,
      );
      document.documentElement.style.setProperty(
        "--game-disc-step",
        `${roll - oldRoll}deg`,
      );
      document.documentElement.style.setProperty(
        "--game-ring-step",
        `${oldOrbit - orbit}deg`,
      );
    }
  });
  void active.ready.catch(() => {});
  void active.finished
    .catch(() => {})
    .finally(() => {
      if (sequence === id) {
        active = undefined;
        delete document.documentElement.dataset.sceneTransition;
        document.documentElement.style.removeProperty("--game-disc-step");
        document.documentElement.style.removeProperty("--game-ring-step");
      }
    });
}
