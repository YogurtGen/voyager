// @ts-nocheck
// Adapted from Liquid Glass Logo Reveal by Denis Kuzin, based on zanwei/glass-icon-reveal (MIT).
// Exact public demo renderer/shaders; see research/21st-public/logo/SOURCE.json.
// React wrapper and external fonts/tracking are excluded.
const i = (value, _name) => value;
const jd = {
    tileSize: 256,
    logoScale: 0.7,
    finalScale: 0.69,
    logoOffset: [0, 0],
    iconPlate: !1,
    keepPlate: !1,
    originalColors: !1,
    opticalDepth: 1.1,
    dispersion: 1.7,
    colorBleed: 1.25,
    doubleBevel: 1,
    bevelWidth: 0.14,
    corner: 4.8,
    cornerPull: 2.1,
    cornerWidth: 2.2,
    cornerFocus: 0.58,
    edgeSmear: 2.85,
    stretch: 0,
    tilt: 0.35,
    bulge: 1,
    specular: 1,
    halo: 0,
    shadow: 1,
    ripple: 1,
    bounce: 0,
    response: 0.42,
    startSize: 0.2,
    startZoom: 2.6,
    glide: 2.3,
    present: 2.4,
    drift: 0.12,
    swell: 0.5,
    focus: 1,
    sheen: 1,
    lightTurn: 0.9,
    hold: 1,
    background: "#e9e9eb",
    plateColor: "#ffffff",
    logoColor: "#0e1428",
  },
  qg = {
    light: jd,
    dark: {
      ...jd,
      logoScale: 0.72,
      finalScale: 1,
      iconPlate: !0,
      halo: 1,
      shadow: 0,
      ripple: 0.5,
      startZoom: 1.6,
      drift: 0.05,
      opticalDepth: 0.75,
      bevelWidth: 0.22,
      dispersion: 0.9,
      colorBleed: 0.45,
      corner: 5,
      cornerPull: 1.4,
      edgeSmear: 1.2,
      tilt: 0,
      cornerWidth: 1.2,
      cornerFocus: 0.4,
      background: "#000000",
      plateColor: "#05070b",
      logoColor: "#ffffff",
    },
  },
  ot = 1024,
  li = 0.75;
