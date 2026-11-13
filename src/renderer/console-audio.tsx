import { useEffect, useRef } from "react";
import type { PresentationState } from "../shared/presentation";
export function ConsoleMusic({
  scene,
  value,
  muted,
  onError,
}: {
  scene: "pair" | "library" | "off";
  value: PresentationState;
  muted: boolean;
  onError?: (message: string) => void;
}) {
  const pair = useRef<HTMLAudioElement>(null),
    library = useRef<HTMLAudioElement>(null);
  const reported = useRef("");
  useEffect(() => {
    const enabled = value.settings.music && !muted;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tracks = [
      { element: pair.current, scene: "pair", gain: 1.6 },
      { element: library.current, scene: "library", gain: 0.45 },
    ];
    const starts = tracks.map((t) => t.element?.volume || 0),
      goals = tracks.map((t) =>
        enabled && scene === t.scene
          ? Math.min(1, value.settings.musicVolume * t.gain)
          : 0,
      );
    const play = () =>
      tracks.forEach((t, i) => {
        if (!t.element) return;
        t.element.muted = muted;
        if (goals[i] > 0 && t.element.paused)
          void t.element.play().catch((e) => {
            if (e.name === "AbortError") return;
            const message = `Music could not play: ${e.message}`;
            if (reported.current !== message) {
              reported.current = message;
              onError?.(message);
            }
          });
      });
    play();
    const began = performance.now();
    const fade = () => {
      const t = Math.min(1, (performance.now() - began) / 300);
      tracks.forEach((track, i) => {
        if (track.element) {
          track.element.volume = starts[i] + (goals[i] - starts[i]) * t;
          if (t === 1 && goals[i] === 0) track.element.pause();
        }
      });
      if (t === 1) clearInterval(timer);
    };
    // Audio can keep playing while rendering stops, so gain must not depend on animation frames.
    timer = setInterval(fade, 20);
    document.addEventListener("pointerdown", play);
    document.addEventListener("keydown", play);
    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", play);
      document.removeEventListener("keydown", play);
    };
  }, [scene, value.settings.music, value.settings.musicVolume, muted, onError]);
  useEffect(() => {
    const a = pair.current,
      b = library.current;
    return () => {
      a?.pause();
      b?.pause();
    };
  }, []);
  return (
    <>
      <audio
        hidden
        ref={pair}
        data-audio-bus="music"
        data-track="pair"
        src="waterconsole://app/audio/login.mp3"
        preload="auto"
        loop
      />
      <audio
        hidden
        ref={library}
        data-audio-bus="music"
        data-track="library"
        src="waterconsole://app/audio/lobby.mp3"
        preload="auto"
        loop
      />
    </>
  );
}
