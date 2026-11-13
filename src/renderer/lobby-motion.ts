// Public Rotating Flavor Slider: ringAngles and pathOffset, component.js.
export function ringAngles(count: number, step = 33, span = 140) {
  if (count < 2) return count === 1 ? [0] : [];
  const spacing = Math.min(step, span / (count - 1));
  return Array.from(
    { length: count },
    (_, i) => (i - (count - 1) / 2) * spacing,
  );
}
export function pathOffset(angle: number) {
  return ((((angle + 90) % 360) + 360) % 360) / 3.6;
}
function labelMetrics(title: string) {
  const units = Array.from(title).reduce(
    (sum, ch) =>
      sum +
      (/\s/.test(ch)
        ? 0.36
        : /[ilI.,'!:;|]/.test(ch)
          ? 0.3
          : /[MW@%]/.test(ch)
            ? 0.95
            : /[^\u0000-\u024f]/.test(ch)
              ? 1
              : 0.64),
    0,
  );
  const fontSize = Math.min(3.5, 190 / Math.max(1, units));
  const width = Math.max(4, units * fontSize);
  return { fontSize, width, arc: ((width / 92.8) * 180) / Math.PI };
}
export function orbitLayout(titles: string[], selected: number) {
  if (!titles.length) return [];
  const metrics = titles.map(labelMetrics),
    count = titles.length;
  const result = [{ index: selected, angle: 0, ...metrics[selected] }];
  const seen = new Set([selected]);
  for (const direction of [-1, 1]) {
    let angle = 0,
      previous = selected;
    for (let distance = 1; distance <= Math.min(2, count - 1); distance++) {
      const index = (selected + direction * distance + count) % count;
      angle +=
        direction * ((metrics[previous].arc + metrics[index].arc) / 2 + 8);
      if (Math.abs(angle) + metrics[index].arc / 2 > 76) break;
      if (!seen.has(index)) {
        result.push({ index, angle, ...metrics[index] });
        seen.add(index);
      }
      previous = index;
    }
  }
  return result;
}
export function orbitTravel(titles: string[], previous: number, steps: number) {
  if (previous < 0 || !titles.length) return 0;
  const metrics = titles.map(labelMetrics),
    direction = Math.sign(steps);
  let angle = 0,
    index = previous;
  for (let i = 0; i < Math.abs(steps); i++) {
    const next = (index + direction + titles.length) % titles.length;
    angle += direction * ((metrics[index].arc + metrics[next].arc) / 2 + 8);
    index = next;
  }
  return angle;
}
export function lobbyStep(previous: string, next: string, ids: string[]) {
  const a = ids.indexOf(previous),
    b = ids.indexOf(next);
  if (a < 0 || b < 0 || a === b) return 0;
  const forward = (b - a + ids.length) % ids.length;
  return forward <= ids.length / 2 ? forward : forward - ids.length;
}