function Lg(o) {
  return new Promise((r, g) => {
    const s = new Image();
    (o.startsWith("data:") || (s.crossOrigin = "anonymous"),
      (s.onload = () => r(s)),
      (s.onerror = () =>
        g(new Error("GlassIconReveal: the logo could not be loaded"))),
      (s.src = o));
  });
}
i(Lg, "loadImage");
function Yg(o) {
  return o.trimStart().startsWith("<");
}
i(Yg, "isMarkup");
function Xg(o) {
  const r = new DOMParser().parseFromString(o, "image/svg+xml").documentElement;
  if (!r || r.nodeName.toLowerCase() !== "svg")
    throw new Error("GlassIconReveal: the SVG could not be read");
  let g = parseFloat(r.getAttribute("width") || ""),
    s = parseFloat(r.getAttribute("height") || "");
  const T = (r.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  (T.length === 4 && T[2] > 0 && T[3] > 0 && ([g, s] = [T[2], T[3]]),
    (g > 0 && s > 0) || (g = s = 100));
  const A = ot / Math.max(g, s);
  (r.setAttribute("width", String(Math.round(g * A))),
    r.setAttribute("height", String(Math.round(s * A))));
  const R = new XMLSerializer()
    .serializeToString(r)
    .replace(/currentColor/g, "#ffffff");
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(R);
}
i(Xg, "svgToUrl");
const f0 = i((o) => (Yg(o) ? Xg(o) : o), "logoUrl");
function jg(o, r, g) {
  const s = document.createElement("canvas");
  s.width = s.height = ot;
  const T = s.getContext("2d", { willReadFrequently: !0 }),
    A = Math.min(ot / r, ot / g),
    R = (ot - r * A) / 2,
    N = (ot - g * A) / 2;
  T.drawImage(o, R, N, r * A, g * A);
  const z = T.getImageData(0, 0, ot, ot).data;
  let p = !0;
  for (let B = 3; B < z.length; B += 4 * 97)
    if (z[B] < 250) {
      p = !1;
      break;
    }
  const _ = [z[0], z[1], z[2]],
    Z = i(
      (B, lt, I) =>
        Math.min(
          1,
          Math.max(
            0,
            (Math.hypot(B - _[0], lt - _[1], I - _[2]) / 441 - 0.08) / 0.2,
          ),
        ),
      "keyAlpha",
    );
  let V = ot,
    P = ot,
    L = -1,
    tt = -1;
  for (let B = 0; B < ot; B++)
    for (let lt = 0; lt < ot; lt++) {
      const I = (B * ot + lt) * 4;
      (p ? Z(z[I], z[I + 1], z[I + 2]) * 255 : z[I + 3]) > 8 &&
        (lt < V && (V = lt),
        lt > L && (L = lt),
        B < P && (P = B),
        B > tt && (tt = B));
    }
  if (L < 0) throw new Error("GlassIconReveal: the logo is empty");
  const k = L - V + 1,
    zt = tt - P + 1,
    gt = (ot * li) / Math.max(k, zt),
    ct = document.createElement("canvas");
  ct.width = ct.height = ot;
  const ht = ct.getContext("2d", { willReadFrequently: !0 });
  if (
    ((ht.imageSmoothingQuality = "high"),
    ht.drawImage(
      o,
      ot / 2 - (V + k / 2 - R) * gt,
      ot / 2 - (P + zt / 2 - N) * gt,
      r * A * gt,
      g * A * gt,
    ),
    p)
  ) {
    const B = ht.getImageData(0, 0, ot, ot),
      lt = B.data;
    for (let I = 0; I < lt.length; I += 4)
      lt[I + 3] = Math.round(lt[I + 3] * Z(lt[I], lt[I + 1], lt[I + 2]));
    ht.putImageData(B, 0, 0);
  }
  return ct;
}
i(jg, "fitToTexture");
function Qg(o) {
  const r = ot * ot,
    g = o
      .getContext("2d", { willReadFrequently: !0 })
      .getImageData(0, 0, ot, ot).data,
    s = 1e20,
    T = new Float64Array(r),
    A = new Float64Array(r);
  for (let _ = 0; _ < r; _++) {
    const Z = g[_ * 4 + 3] / 255;
    if (Z >= 1) ((T[_] = 0), (A[_] = s));
    else if (Z <= 0) ((T[_] = s), (A[_] = 0));
    else {
      const V = 0.5 - Z;
      ((T[_] = V > 0 ? V * V : 0), (A[_] = V < 0 ? V * V : 0));
    }
  }
  const R = new Float64Array(ot),
    N = new Float64Array(ot + 1),
    z = new Uint16Array(ot);
  (Qd(T, R, z, N, s), Qd(A, R, z, N, s));
  const p = new Float32Array(r);
  for (let _ = 0; _ < r; _++) p[_] = (Math.sqrt(T[_]) - Math.sqrt(A[_])) / ot;
  return p;
}
i(Qg, "buildSdf");
function Qd(o, r, g, s, T) {
  for (let A = 0; A < ot; A++) Zd(o, A, ot, r, g, s, T);
  for (let A = 0; A < ot; A++) Zd(o, A * ot, 1, r, g, s, T);
}
i(Qd, "edt");
function Zd(o, r, g, s, T, A, R) {
  ((T[0] = 0), (A[0] = -R), (A[1] = R), (s[0] = o[r]));
  for (let N = 1, z = 0, p = 0; N < ot; N++) {
    s[N] = o[r + N * g];
    const _ = N * N;
    do {
      const Z = T[z];
      p = (s[N] - s[Z] + _ - Z * Z) / (N - Z) / 2;
    } while (p <= A[z] && --z > -1);
    (z++, (T[z] = N), (A[z] = p), (A[z + 1] = R));
  }
  for (let N = 0, z = 0; N < ot; N++) {
    for (; A[z + 1] < N;) z++;
    const p = T[z],
      _ = N - p;
    o[r + N * g] = s[p] + _ * _;
  }
}
i(Zd, "edt1d");
const zf = new Map();
function Zg(o) {
  let r = zf.get(o);
  return (
    r ||
      ((r = Lg(f0(o)).then((g) => {
        const s = jg(g, g.naturalWidth || ot, g.naturalHeight || ot);
        return { canvas: s, sdf: Qg(s) };
      })),
      zf.set(o, r),
      r.catch(() => zf.delete(o))),
    r
  );
}
i(Zg, "loadLogo");
const Vg = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`,
  Kg = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uCenter;      // device px, GL coords
uniform float uTile;       // tile size, device px
uniform sampler2D uSdf;    // signed distance, texture units, + outside
uniform sampler2D uCol;    // premultiplied colour, mipmapped
uniform float uTexSize;
uniform float uBoxFrac;

uniform float uPlateScale; // plate size relative to the tile
uniform float uShapeN;     // superellipse exponent: 2 = circle
uniform float uCornerN;    // final exponent, used by the ghost
uniform float uOptics;     // 1 = full refraction, 0 = flat
uniform float uPlateAlpha; // 1 = glass shown, 0 = bare logo
uniform float uLogoHalf;   // logo half size in plate units (zoom included)
uniform vec2 uLogoOff;     // logo centre, plate units
uniform float uBold;       // stroke swell, in logo half-size units
uniform float uBlur;       // edge softness, plate units
uniform float uFrost;      // milky lift inside a young bubble
uniform float uDome;       // lens bulge height
uniform float uDrop;       // 1 while the glass is a round droplet, 0 once it has spread into the tile
uniform float uPinch;      // the face's stretch toward its corners, at the rim
uniform float uTilt;       // extra stretch of the rising diagonal's corners (0–1)
uniform float uRim;
uniform float uHalo;
uniform float uShadow;
uniform float uGhost;
uniform float uRipR;       // ripple radius, plate sizes
uniform float uRipA;
uniform float uBare;       // 1 once the logo may show without glass (the ending)
uniform float uReach;      // the rim band's full width, plate units
uniform float uCornerPull; // how much harder the corners pull than the sides
uniform float uStreak;     // how far a corner smears content along the rim, in band widths
uniform float uWiden;      // how much wider the folding band grows toward the corners
uniform float uSlab;       // how far the slab stands above the logo, plate units
uniform float uEtaSpread;  // index spread across the spectrum (red highest)
uniform float uFocus;      // how far in along the diagonal a corner focuses, plate units
uniform float uFocusK;     // how quickly the view slides back from the focus across the band
uniform float uFocusSplit; // how much further in red meets than violet, plate units
uniform float uRimLine;    // how far across the band the sight line takes to turn in to the focus
uniform float uCornerOn;   // 0 while the glass is round, 1 once it has spread into the tile
uniform float uDissolve;   // 0 → 1 as the glass lets go of the logo
uniform float uGlow;       // colour bleed in the rim, plate units on screen
uniform float uFaceDisp;   // lateral colour across the face
uniform float uVivid;      // chroma lift of the dispersed light

uniform float uDisp;
uniform float uDouble;
uniform float uBevelW;
uniform float uSpec;
uniform float uIconPlate;
uniform float uUseColor;
uniform float uLightScene; // 1 = light backdrop, 0 = dark
uniform float uLightGlass; // the same for what the glass sits on (the plate, when there is one)
uniform float uKeep;       // 1 = the glass settles into a flat plate instead of letting go of it
uniform float uSheen;      // strength of the light band crossing the face
uniform float uSweep;      // where that band is, plate sizes along its diagonal
uniform float uLightAng;   // how far the rim light has turned, radians

uniform vec3 uBg;
uniform vec3 uPlateCol;
uniform vec3 uLogoCol;

float px; // one device pixel in plate units

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// aa: footprint of one screen pixel at q, plate units.
vec4 logoAt(vec2 q, float blur, float aa) {
  float L = uLogoHalf;
  float k = 0.5 * uBoxFrac / L;
  vec2 uv = vec2(0.5 + (q.x - uLogoOff.x) * k, 0.5 - (q.y - uLogoOff.y) * k);
  float d = texture(uSdf, uv).r / k;
  float w = 0.75 * aa + blur;
  float a = 1.0 - smoothstep(-w, w, d - uBold * L);
  vec3 c = uLogoCol;
  if (uUseColor > 0.5) {
    float lod = log2(max(1.0, w * k * uTexSize));
    vec4 c0 = textureLod(uCol, uv, lod);
    vec4 c1 = textureLod(uCol, uv, lod + 3.0);
    vec4 c2 = textureLod(uCol, uv, 7.0);
    c = c2.rgb / max(c2.a, 1e-4);
    c = mix(c, c1.rgb / max(c1.a, 1e-4), smoothstep(0.0, 0.06, c1.a));
    c = mix(c, c0.rgb / max(c0.a, 1e-4), smoothstep(0.02, 0.3, c0.a));
  }
  return vec4(c, a);
}

// Superellipse field. Returns signed distance (plate units, − inside); g = 1 on the rim.
float shape(vec2 p, float scale, float n, out vec2 nOut, out float g, out vec2 dg) {
  vec2 pp = p / scale;
  vec2 a = max(abs(pp), vec2(1e-6));
  g = pow(pow(a.x, n) + pow(a.y, n), 1.0 / n);
  dg = sign(pp) * pow(a, vec2(n - 1.0)) * pow(max(g, 1e-6), 1.0 - n);
  float dgl = max(length(dg), 1e-6);
  nOut = dg / dgl;
  return (g - 1.0) / dgl * scale;
}

// Curvature radius (plate units) of the shape's contour through p.
float contourRadius(vec2 p, float scale, float n) {
  vec2 a = max(abs(p / scale), vec2(1e-4));
  vec2 a1 = pow(a, vec2(n - 1.0));
  vec2 a2 = pow(a, vec2(n - 2.0));
  float k = (n - 1.0) * (a2.x * a1.y * a1.y + a2.y * a1.x * a1.x) / pow(max(dot(a1, a1), 1e-30), 1.5);
  return scale / max(k, 1e-3);
}

// Where the glass at x = s / bwF across its rounded edge looks: a slab uSlab above the logo with a
// quarter-round edge of radius bwF. A straight-down sight line bends inward by Snell's law, so the
// outer rim looks deepest and the view eases back to the face across the edge.
vec2 refractSample(float x, float bwF, float eta, float R, vec2 dirOut, vec2 p, float dome, float offMul) {
  float u = clamp(1.0 - x, 0.0, 0.995);
  float th = asin(u), thr = asin(u / eta);
  float z = uSlab + bwF * sqrt(1.0 - u * u);
  float off = offMul * z * tan(th - thr);
  off = off / (1.0 + off / (6.0 * R));
  return p - (dirOut * off + p * dome) * uOptics;
}

float gauss(float x, float c, float w) { float d = (x - c) / w; return exp(-0.5 * d * d); }
float band(float x, float a, float b, float w) { return smoothstep(a - w, a, x) * (1.0 - smoothstep(b, b + w, x)); }

// Visible spectrum, red (0) to violet (1).
float bump(float x, float c, float w) { float d = (x - c) / w; return exp(-0.5 * d * d); }
vec3 spectrum(float x) {
  return vec3(bump(x, 0.34, 0.2) + 0.08 * bump(x, 0.93, 0.05), bump(x, 0.58, 0.1), bump(x, 0.8, 0.11));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  px = 2.0 / uTile;
  vec2 p = (gl_FragCoord.xy - uCenter) * px;

  vec4 lg = logoAt(p, uBlur, px);
  vec3 plain = mix(uBg, lg.rgb, lg.a * uBare);

  vec2 nOut, dg; float g;
  float sd = shape(p, uPlateScale, uShapeN, nOut, g, dg);
  float s = -sd;
  float bw = max(uBevelW, 0.004) * uPlateScale;
  float x = clamp(s / bw, 0.0, 1.0);
  float R = contourRadius(p, uPlateScale, uShapeN);
  vec2 pq = p * p;
  float diag = 4.0 * pq.x * pq.y / max((pq.x + pq.y) * (pq.x + pq.y), 1e-6);
  float tilt = mix(1.0 - uTilt, 1.0, smoothstep(-0.02, 0.02, p.x * p.y));
  float pinchPart = uPinch * min(g * g, 1.0) * diag * diag * tilt;
  float dome = uDome * (1.0 - min(g * g, 1.0)) + pinchPart;
  vec2 dirOut = normalize(mix(nOut, p / max(length(p), 1e-4), 0.2));
  // Rounded corners curve both ways, so they draw content in from deeper than the sides.
  float cornerness = max(smoothstep(0.1, 0.9, 4.0 * nOut.x * nOut.x * nOut.y * nOut.y), smoothstep(0.15, 0.75, diag));
  float offMul = 1.0 + 0.4 * max(uCornerPull - 1.0, 0.0) * tilt * cornerness * uCornerOn;
  // Around a corner every sight line meets at one focus a little way in along the diagonal.
  vec2 focus = sign(p) * (pow(0.5, 1.0 / uShapeN) - uFocus * 0.70710678) * uPlateScale;
  float focusW = tilt * cornerness * uOptics * uCornerOn;
  float bwF = max(uReach, 0.004) * (1.0 + uWiden * tilt * cornerness * uCornerOn);
  float xf = clamp(s / bwF, 0.0, 1.0);
  // Footprint of one pixel after refraction, measured in uniform control flow.
  vec2 qc = refractSample(xf, bwF, 1.5, R, dirOut, p, dome, offMul);
  float foot = max(max(length(dFdx(qc)), length(dFdy(qc))), 0.25 * px);

  // Backdrop: anticipation ghost, ripple, soft lift shadow and glow.
  vec3 bg = uBg;
  vec3 lift = mix(uBg + vec3(0.06), mix(uBg, vec3(1.0), 0.55), uLightScene);
  if (uGhost > 0.001) {
    vec2 gn, gdg; float gg;
    float gsd = shape(p, 1.0, uCornerN, gn, gg, gdg);
    bg = mix(bg, lift, uGhost * 0.12 * (1.0 - smoothstep(-0.16, 0.14, gsd)));
    bg *= 1.0 - uGhost * 0.03 * uLightScene * exp(-max(gsd, 0.0) / 0.12) * step(0.0, gsd);
  }
  float outside = max(sd, 0.0);
  if (uRipA > 0.001) {
    float d0 = (uRipR - 1.0) * uPlateScale;
    float rx = (sd - d0) / 0.022;
    float ring = exp(-rx * rx);
    bg += uRipA * ring * (0.04 * (0.55 + 0.45 * dot(nOut, normalize(vec2(-0.5, 0.8))))) * mix(0.5, 1.0, uLightScene);
    bg -= uRipA * 0.016 * uLightScene * exp(-(rx - 1.6) * (rx - 1.6));
  }
  float shadowFall = max(sd, 0.0) / (0.9 * uPlateScale);
  bg *= 1.0 - uShadow * 0.03 * exp(-shadowFall * shadowFall) * step(0.0, sd);
  vec3 haloCol = mix(vec3(0.62, 0.69, 0.80), vec3(1.0), uLightScene);
  bg = mix(bg, haloCol, clamp(uHalo * (0.30 * exp(-outside / (0.025 * uPlateScale)) + 0.07 * exp(-outside / (0.12 * uPlateScale))), 0.0, 1.0) * step(0.0, sd));

  vec3 col = bg;
  float soft = px + uBlur * 0.8 + 0.06 * uDissolve * (1.0 - uKeep) * uPlateScale;
  if (sd < soft) {
    // Lighting surface: a superellipse quarter, flat toward the face and steep at the rim.
    float y1 = 1.0 - x;
    const float K = 2.6;
    float base1 = max(1.0 - pow(y1, K), 1e-4);
    float db = min(pow(y1, K - 1.0) * pow(base1, 1.0 / K - 1.0), 25.0);
    // A second, lower step just inside the first draws the faint inner line.
    float s1 = bw * 0.62;
    float w2 = bw * 0.22;
    float t2 = clamp((s - s1) / w2, -1.0, 1.0);
    float dh2 = uDouble * bw * 0.16;
    float dd = dh2 * 0.5 * cos(t2 * 1.5707963) * 1.5707963 / w2 * step(abs(t2), 0.999);
    vec2 gDome = -uDome * 2.0 * g * dg * step(g, 1.0);
    vec2 grad = -(db + dd) * nOut + gDome;

    vec3 back = mix(uBg, uPlateCol, uIconPlate);
    vec3 liftG = mix(back + vec3(0.06), mix(back, vec3(1.0), 0.55), uLightGlass);
    float rblur = uBlur + 0.05 * length(qc - p) + min(uGlow * uOptics * (1.0 - xf) * foot / px, 0.04);

    // Each wavelength refracts by its own index, so everything the edge draws in fans into colour
    // while the face stays crisp. Around a corner the samples also smear along the rim.
    float cornerW = smoothstep(0.1, 0.9, 4.0 * nOut.x * nOut.x * nOut.y * nOut.y);
    float streak = 0.35 * uStreak * bw * mix(0.15, 1.0, cornerW) * pow(1.0 - xf, 1.5) * uOptics;
    vec2 tangent = vec2(-nOut.y, nOut.x);
    vec3 acc = vec3(0.0), wsum = vec3(0.0);
    for (int i = 0; i < 20; i++) {
      float lam = (float(i) + 0.5) / 20.0;
      float c = uDisp * (1.0 - 2.0 * lam);
      vec2 along = tangent * (streak * 2.0 * (fract(float(i) * 0.618034 + 0.31) - 0.5));
      float cf = uDisp * (1.0 - 2.0 * lam) * (lam > 0.5 ? 1.0 : 0.5);
      vec2 sp = refractSample(xf, bwF, 1.5 + uEtaSpread * c, R, dirOut, p + along,
                              dome + pinchPart * 0.3 * c, offMul);
      vec2 focusL = focus - sign(p) * (0.70710678 * uFocusSplit * c * uPlateScale);
      float wFocus = pow(1.0 - xf, uFocusK) * smoothstep(0.0, uRimLine * (1.0 + 0.6 * c), xf);
      sp = mix(sp, mix(p + along, focusL, wFocus), focusW);
      float faceOnly = smoothstep(0.7, 1.0, xf) * uOptics;
      sp *= 1.0 + uFaceDisp * cf * faceOnly;
      vec4 l = logoAt(sp, rblur + 0.12 * streak + uFaceDisp * 0.5 * max(c, 0.0) * faceOnly, foot);
      vec3 w = spectrum(lam);
      acc += mix(back, l.rgb, l.a) * w;
      wsum += w;
    }
    vec3 trans = acc / wsum;
    float tl = dot(trans, vec3(0.2126, 0.7152, 0.0722));
    trans = clamp(tl + (trans - tl) * (1.0 + uVivid * uOptics), 0.0, 1.0);
    // A young droplet is milky; the haze only ever lightens.
    float hazeLum = dot(trans, vec3(0.2126, 0.7152, 0.0722));
    float hazeGate = mix(1.0 - smoothstep(0.25, 0.75, hazeLum), smoothstep(0.25, 0.75, hazeLum), uLightGlass);
    trans = mix(trans, liftG, uFrost * 0.45 * hazeGate);

    float glassAmt = pow(1.0 - uDissolve, 1.5);
    float lit = uSpec * glassAmt;
    vec3 rimCol = mix(vec3(0.80, 0.87, 0.97), vec3(1.0), uLightGlass);

    // Light backdrop: the thick edge glows softly white over a clear face, with a hairline that is
    // bright along the top and right and a thin dark silhouette down the left and bottom.
    float sc = uPlateScale;
    float tLum = dot(trans, vec3(0.2126, 0.7152, 0.0722));
    float lightOnly = smoothstep(0.35, 0.85, tLum);
    float hw = smoothstep(-0.85, 0.5, dot(nOut, rot(vec2(0.5, 0.866), uLightAng)));
    float tileBand = band(s, 0.016 * sc, 0.075 * sc, 0.022 * sc);
    float dropBand = (1.0 - smoothstep(0.06 * sc, 0.13 * sc, s)) * smoothstep(0.0, 0.004 * sc, s);
    float glow = mix(0.32 * tileBand, 0.75 * dropBand, uDrop) * lightOnly;
    float edgeLine = gauss(s, 0.005 * sc, 0.0045 * sc);
    float lip = gauss(s, 0.15 * sc, 0.007 * sc) * uDouble * (1.0 - uDrop);
    vec3 lightGlass = mix(trans, vec3(1.0), glow * glassAmt);
    lightGlass += (0.075 * hw * edgeLine + 0.06 * (0.4 + 0.6 * hw) * lip) * lit;
    lightGlass *= 1.0 - 0.05 * (1.0 - hw) * edgeLine * glassAmt * (1.0 - uDrop);
    lightGlass = mix(lightGlass, vec3(1.0), 0.55 * uDrop * glassAmt * edgeLine);

    // Dark backdrop: a cool rim light that grows toward the steep edge, and a small key highlight.
    vec3 Nl = normalize(vec3(-grad, 1.0));
    float edge = 1.0 - Nl.z;
    vec2 ldir = rot(normalize(vec2(-0.62, 0.78)), uLightAng);
    float side = dot(nOut, ldir);
    float fres = pow(edge, 1.5);
    vec3 rim = rimCol * fres * (0.35 + 0.65 * max(side, -side * 0.8)) * uRim * 0.65;
    vec3 Hv = normalize(normalize(vec3(-0.45, 0.6, 0.66)) + vec3(0.0, 0.0, 1.0));
    float spc = pow(max(dot(Nl, Hv), 0.0), 140.0) * 0.8 * smoothstep(0.0, 0.25, y1);
    vec3 darkGlass = trans * (1.0 - 0.25 * fres) + (rim + vec3(spc)) * lit;
    darkGlass = mix(darkGlass, rimCol, uDrop * 0.4 * uSpec * (1.0 - smoothstep(0.0, 0.1 * uPlateScale, s)));
    vec3 glass = mix(darkGlass, lightGlass, uLightGlass);

    // While the glass holds the logo a soft band of light crosses the face, brightest near the rim.
    float sweepD = dot(p / uPlateScale, normalize(vec2(0.8, 0.6))) - uSweep;
    float sheen = uSheen * glassAmt * exp(-sweepD * sweepD / 0.03) * (0.55 + 0.45 * (1.0 - x));
    glass = mix(glass, vec3(1.0), sheen * mix(0.22, 0.42, uLightGlass));

    float cov = clamp(0.5 - sd / soft, 0.0, 1.0);
    col = mix(bg, glass, cov);
  }

  vec3 outc = mix(plain, col, uPlateAlpha);
  outc += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(outc, 1.0);
}`;
function Vd(o) {
  const r = o.getContext("webgl2", { antialias: !1, premultipliedAlpha: !1 });
  if (!r) return null;
  const g = i((L, tt) => {
      const k = r.createShader(L);
      if (
        (r.shaderSource(k, tt),
        r.compileShader(k),
        !r.getShaderParameter(k, r.COMPILE_STATUS))
      )
        throw new Error(r.getShaderInfoLog(k) || "shader");
      return k;
    }, "compile"),
    s = r.createProgram();
  if (
    (r.attachShader(s, g(r.VERTEX_SHADER, Vg)),
    r.attachShader(s, g(r.FRAGMENT_SHADER, Kg)),
    r.linkProgram(s),
    !r.getProgramParameter(s, r.LINK_STATUS))
  )
    throw new Error(r.getProgramInfoLog(s) || "program");
  (r.useProgram(s),
    r.bindBuffer(r.ARRAY_BUFFER, r.createBuffer()),
    r.bufferData(
      r.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      r.STATIC_DRAW,
    ));
  const T = r.getAttribLocation(s, "aPos");
  (r.enableVertexAttribArray(T),
    r.vertexAttribPointer(T, 2, r.FLOAT, !1, 0, 0));
  const A = {},
    R = r.getProgramParameter(s, r.ACTIVE_UNIFORMS);
  for (let L = 0; L < R; L++) {
    const tt = r.getActiveUniform(s, L);
    A[tt.name] = r.getUniformLocation(s, tt.name);
  }
  const N = r.createTexture(),
    z = r.createTexture();
  (r.uniform1i(A.uSdf, 0), r.uniform1i(A.uCol, 1));
  let p = !1;
  const _ = i((L) => {
    (r.texParameteri(r.TEXTURE_2D, r.TEXTURE_MIN_FILTER, L),
      r.texParameteri(r.TEXTURE_2D, r.TEXTURE_MAG_FILTER, r.LINEAR),
      r.texParameteri(r.TEXTURE_2D, r.TEXTURE_WRAP_S, r.CLAMP_TO_EDGE),
      r.texParameteri(r.TEXTURE_2D, r.TEXTURE_WRAP_T, r.CLAMP_TO_EDGE));
  }, "params");
  function Z(L) {
    (r.activeTexture(r.TEXTURE0),
      r.bindTexture(r.TEXTURE_2D, N),
      r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !1),
      r.texImage2D(r.TEXTURE_2D, 0, r.R16F, ot, ot, 0, r.RED, r.FLOAT, L.sdf),
      _(r.LINEAR),
      r.activeTexture(r.TEXTURE1),
      r.bindTexture(r.TEXTURE_2D, z),
      r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !0),
      r.texImage2D(r.TEXTURE_2D, 0, r.RGBA8, r.RGBA, r.UNSIGNED_BYTE, L.canvas),
      r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !1),
      r.generateMipmap(r.TEXTURE_2D),
      _(r.LINEAR_MIPMAP_LINEAR),
      (p = !0));
  }
  i(Z, "setLogo");
  function V(L, tt, k, zt) {
    if (p) {
      (r.viewport(0, 0, tt, k),
        r.uniform2f(A.uCenter, tt / 2, k / 2),
        r.uniform1f(A.uTile, zt),
        r.uniform1f(A.uTexSize, ot),
        r.uniform1f(A.uBoxFrac, li));
      for (const gt in L) {
        const ct = L[gt];
        typeof ct == "number" && A[gt] && r.uniform1f(A[gt], ct);
      }
      (r.uniform3fv(A.uBg, L.uBg),
        r.uniform3fv(A.uPlateCol, L.uPlateCol),
        r.uniform3fv(A.uLogoCol, L.uLogoCol),
        r.uniform2fv(A.uLogoOff, L.uLogoOff),
        r.drawArrays(r.TRIANGLES, 0, 3));
    }
  }
  i(V, "render");
  function P() {
    var L;
    (L = r.getExtension("WEBGL_lose_context")) == null || L.loseContext();
  }
  return (i(P, "dispose"), { setLogo: Z, render: V, dispose: P });
}
i(Vd, "createRenderer");
const kg = 1.1,
  Mf = 0.5,
  Jg = i((o) => o.present + kg, "endOf"),
  ei = i((o) => (o < 0 ? 0 : o > 1 ? 1 : o), "clamp01"),
  Bu = i((o, r, g) => o + (r - o) * g, "mix"),
  ll = i((o, r, g) => {
    const s = ei((g - o) / (r - o));
    return s * s * (3 - 2 * s);
  }, "smooth"),
  Of = i((o, r, g) => {
    const s = ei((g - o) / (r - o));
    return s * s * s * (s * (s * 6 - 15) + 10);
  }, "smoother");
