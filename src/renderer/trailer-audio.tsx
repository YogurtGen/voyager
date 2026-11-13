import { useEffect, useRef, type RefObject } from "react";
export function TrailerAudio({
  video,
  src,
  playing,
  muted,
  volume,
  onError,
}: {
  video: RefObject<HTMLVideoElement | null>;
  src: string;
  playing: boolean;
  muted: boolean;
  volume: number;
  onError: (message: string) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null),
    latest = useRef({ playing, muted, volume, onError });
  latest.current = { playing, muted, volume, onError };
  useEffect(() => {
    const v = video.current,
      a = audio.current;
    if (!v || !a) return;
    let active = true,
      failed = false;
    const pause = () => a.pause();
    const sync = () => {
      a.muted = latest.current.muted;
      a.volume = latest.current.volume;
      a.playbackRate = v.playbackRate;
      if (
        !latest.current.playing ||
        v.paused ||
        v.seeking ||
        v.readyState < 2 ||
        failed
      ) {
        pause();
        return;
      }
      if (a.readyState >= 1 && Math.abs(a.currentTime - v.currentTime) > 0.2)
        a.currentTime = v.currentTime;
      if (a.paused)
        void a.play().catch((e) => {
          if (active && e.name !== "AbortError")
            latest.current.onError(
              `Trailer audio could not play: ${e.message}`,
            );
        });
    };
    const metadata = () => {
      if (
        Number.isFinite(a.duration) &&
        Number.isFinite(v.duration) &&
        Math.abs(a.duration - v.duration) > 2
      ) {
        failed = true;
        pause();
        latest.current.onError(
          "Trailer audio does not match this video. Replace the trailer through Edit game.",
        );
        return;
      }
      sync();
    };
    for (const name of ["playing", "timeupdate", "seeked", "ratechange"])
      v.addEventListener(name, sync);
    for (const name of ["pause", "waiting", "stalled", "seeking", "ended"])
      v.addEventListener(name, pause);
    a.addEventListener("loadedmetadata", metadata);
    sync();
    return () => {
      active = false;
      pause();
      for (const name of ["playing", "timeupdate", "seeked", "ratechange"])
        v.removeEventListener(name, sync);
      for (const name of ["pause", "waiting", "stalled", "seeking", "ended"])
        v.removeEventListener(name, pause);
      a.removeEventListener("loadedmetadata", metadata);
    };
  }, [src, playing, video]);
  useEffect(() => {
    if (audio.current) {
      audio.current.muted = muted;
      audio.current.volume = volume;
    }
  }, [muted, volume]);
  return (
    <audio
      hidden
      ref={audio}
      data-audio-bus="trailer"
      src={src}
      preload="auto"
      loop
      muted={muted}
      onError={() =>
        onError(
          "Trailer audio is unavailable. Replace the trailer through Edit game.",
        )
      }
    />
  );
}
