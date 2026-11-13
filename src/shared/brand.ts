function curve(a: number[], b: number[], c: number[], d: number[]) {
  return Array.from({ length: 25 }, (_, i) => {
    const t = i / 24,
      s = 1 - t;
    return [
      s * s * s * a[0] +
        3 * s * s * t * b[0] +
        3 * s * t * t * c[0] +
        t * t * t * d[0],
      s * s * s * a[1] +
        3 * s * s * t * b[1] +
        3 * s * t * t * c[1] +
        t * t * t * d[1],
    ];
  });
}
const left = [
  ...curve([22, 8.5], [18.2, 12.1], [16.4, 16.4], [16.4, 21]),
  [12.4, 26.6],
  [18, 25.8],
  [19.3, 28],
];
export const ROCKET_OUTLINE = [
  ...left,
  ...left
    .slice()
    .reverse()
    .map(([x, y]) => [44 - x, y]),
];
export const ROCKET_FLAME = [
  [20, 30],
  [22, 34.5],
  [24, 30],
];
const polygon = (points: number[][]) =>
  points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(4)} ${y.toFixed(4)}`)
    .join("") + "Z";
export const VOYAGER_MARK_PATH =
  "M22 2a20 20 0 1 0 0 40 20 20 0 0 0 0-40Z" +
  polygon(ROCKET_OUTLINE) +
  "M24.35 17.7a2.35 2.35 0 1 0-4.7 0 2.35 2.35 0 0 0 4.7 0Z" +
  polygon(ROCKET_FLAME);
export const VOYAGER_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><path fill="#fff" fill-rule="evenodd" transform="rotate(45 22 22)" d="${VOYAGER_MARK_PATH}"/></svg>`;
