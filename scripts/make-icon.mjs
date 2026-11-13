import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import {
  ROCKET_OUTLINE,
  ROCKET_FLAME,
  VOYAGER_MARK_SVG,
} from "../src/shared/brand.ts";
const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
function render(size) {
  const scale = size / 48,
    center = size / 2;
  const rotate = ([x, y]) => [
    center + (x - y) * Math.SQRT1_2 * scale,
    center + (x + y - 44) * Math.SQRT1_2 * scale,
  ];
  const rocket = ROCKET_OUTLINE.map(rotate),
    flame = ROCKET_FLAME.map(rotate),
    port = rotate([22, 17.7]);
  function contains(points, x, y) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [a, b] = points[i],
        [c, d] = points[j];
      if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a)
        inside = !inside;
    }
    return inside;
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const samples = size <= 48 ? 8 : 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples,
            py = y + (sy + 0.5) / samples;
          let color = [5, 7, 13, 0];
          const corner = (size * 3) / 16;
          const rx = Math.max(corner - px, 0, px - (size - corner)),
            ry = Math.max(corner - py, 0, py - (size - corner));
          if (rx * rx + ry * ry < corner ** 2) color = [5, 7, 13, 255];
          if ((px - center) ** 2 + (py - center) ** 2 < (20 * scale) ** 2)
            color = [244, 247, 255, 255];
          if (contains(rocket, px, py) || contains(flame, px, py))
            color = [5, 7, 13, 255];
          if (
            (px - port[0]) ** 2 + (py - port[1]) ** 2 <
            Math.max(0.65, 2.35 * scale) ** 2
          )
            color = [244, 247, 255, 255];
          color.forEach((v, c) => (sum[c] += c === 3 ? v : v * color[3]));
        }
      const color = [
        ...sum.slice(0, 3).map((v) => (sum[3] ? Math.round(v / sum[3]) : 0)),
        Math.round(sum[3] / (samples * samples)),
      ];
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 4; c++) raw[offset + c] = color[c];
    }
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (let c = 0; c < 4; c++) {
        const a = y * (size * 4 + 1) + 1 + x * 4 + c,
          b = (size - 1 - x) * (size * 4 + 1) + 1 + (size - 1 - y) * 4 + c;
        if (Math.abs(raw[a] - raw[b]) > 1)
          throw new Error("Voyager icon lost symmetry across its rocket axis");
      }
  function crc(data) {
    let c = 0xffffffff;
    for (const byte of data) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const name = Buffer.from(type);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    name.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc(Buffer.concat([name, data])), 8 + data.length);
    return result;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}
const frames = sizes.map((size) => ({ size, png: render(size) }));
const ico = Buffer.alloc(6 + 16 * frames.length);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(frames.length, 4);
let offset = ico.length;
frames.forEach(({ size, png }, index) => {
  const entry = 6 + index * 16;
  ico[entry] = ico[entry + 1] = size === 256 ? 0 : size;
  ico.writeUInt16LE(1, entry + 4);
  ico.writeUInt16LE(32, entry + 6);
  ico.writeUInt32LE(png.length, entry + 8);
  ico.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await mkdir("assets", { recursive: true });
await writeFile("assets/icon.png", frames.at(-1).png);
await writeFile(
  "assets/icon.ico",
  Buffer.concat([ico, ...frames.map((frame) => frame.png)]),
);
await mkdir(".local/icon-preview", { recursive: true });
await Promise.all(
  frames.map(({ size, png }) =>
    writeFile(`.local/icon-preview/${size}.png`, png),
  ),
);
await writeFile("assets/voyager-mark.svg", VOYAGER_MARK_SVG);
