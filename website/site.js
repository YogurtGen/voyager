import {
  indexAt,
  offsetOf,
  poseOf,
  springOf,
  springStep,
  releaseTarget,
  targetFor,
} from "./disc-motion.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let userPaused = false,
  paused = reduced.matches,
  heroVisible = true,
  space = null;
try {
  userPaused = localStorage.getItem("voyager-motion") === "paused";
} catch {}

const menuButton = $(".menu-toggle"),
  navigation = $("#navigation");
function closeMenu(restoreFocus = false) {
  menuButton.setAttribute("aria-expanded", "false");
  navigation.removeAttribute("data-open");
  if (restoreFocus) menuButton.focus();
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  navigation.toggleAttribute("data-open", open);
});
navigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuButton.getAttribute("aria-expanded") === "true"
  )
    closeMenu(true);
});
const mobile = matchMedia("(max-width: 780px)");
mobile.addEventListener("change", () => closeMenu());

function updateSpace() {
  space?.setRunning(!paused && heroVisible && !document.hidden);
}
function applyMotion() {
  paused = reduced.matches || userPaused;
  document.documentElement.classList.toggle("motion-paused", paused);
  const button = $("#motion-toggle");
  button.disabled = reduced.matches;
  button.setAttribute("aria-pressed", String(paused));
  button.querySelector("span").textContent = reduced.matches
    ? "Reduced motion"
    : paused
      ? "Resume motion"
      : "Pause motion";
  button
    .querySelector("use")
    .setAttribute("href", paused ? "#i-play" : "#i-pause");
  if (paused) {
    $$(".hero-copy, [data-reveal]").forEach((element) =>
      element.getAnimations().forEach((animation) => animation.finish()),
    );
    $(".probe-wrap").style.transform = "";
  }
  updateSpace();
  document.dispatchEvent(new Event("voyager-motion"));
}
$("#motion-toggle").addEventListener("click", () => {
  userPaused = !userPaused;
  try {
    localStorage.setItem("voyager-motion", userPaused ? "paused" : "full");
  } catch {}
  applyMotion();
});
reduced.addEventListener("change", applyMotion);
applyMotion();
const heroObserver = new IntersectionObserver((entries) => {
  heroVisible = entries[0].isIntersecting;
  updateSpace();
  $(".hero-art").style.animationPlayState = heroVisible ? "" : "paused";
  $(".hero-art").classList.toggle("offscreen", !heroVisible);
});
heroObserver.observe($(".hero"));
document.addEventListener("visibilitychange", () => {
  updateSpace();
  if (document.hidden) resetInput();
});

if (!reduced.matches && matchMedia("(min-width: 781px)").matches) {
  const loadSpace = async () => {
    try {
      const { createSpace } = await import("./space.js");
      space = createSpace($("#space-canvas"));
      updateSpace();
    } catch {
      $("#space-canvas").hidden = true;
    }
  };
  if ("requestIdleCallback" in window)
    requestIdleCallback(loadSpace, { timeout: 1500 });
  else setTimeout(loadSpace, 350);
}

let parallaxFrame = 0;
$(".hero").addEventListener("pointermove", (event) => {
  if (paused || !heroVisible || event.pointerType !== "mouse" || parallaxFrame)
    return;
  const rect = $(".hero").getBoundingClientRect(),
    x = event.clientX / rect.width - 0.5,
    y = (event.clientY - rect.top) / rect.height - 0.5;
  parallaxFrame = requestAnimationFrame(() => {
    $(".probe-wrap").style.transform =
      `rotateY(${x * 7}deg) rotateX(${-y * 6}deg) translate3d(${x * 12}px,${y * 10}px,25px)`;
    parallaxFrame = 0;
  });
});
$(".hero").addEventListener("pointerleave", () => {
  cancelAnimationFrame(parallaxFrame);
  parallaxFrame = 0;
  $(".probe-wrap").style.transform = "";
});

