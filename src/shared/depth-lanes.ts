/**
 * Depth Lane System — convention-based depth slots for cross-plugin coordination.
 *
 * Copied into each plugin that needs atmospheric depth (same pattern as prng/noise).
 */

import { parseHex, toHex } from "./color-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named depth lanes from farthest to nearest. */
export type DepthLane =
  | "sky"
  | "far-background"
  | "background"
  | "midground"
  | "foreground"
  | "ground-plane"
  | "overlay";

/** Sub-level within a lane (1=back, 2=middle, 3=front). */
export type DepthSubLevel = 1 | 2 | 3;

/** Lane with optional sub-level suffix, e.g. "background-2". */
export type DepthLaneSub =
  | DepthLane
  | `${DepthLane}-1`
  | `${DepthLane}-2`
  | `${DepthLane}-3`;

/** Resolved depth lane configuration. */
export interface DepthLaneConfig {
  lane: DepthLane;
  subLevel: DepthSubLevel;
  depthMin: number;
  depthMax: number;
  depth: number;
}

/** Atmospheric depth mode. */
export type AtmosphericMode = "western" | "ink-wash" | "none";

// ---------------------------------------------------------------------------
// Lane depth ranges
// ---------------------------------------------------------------------------

const LANE_RANGES: Record<DepthLane, { min: number; max: number }> = {
  "sky":             { min: 0.00, max: 0.00 },
  "far-background":  { min: 0.00, max: 0.20 },
  "background":      { min: 0.20, max: 0.40 },
  "midground":       { min: 0.40, max: 0.60 },
  "foreground":      { min: 0.60, max: 0.85 },
  "ground-plane":    { min: 0.85, max: 1.00 },
  "overlay":         { min: 0.00, max: 1.00 },
};

export const DEPTH_LANE_ORDER: DepthLane[] = [
  "sky", "far-background", "background", "midground", "foreground", "ground-plane", "overlay",
];

// ---------------------------------------------------------------------------
// Parsing & Resolution
// ---------------------------------------------------------------------------

export function parseDepthLaneSub(laneSub: string): { lane: DepthLane; subLevel: DepthSubLevel } | null {
  const subMatch = laneSub.match(/^(.+)-([123])$/);
  if (subMatch) {
    const lane = subMatch[1] as DepthLane;
    const sub = parseInt(subMatch[2]!, 10) as DepthSubLevel;
    if (LANE_RANGES[lane] !== undefined) {
      return { lane, subLevel: sub };
    }
  }
  if (LANE_RANGES[laneSub as DepthLane] !== undefined) {
    return { lane: laneSub as DepthLane, subLevel: 2 };
  }
  return null;
}

export function resolveDepthLane(laneSub: string): DepthLaneConfig | null {
  const parsed = parseDepthLaneSub(laneSub);
  if (!parsed) return null;

  const range = LANE_RANGES[parsed.lane]!;
  const span = range.max - range.min;
  const subT = (parsed.subLevel - 1) / 2;
  const depth = range.min + span * subT;

  return {
    lane: parsed.lane,
    subLevel: parsed.subLevel,
    depthMin: range.min,
    depthMax: range.max,
    depth,
  };
}

export function depthForLane(laneSub: string): number {
  const config = resolveDepthLane(laneSub);
  return config?.depth ?? 0.5;
}

// ---------------------------------------------------------------------------
// Color utilities for atmospheric depth
// ---------------------------------------------------------------------------

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// ---------------------------------------------------------------------------
// Atmospheric Depth
// ---------------------------------------------------------------------------

const DEFAULT_HAZE: Record<AtmosphericMode, string> = {
  "western":  "#B8C8D8",
  "ink-wash": "#E8DDD0",
  "none":     "#FFFFFF",
};

export function applyAtmosphericDepth(
  color: string,
  depth: number,
  mode: AtmosphericMode,
  hazeColor?: string,
): string {
  if (mode === "none") return color;

  const d = Math.max(0, Math.min(1, depth));
  const effect = 1 - d;
  const [r, g, b] = parseHex(color);
  const [h, s, l] = rgbToHsl(r, g, b);
  const haze = hazeColor ?? DEFAULT_HAZE[mode];
  const [hr, hg, hb] = parseHex(haze);

  if (mode === "western") {
    const newS = Math.max(0, s - effect * 40);
    const newL = Math.min(100, l + effect * 25);
    const blueShift = effect * 15;
    const newH = h + (220 - h) * (blueShift / 100);
    const [adjR, adjG, adjB] = hslToRgb(newH, newS, newL);
    const mix = effect * 0.3;
    return toHex(
      Math.round(adjR * (1 - mix) + hr * mix),
      Math.round(adjG * (1 - mix) + hg * mix),
      Math.round(adjB * (1 - mix) + hb * mix),
    );
  }

  // ink-wash mode
  const newS = Math.max(0, s - effect * 60);
  const newL = Math.min(100, l + effect * 30);
  const [adjR, adjG, adjB] = hslToRgb(h, newS, newL);
  const mix = effect * 0.4;
  return toHex(
    Math.round(adjR * (1 - mix) + hr * mix),
    Math.round(adjG * (1 - mix) + hg * mix),
    Math.round(adjB * (1 - mix) + hb * mix),
  );
}

// ---------------------------------------------------------------------------
// Depth Lane Property Schema helpers
// ---------------------------------------------------------------------------

export const DEPTH_LANE_OPTIONS = [
  { value: "sky", label: "Sky" },
  { value: "far-background", label: "Far Background" },
  { value: "far-background-1", label: "Far Background (back)" },
  { value: "far-background-2", label: "Far Background (mid)" },
  { value: "far-background-3", label: "Far Background (front)" },
  { value: "background", label: "Background" },
  { value: "background-1", label: "Background (back)" },
  { value: "background-2", label: "Background (mid)" },
  { value: "background-3", label: "Background (front)" },
  { value: "midground", label: "Midground" },
  { value: "midground-1", label: "Midground (back)" },
  { value: "midground-2", label: "Midground (mid)" },
  { value: "midground-3", label: "Midground (front)" },
  { value: "foreground", label: "Foreground" },
  { value: "foreground-1", label: "Foreground (back)" },
  { value: "foreground-2", label: "Foreground (mid)" },
  { value: "foreground-3", label: "Foreground (front)" },
  { value: "ground-plane", label: "Ground Plane" },
  { value: "ground-plane-1", label: "Ground Plane (back)" },
  { value: "ground-plane-2", label: "Ground Plane (mid)" },
  { value: "ground-plane-3", label: "Ground Plane (front)" },
  { value: "overlay", label: "Overlay" },
];

export function createDepthLaneProperty(defaultLane: DepthLaneSub): {
  key: string;
  label: string;
  type: "select";
  default: string;
  group: string;
  options: Array<{ value: string; label: string }>;
} {
  return {
    key: "depthLane",
    label: "Depth Lane",
    type: "select" as const,
    default: defaultLane,
    group: "depth",
    options: DEPTH_LANE_OPTIONS,
  };
}

export function createAtmosphericModeProperty(): {
  key: string;
  label: string;
  type: "select";
  default: string;
  group: string;
  options: Array<{ value: string; label: string }>;
} {
  return {
    key: "atmosphericMode",
    label: "Atmospheric Mode",
    type: "select" as const,
    default: "none",
    group: "depth",
    options: [
      { value: "none", label: "None" },
      { value: "western", label: "Western (blue shift)" },
      { value: "ink-wash", label: "Ink Wash (paper tone)" },
    ],
  };
}
