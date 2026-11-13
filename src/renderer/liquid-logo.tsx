import { useEffect, useRef, useState } from "react";
import {
  createGlassRenderer,
  loadGlassLogo,
  glassDefaults,
  glassFrameAt,
} from "./vendor/liquid-glass-reference";
import { Mark } from "./ui";
import { VOYAGER_MARK_SVG as logo } from "../shared/brand";
export function LiquidLogo({
  startedAt,
  duration,
  reduced,
  onReady,
  showWordmark,
}: {
  startedAt: number | null;
  duration: number;
  reduced: boolean;
  onReady: () => void;
  showWordmark: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<any>(null),
    [fallback, setFallback] = useState(reduced);
  const latest = useRef({ startedAt, duration, onReady });
  latest.current = { startedAt, duration, onReady };
  useEffect(() => {
    if (reduced) {
      setFallback(true);
      latest.current.onReady();
      return;
    }
    let active = true,
      raf = 0;
    const settings = {
      ...glassDefaults,
      background: "#05070d",
      plateColor: "#0b1226",
      logoColor: "#f4f7ff",
      logoScale: 0.6,
      finalScale: 0.8,
      startZoom: 2.3,
    };
    const render = (now: number) => {
      if (!active || !canvas.current || !engine.current) return;
      const c = canvas.current,
        ratio = Math.min(devicePixelRatio || 1, 2),
        width = Math.round(c.clientWidth * ratio),
        height = Math.round(c.clientHeight * ratio);
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
      }
      const time =
        latest.current.startedAt === null
          ? 0
          : Math.min(
              3.5,
              ((now - latest.current.startedAt) / latest.current.duration) *
                3.5,
            );
      engine.current.render(
        glassFrameAt(time, settings, 0),
        width,
        height,
        Math.min(360, Math.min(c.clientWidth, c.clientHeight) / 1.75) * ratio,
      );
      if (time < 3.5) raf = requestAnimationFrame(render);
    };
    const failed = () => {
      if (active) {
        setFallback(true);
        latest.current.onReady();
      }
    };
    try {
      engine.current = createGlassRenderer(canvas.current);
      if (!engine.current) {
        failed();
        return;
      }
      loadGlassLogo(logo)
        .then((data: unknown) => {
          if (!active) return;
          engine.current.setLogo(data);
          latest.current.onReady();
          raf = requestAnimationFrame(render);
        })
        .catch(failed);
    } catch {
      failed();
    }
    const lost = (event: Event) => {
      event.preventDefault();
      failed();
    };
    canvas.current?.addEventListener("webglcontextlost", lost);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      canvas.current?.removeEventListener("webglcontextlost", lost);
      engine.current?.dispose();
      engine.current = null;
    };
  }, [reduced]);
  return (
    <div
      className="liquid-logo"
      data-renderer={fallback ? "fallback" : "webgl2"}
    >
      {!fallback && <canvas ref={canvas} aria-hidden="true" />}
      {fallback && (
        <div className="liquid-logo-fallback">
          <Mark size={150} />
        </div>
      )}
      <span
        className="liquid-logo-wordmark"
        data-visible={showWordmark}
        aria-hidden={!showWordmark}
      >
        VOYAGER
      </span>
    </div>
  );
}
