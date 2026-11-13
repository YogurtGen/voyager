import { useEffect, useRef } from "react";
import {
  createNavigationGate,
  createNavigationHold,
} from "../shared/navigation-pacing";
import {
  indexAt,
  offsetOf,
  poseOf,
  releaseTarget,
  springOf,
  springStep,
  targetFor,
} from "./vendor/disc-motion-reference";

export const DISC_MOTION = {
  spacing: 1.02,
  rise: 0.24,
  depth: 0.42,
  yaw: 22,
  fan: -10,
  tilt: -6,
  roll: 110,
  bounce: 0.22,
  duration: 0.9,
};
type Sample = { t: number; x: number };
type Drag = {
  id: number;
  x0: number;
  pos0: number;
  moved: boolean;
  samples: Sample[];
};
type Motor = {
  a: number;
  va: number;
  b: number;
  vb: number;
  target: number;
  published: number;
  raf: number;
  last: number;
  size: number;
  reduced: boolean;
  drag: Drag | null;
  clickBlock: boolean;
  wheel: number;
  wheelAt: number;
  stepAt: number;
};
export function discPose(
  item: number,
  position: number,
  trailing: number,
  count: number,
) {
  const pose = poseOf(
    offsetOf(item, position, count, true),
    offsetOf(item, trailing, count, true),
    DISC_MOTION,
  );
  return {
    transform: `translate3d(calc(${pose.x.toFixed(4)} * var(--disc-size)),calc(${pose.y.toFixed(4)} * var(--disc-size)),calc(${pose.z.toFixed(4)} * var(--disc-size))) rotateZ(-6deg) rotateY(${pose.yaw.toFixed(3)}deg) rotateX(8deg)`,
    roll: `${pose.roll.toFixed(2)}deg`,
    glint: `${(pose.yaw * 3 + pose.x * 40).toFixed(1)}deg`,
    zIndex: pose.zIndex,
    opacity: pose.opacity,
    hidden: pose.hidden || pose.opacity <= 0,
  };
}
export function useDiscMotion(
  count: number,
  selected: number,
  motion: "system" | "full" | "reduced",
  onIndex: (index: number) => void,
) {
  const root = useRef<HTMLElement>(null),
    stage = useRef<HTMLDivElement>(null),
    slides = useRef<(HTMLButtonElement | null)[]>([]);
  const motor = useRef<Motor>({
    a: selected,
    va: 0,
    b: selected,
    vb: 0,
    target: selected,
    published: selected,
    raf: 0,
    last: 0,
    size: 300,
    reduced: false,
    drag: null,
    clickBlock: false,
    wheel: 0,
    wheelAt: 0,
    stepAt: 0,
  }).current;
  const options = useRef({ count, selected, motion, onIndex });
  options.current = { count, selected, motion, onIndex };
  const acceptMove = useRef(createNavigationGate()).current;
  const notifyIndex = (next: number) => {
    if (next !== motor.published) {
      motor.published = next;
      options.current.onIndex(next);
    }
  };
  const paint = () => {
    slides.current.forEach((element, i) => {
      if (!element) return;
      const p = discPose(i, motor.a, motor.b, options.current.count);
      element.style.visibility = p.hidden ? "hidden" : "";
      if (p.hidden) return;
      element.style.transform = p.transform;
      element.style.zIndex = String(p.zIndex);
      element.style.opacity = p.opacity < 1 ? p.opacity.toFixed(3) : "";
      element.style.setProperty("--disc-roll", p.roll);
      element.style.setProperty("--disc-glint", p.glint);
    });
  };
  const frame = (time: number) => {
    const dt = Math.min((time - (motor.last || time)) / 1000, 0.05);
    motor.last = time;
    const spring = springOf(DISC_MOTION.bounce, DISC_MOTION.duration);
    if (motor.reduced && !motor.drag) {
      motor.a = motor.b = motor.target;
      motor.va = motor.vb = 0;
    } else {
      if (!motor.drag)
        [motor.a, motor.va] = springStep(
          motor.a,
          motor.va,
          motor.target,
          spring.omega,
          spring.slide,
          dt,
        );
      [motor.b, motor.vb] = springStep(
        motor.b,
        motor.vb,
        motor.a,
        spring.omega * 1.05,
        spring.tilt,
        dt,
      );
    }
    paint();
    if (
      !motor.drag &&
      Math.abs(motor.a - motor.target) < 0.001 &&
      Math.abs(motor.va) < 0.01 &&
      Math.abs(motor.b - motor.a) < 0.001 &&
      Math.abs(motor.vb) < 0.01
    ) {
      motor.a = motor.b = motor.target;
      motor.va = motor.vb = 0;
      paint();
      motor.raf = 0;
      motor.last = 0;
      return;
    }
    motor.raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!motor.raf) motor.raf = requestAnimationFrame(frame);
  };
  const setTarget = (target: number) => {
    if (!options.current.count) return;
    motor.target = target;
    const next = indexAt(target, options.current.count, true);
    notifyIndex(next);
    kick();
  };
  const moveTo = (index: number) => {
    const target = targetFor(index, motor.target, options.current.count, true);
    if (Math.abs(target - motor.a) > 6) {
      motor.a = motor.b = target;
      motor.va = motor.vb = 0;
    }
    setTarget(target);
  };
  const goTo = (index: number) => {
    if (!motor.drag && acceptMove(performance.now())) moveTo(index);
  };
  const step = (direction: number) => {
    if (!motor.drag && acceptMove(performance.now()))
      setTarget(Math.round(motor.target) + Math.sign(direction));
  };
  const heldStep = useRef(createNavigationHold(step)).current;
  useEffect(() => {
    if (!motor.drag && count && indexAt(motor.target, count, true) !== selected)
      moveTo(selected);
  }, [selected, count]);
  useEffect(() => {
    motor.a = motor.b = motor.target = motor.published = selected;
    motor.va = motor.vb = 0;
    motor.drag = null;
    root.current?.removeAttribute("data-dragging");
    paint();
  }, [count]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      motor.reduced =
        options.current.motion === "reduced" ||
        (options.current.motion === "system" && media.matches);
      kick();
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [motion]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      motor.size = element.offsetWidth || 300;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-disc-ui]")
      )
        return;
      event.preventDefault();
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      const now = performance.now();
      if (now - motor.wheelAt > 160) motor.wheel = 0;
      motor.wheelAt = now;
      motor.wheel += delta;
      if (Math.abs(motor.wheel) > 50 && now - motor.stepAt > 320) {
        step(Math.sign(motor.wheel));
        motor.wheel = 0;
        motor.stepAt = now;
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const stop = () => heldStep.stop();
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(motor.raf);
      stop();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return {
    renderedIndices:
      count <= 20
        ? Array.from({ length: count }, (_, i) => i)
        : [
            ...new Set(
              [selected, indexAt(motor.a, count, true)].flatMap((center) =>
                Array.from(
                  { length: 13 },
                  (_, i) => (center + i - 6 + count) % count,
                ),
              ),
            ),
          ].sort((a, b) => a - b),
    root,
    stage,
    slides,
    goTo,
    step,
    startHold: heldStep.start,
    stopHold: heldStep.stop,
    pose: (item: number) =>
      discPose(item, motor.a, motor.b, options.current.count),
    pointerDown(event: React.PointerEvent<HTMLElement>) {
      if (
        event.button !== 0 ||
        !count ||
        !(event.target instanceof Element) ||
        event.target.closest("[data-disc-ui]")
      )
        return;
      motor.drag = {
        id: event.pointerId,
        x0: event.clientX,
        pos0: motor.a,
        moved: false,
        samples: [{ t: event.timeStamp, x: event.clientX }],
      };
    },
    pointerMove(event: React.PointerEvent<HTMLElement>) {
      const drag = motor.drag;
      if (event.pointerType === "mouse" && !drag?.moved) {
        const bounds = stage.current?.getBoundingClientRect();
        if (bounds) {
          const x = Math.max(
              -1,
              Math.min(
                1,
                (event.clientX - (bounds.left + bounds.width / 2)) /
                  bounds.width,
              ),
            ),
            y = Math.max(
              -1,
              Math.min(
                1,
                (event.clientY - (bounds.top + bounds.height / 2)) /
                  bounds.height,
              ),
            );
          const active = slides.current[options.current.selected];
          active?.style.setProperty("--disc-px", x.toFixed(3));
          active?.style.setProperty("--disc-py", y.toFixed(3));
        }
      }
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved) {
        if (Math.abs(event.clientX - drag.x0) < 6) return;
        drag.moved = true;
        drag.x0 = event.clientX;
        drag.pos0 = motor.a;
        motor.va = 0;
        root.current?.setPointerCapture(event.pointerId);
        root.current?.setAttribute("data-dragging", "");
      }
      motor.a =
        drag.pos0 -
        (event.clientX - drag.x0) / (motor.size * DISC_MOTION.spacing);
      drag.samples.push({ t: event.timeStamp, x: event.clientX });
      if (drag.samples.length > 6) drag.samples.shift();
      const next = indexAt(motor.a, count, true);
      notifyIndex(next);
      kick();
    },
    pointerUp(event: React.PointerEvent<HTMLElement>) {
      const drag = motor.drag;
      if (!drag || drag.id !== event.pointerId) return;
      motor.drag = null;
      if (!drag.moved) return;
      root.current?.removeAttribute("data-dragging");
      motor.clickBlock = true;
      setTimeout(() => {
        motor.clickBlock = false;
      }, 0);
      const first = drag.samples[0],
        last = drag.samples.at(-1)!;
      const speed =
        event.type === "pointercancel"
          ? 0
          : (-(last.x - first.x) /
              Math.max(last.t - first.t, 1) /
              (motor.size * DISC_MOTION.spacing)) *
            1000;
      motor.va = speed;
      setTarget(releaseTarget(motor.a, speed, count, true));
    },
    pointerLeave() {
      for (const el of slides.current) {
        el?.style.setProperty("--disc-px", "0");
        el?.style.setProperty("--disc-py", "0");
      }
    },
    click(index: number, open: () => void) {
      if (motor.clickBlock) return;
      if (index === options.current.selected) open();
      else goTo(index);
    },
  };
}