const reveals = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      if (entry.isIntersecting) {
        if (!paused)
          entry.target.animate(
            [
              { opacity: 0.12, transform: "translateY(24px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 700, easing: "cubic-bezier(.23,1,.32,1)" },
          );
        reveals.unobserve(entry.target);
      }
  },
  { threshold: 0.12 },
);
$$("[data-reveal]").forEach((element) => reveals.observe(element));
if (!paused)
  $(".hero-copy").animate(
    [
      { opacity: 0, transform: "translateY(18px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 900, easing: "cubic-bezier(.23,1,.32,1)" },
  );

const tabs = $$(".preview-tabs [role=tab]");
function selectTab(tab, keyboard = false) {
  tabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    $("#" + item.getAttribute("aria-controls")).hidden = !active;
  });
  const panel = $("#" + tab.getAttribute("aria-controls"));
  panel.getAnimations().forEach((animation) => animation.cancel());
  if (!paused && !keyboard)
    panel.animate(
      [
        { opacity: 0.3, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 250, easing: "cubic-bezier(.23,1,.32,1)" },
    );
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    let next = i;
    if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (i + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next], true);
    tabs[next].focus();
  });
});

const carousel = $(".disc-carousel"),
  slides = $$("[data-disc]");
const options = {
  spacing: 1.02,
  rise: 0.24,
  depth: 0.42,
  yaw: 22,
  fan: -10,
  tilt: -6,
  roll: 110,
};
const spring = springOf(0.22, 0.9);
const captions = [
  [
    "Controller Lab",
    "Your first stop. Try your phone controls before adding a game.",
  ],
  [
    "Your game collection",
    "Bring games you already own, then add artwork, trailers and a layout.",
  ],
  [
    "Your custom controls",
    "Build a phone controller around the way each game is played.",
  ],
];
let a = 0,
  b = 0,
  va = 0,
  vb = 0,
  target = 0,
  frame = 0,
  last = 0,
  drag = null,
  blockClick = false;
function paintDiscs() {
  const size = $(".disc-stage").offsetWidth;
  slides.forEach((element, i) => {
    const pose = poseOf(
      offsetOf(i, a, 3, true),
      offsetOf(i, b, 3, true),
      options,
    );
    element.style.transform = `translate3d(${pose.x * size}px,${pose.y * size}px,${pose.z * size}px) rotateZ(-6deg) rotateY(${pose.yaw}deg) rotateX(8deg)`;
    element.style.zIndex = String(pose.zIndex);
    element.style.opacity = String(pose.opacity);
    element.style.visibility = pose.hidden ? "hidden" : "visible";
  });
}
function caption() {
  const index = indexAt(target, 3, true);
  $("#disc-title").textContent = captions[index][0];
  $("#disc-description").textContent = captions[index][1];
  $("#disc-count").textContent = `0${index + 1} / 03`;
  slides.forEach((slide, i) => {
    slide.setAttribute("aria-current", String(i === index));
    slide.tabIndex = i === index ? 0 : -1;
  });
}
function animateDiscs(now) {
  const dt = Math.min((now - (last || now)) / 1000, 0.05);
  last = now;
  if (paused) {
    a = b = target;
    va = vb = 0;
  } else {
    if (!drag)
      [a, va] = springStep(a, va, target, spring.omega, spring.slide, dt);
    [b, vb] = springStep(b, vb, a, spring.omega * 1.05, spring.tilt, dt);
  }
  paintDiscs();
  if (
    !drag &&
    Math.abs(a - target) + Math.abs(b - a) + Math.abs(va) + Math.abs(vb) < 0.015
  ) {
    a = b = target;
    va = vb = 0;
    paintDiscs();
    frame = last = 0;
    return;
  }
  frame = requestAnimationFrame(animateDiscs);
}
function kick() {
  if (!frame) frame = requestAnimationFrame(animateDiscs);
}
function go(index) {
  target = targetFor(index, target, 3, true);
  caption();
  kick();
}
$("#disc-prev").addEventListener("click", () =>
  go(indexAt(target - 1, 3, true)),
);
$("#disc-next").addEventListener("click", () =>
  go(indexAt(target + 1, 3, true)),
);
slides.forEach((slide, i) =>
  slide.addEventListener("click", () => {
    if (!blockClick) go(i);
  }),
);
carousel.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? 2
        : indexAt(target + (event.key === "ArrowRight" ? 1 : -1), 3, true);
  target = targetFor(index, target, 3, true);
  a = b = target;
  va = vb = 0;
  caption();
  paintDiscs();
  slides[index].focus({ preventScroll: true });
});
$(".disc-stage").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const slide = event.target.closest("[data-disc]");
  if (!slide) return;
  drag = {
    id: event.pointerId,
    x: event.clientX,
    start: a,
    lastX: event.clientX,
    lastTime: performance.now(),
    velocity: 0,
    moved: false,
    element: slide,
  };
  slide.setPointerCapture(event.pointerId);
  va = 0;
  blockClick = false;
});
carousel.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const now = performance.now(),
    dx = event.clientX - drag.x;
  if (Math.abs(dx) > 6) drag.moved = true;
  if (!drag.moved) return;
  const size = $(".disc-stage").offsetWidth;
  drag.velocity =
    -(event.clientX - drag.lastX) /
    size /
    Math.max((now - drag.lastTime) / 1000, 0.008);
  a = drag.start - dx / size;
  target = a;
  drag.lastX = event.clientX;
  drag.lastTime = now;
  kick();
});
function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const moved = drag.moved,
    velocity = performance.now() - drag.lastTime < 100 ? drag.velocity : 0;
  if (moved) target = releaseTarget(a, velocity, 3, true);
  else target = Math.round(target);
  drag = null;
  blockClick = moved;
  caption();
  kick();
  setTimeout(() => {
    blockClick = false;
  }, 0);
}
carousel.addEventListener("pointerup", endDrag);
carousel.addEventListener("pointercancel", endDrag);
document.addEventListener("voyager-motion", () => {
  if (paused) {
    drag = null;
    target = Math.round(target);
    caption();
  }
  kick();
});
new ResizeObserver(paintDiscs).observe($(".disc-stage"));
caption();
paintDiscs();
const carouselObserver = new IntersectionObserver((entries) =>
  carousel.classList.toggle("offscreen", !entries[0].isIntersecting),
);
carouselObserver.observe(carousel);
const connectionObserver = new IntersectionObserver((entries) =>
  entries[0].target.classList.toggle("offscreen", !entries[0].isIntersecting),
);
connectionObserver.observe($(".connection-map"));

