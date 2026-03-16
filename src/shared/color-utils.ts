/** Parse a hex color (#RGB or #RRGGBB) to [r, g, b]. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Convert [r,g,b] to hex string. */
export function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Linearly interpolate between two hex colors. t in [0,1]. Returns hex. */
export function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return toHex(r, g, bl);
}

/** Darken a hex color by a factor (0 = black, 1 = unchanged). */
export function darken(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r * factor, g * factor, b * factor);
}

/** Lighten a hex color by mixing toward white. factor 0 = unchanged, 1 = white. */
export function lighten(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(
    r + (255 - r) * factor,
    g + (255 - g) * factor,
    b + (255 - b) * factor,
  );
}

/** Vary a hex color by mixing a random amount toward white or black. */
export function varyColor(hex: string, variation: number, rng: () => number): string {
  const [r, g, b] = parseHex(hex);
  const shift = (rng() - 0.5) * 2 * variation * 255;
  return toHex(r + shift, g + shift, b + shift);
}