function ti(o) {
  let r = o.replace("#", "");
  r.length === 3 && (r = r.replace(/./g, "$&$&"));
  const g = parseInt(r.slice(0, 6), 16) || 0;
  return [((g >> 16) & 255) / 255, ((g >> 8) & 255) / 255, (g & 255) / 255];
}
i(ti, "hexToRgb");
const Kd = i(([o, r, g]) => 0.2126 * o + 0.7152 * r + 0.0722 * g, "luminance");
function Re(o, r, g) {
  if (o <= 0) return 0;
  const s = (2 * Math.PI) / r;
  if (g >= 1) return 1 - Math.exp(-s * o) * (1 + s * o);
  const T = s * Math.sqrt(1 - g * g);
  return (
    1 -
    Math.exp(-g * s * o) * (Math.cos(T * o) + ((g * s) / T) * Math.sin(T * o))
  );
}
i(Re, "spring");
const kd = new Map();
function Jd(o, r, g) {
  const s = `${o}/${r}/${g}`;
  let T = kd.get(s);
  if (T === void 0) {
    let A = 0,
      R = 3;
    for (let N = 0; N < 40; N++) {
      const z = (A + R) / 2;
      Re(z, r, g) < o ? (A = z) : (R = z);
    }
    kd.set(s, (T = R));
  }
  return T;
}
i(Jd, "timeToReach");
function Wg(o, r, g = 0) {
  const s = r.present,
    T = r.keepPlate ? 1 : 0,
    A = 1 - r.bounce,
    R = Re(o + 0.01, r.response, A),
    N = Jd(0.85, r.response, A) - 0.01,
    z = Jd(0.92, r.response, A) - 0.01,
    p = Re(o - z, 0.4, 1),
    _ = 1 - ll(0.05, 1, p),
    Z = ll(0, 0.08, o),
    V = r.drift * Re(o - 0.3, 2.2, 1),
    P = 0.25 * Re(o, 0.7, 1) + 0.75 * Of(0, r.glide, o),
    L = Re(o - 0.5, 2.4, 1),
    tt = Re(o - s, 0.95, 1),
    k = Re(o - s - 0.05, 0.65, 1),
    zt = 0.15 * r.bulge * (1 - ll(0.4, 0.95, R)),
    gt =
      (1 + (r.startZoom - 1) * (1 - P)) *
      (1 - 0.045 * L) *
      Bu(1, r.finalScale, tt) *
      (1 - 0.06 * g),
    ct = Bu(r.bevelWidth, Math.max(r.bevelWidth, 0.4), _),
    ht =
      Bu(r.startSize, 1, R) *
      (1 + V) *
      (1 + 0.14 * k * (1 - T)) *
      (1 - T * (0.03 * k + 0.06 * g)),
    B = ti(r.background);
  return {
    uPlateScale: ht,
    uShapeN: Bu(2, r.corner, p),
    uCornerN: r.corner,
    uOptics: 1 - ll(0.55, 1, k),
    uPlateAlpha: T ? Z * (1 - g) : Z * (1 - ll(0.45, 1, k)),
    uLogoHalf: r.logoScale * gt,
    uLogoOff: [r.logoOffset[0] * gt, r.logoOffset[1] * gt],
    uKeep: T,
    uSheen: r.sheen,
    uSweep: Bu(-1.6, 1.6, Of(0.9, s - 0.1, o)),
    uLightAng: r.lightTurn * Of(0.4, s + 0.4, o),
    uBold: r.swell * 0.03 * (1 - P),
    uBlur: r.focus * 0.05 * (1 - ll(0.3, 0.95, R)) + 0.03 * g,
    uFrost: r.focus * (1 - ll(0.5, 0.95, R)),
    uPinch: 0.38 * r.stretch * ll(0.1, 0.9, p) * ll(0.75, 0.97, P),
    uTilt: r.tilt,
    uDome: zt,
    uDrop: _,
    uRim: 1 + 0.8 * _,
    uHalo: r.halo * (0.5 + 0.5 * _) * (1 - T * k),
    uShadow: Math.max(
      r.shadow * ll(0.45, 0.8, R) * (1 - ll(0, 0.6, p)),
      0.8 * r.shadow * T * k,
    ),
    uGhost: ll(0, 0.03, o) * (1 - ll(0.04, 0.08, o)),
    uRipR: 1 + 0.9 * Math.max(0, o - N),
    uRipA: r.ripple * ll(N, N + 0.06, o) * Math.exp(-Math.max(0, o - N) / 0.6),
    uBare: (1 - T) * ll(s - 0.25, s, o) * (1 - g),
    uReach: ct * ht,
    uCornerPull: r.cornerPull,
    uStreak: r.edgeSmear,
    uWiden: r.cornerWidth,
    uSlab: 0.3 * r.opticalDepth,
    uEtaSpread: 0.06,
    uFocus: r.cornerFocus,
    uFocusK: 1,
    uFocusSplit: 0.056 * r.colorBleed,
    uRimLine: 0.09,
    uCornerOn: ll(0.35, 1, p),
    uGlow: 0.012 * r.colorBleed,
    uFaceDisp: 0.012 * r.dispersion,
    uVivid: 0.85,
    uDissolve: k,
    uDisp: r.dispersion,
    uDouble: r.doubleBevel,
    uBevelW: ct * (1 - k),
    uSpec: r.specular,
    uIconPlate: r.iconPlate ? 1 : 0,
    uUseColor: r.originalColors ? 1 : 0,
    uLightScene: Kd(B) > 0.5 ? 1 : 0,
    uLightGlass: Kd(r.iconPlate ? ti(r.plateColor) : B) > 0.5 ? 1 : 0,
    uBg: B,
    uPlateCol: ti(r.plateColor),
    uLogoCol: ti(r.logoColor),
  };
}
i(Wg, "frameAt");

export const loadGlassLogo = Zg;
export const createGlassRenderer = Vd;
export const glassFrameAt = Wg;
export const glassDefaults = jd;
export const glassDark = qg.dark;