const keys = new Set();
let px = 0,
  py = 0,
  inputFrame = 0,
  inputLast = 0,
  jump = null;
const arena = $("#lab-arena"),
  player = $("#lab-player");
function paintPlayer() {
  player.style.translate = `${px}px ${py}px`;
}
function movePlayer(direction, distance = 12) {
  const maxX = Math.max(0, arena.clientWidth / 2 - 35),
    maxY = Math.max(0, arena.clientHeight / 2 - 75);
  px = Math.max(
    -maxX,
    Math.min(
      maxX,
      px +
        (direction === "right"
          ? distance
          : direction === "left"
            ? -distance
            : 0),
    ),
  );
  py = Math.max(
    -maxY,
    Math.min(
      maxY,
      py +
        (direction === "down" ? distance : direction === "up" ? -distance : 0),
    ),
  );
  paintPlayer();
  $("#lab-status").textContent = "Moving " + direction + ".";
}
function inputLoop(now) {
  const dt = inputLast ? Math.min(now - inputLast, 40) : 16;
  inputLast = now;
  keys.forEach((key) => movePlayer(key, dt * 0.12));
  if (keys.size) inputFrame = requestAnimationFrame(inputLoop);
  else inputFrame = inputLast = 0;
}
function resetInput() {
  keys.clear();
  cancelAnimationFrame(inputFrame);
  inputFrame = inputLast = 0;
  $$("[data-direction]").forEach((button) =>
    button.removeAttribute("data-active"),
  );
  if (drag) {
    drag = null;
    target = Math.round(a);
    caption();
    kick();
  }
}
$$("[data-direction]").forEach((button) => {
  const direction = button.dataset.direction;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    movePlayer(direction);
    keys.add(direction);
    button.setAttribute("data-active", "");
    if (!inputFrame) inputFrame = requestAnimationFrame(inputLoop);
  });
  const release = () => {
    keys.delete(direction);
    button.removeAttribute("data-active");
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("click", (event) => {
    if (event.detail === 0) movePlayer(direction);
  });
});
function jumpPlayer() {
  jump?.cancel();
  $("#lab-status").textContent = "A: jump!";
  if (!paused)
    jump = player.animate(
      [
        { transform: "translate(-50%,-50%)" },
        {
          transform: "translate(-50%,calc(-50% - 35px)) scale(.96,1.04)",
          offset: 0.45,
        },
        { transform: "translate(-50%,-50%)" },
      ],
      { duration: 550, easing: "ease-out" },
    );
}
$("#lab-jump").addEventListener("click", jumpPlayer);
$("#lab-reset").addEventListener("click", () => {
  resetInput();
  jump?.cancel();
  px = py = 0;
  paintPlayer();
  $("#lab-status").textContent = "B: back to the start.";
});
const directionKeys = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
arena.addEventListener("keydown", (event) => {
  if (event.key in directionKeys) {
    event.preventDefault();
    if (!keys.has(directionKeys[event.key]))
      movePlayer(directionKeys[event.key]);
    keys.add(directionKeys[event.key]);
    if (!inputFrame) inputFrame = requestAnimationFrame(inputLoop);
  } else if (["a", "A", " "].includes(event.key)) {
    event.preventDefault();
    if (!event.repeat) jumpPlayer();
  } else if (["b", "B"].includes(event.key)) {
    event.preventDefault();
    $("#lab-reset").click();
  }
});
arena.addEventListener("keyup", (event) => {
  if (event.key in directionKeys) {
    event.preventDefault();
    keys.delete(directionKeys[event.key]);
  }
});
arena.addEventListener("blur", resetInput);
window.addEventListener("blur", resetInput);
new ResizeObserver(() => {
  resetInput();
  px = py = 0;
  paintPlayer();
}).observe(arena);
const labObserver = new IntersectionObserver((entries) => {
  if (!entries[0].isIntersecting) resetInput();
});
labObserver.observe(arena);

$("#copy-prompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#game-prompt").textContent);
    $("#clipboard-status").textContent =
      "Copied. Paste it into Codex or Claude Code.";
  } catch {
    $("#clipboard-status").textContent =
      "Select the prompt above and copy it manually; clipboard access was unavailable.";
  }
});

async function refreshRelease() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/YogurtGen/voyager/releases/latest",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error("Release metadata unavailable");
    const release = await response.json();
    if (release.draft || release.prerelease || !Array.isArray(release.assets))
      throw new Error("No stable release");
    const valid = (asset) =>
      typeof asset.browser_download_url === "string" &&
      asset.browser_download_url.startsWith(
        "https://github.com/YogurtGen/voyager/releases/download/",
      );
    const installer = release.assets.find(
      (asset) =>
        /^Voyager-Setup-[\d.]+-x64\.exe$/.test(asset.name) && valid(asset),
    );
    const portable = release.assets.find(
      (asset) => /^Voyager-[\d.]+-x64\.zip$/.test(asset.name) && valid(asset),
    );
    const source = release.assets.find(
      (asset) =>
        /^Voyager-[\d.]+-source\.zip$/.test(asset.name) && valid(asset),
    );
    if (installer) {
      $("#installer-link").href = installer.browser_download_url;
      $("#release-meta").textContent =
        `${release.tag_name} · Windows 10/11 x64 · ${(installer.size / 1048576).toFixed(0)} MB installer`;
    }
    if (portable) $("#portable-link").href = portable.browser_download_url;
    if (source) $("#source-link").href = source.browser_download_url;
  } catch {
    $("#release-meta").textContent =
      "Verified v0.1.0 · Windows 10/11 x64 · See releases for current details";
  }
}
refreshRelease();
window.addEventListener("pagehide", (event) => {
  resetInput();
  cancelAnimationFrame(frame);
  cancelAnimationFrame(parallaxFrame);
  frame = 0;
  space?.setRunning(false);
  if (!event.persisted) space?.dispose();
});
window.addEventListener("pageshow", updateSpace);
