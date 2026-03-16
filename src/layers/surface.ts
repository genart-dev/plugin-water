import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  ValidationError,
} from "@genart-dev/core";
import { parseHex, darken } from "../shared/color-utils.js";
import { mulberry32 } from "../shared/prng.js";
import { createValueNoise, createFractalNoise } from "../shared/noise.js";
import { createDepthLaneProperty, createAtmosphericModeProperty, resolveDepthLane, applyAtmosphericDepth } from "../shared/depth-lanes.js";
import type { AtmosphericMode } from "../shared/depth-lanes.js";
import { getPreset } from "../presets/index.js";
import type { SurfacePreset } from "../presets/types.js";
import { createDefaultProps, smoothstep } from "./shared.js";

const SURFACE_PROPERTIES: LayerPropertySchema[] = [
  {
    key: "preset",
    label: "Water Type",
    type: "select",
    default: "still-lake",
    group: "preset",
    options: [
      { value: "still-lake", label: "Still Lake" },
      { value: "pond", label: "Pond" },
      { value: "misty-lake", label: "Misty Lake" },
      { value: "moonlit-water", label: "Moonlit Water" },
      { value: "choppy-sea", label: "Choppy Sea" },
      { value: "ocean-swell", label: "Ocean Swell" },
      { value: "stormy-ocean", label: "Stormy Ocean" },
      { value: "tropical-shallows", label: "Tropical Shallows" },
      { value: "coastal-surf", label: "Coastal Surf" },
      { value: "mountain-stream", label: "Mountain Stream" },
      { value: "river", label: "River" },
    ],
  },
  { key: "seed", label: "Seed", type: "number", default: 42, min: 0, max: 99999, step: 1, group: "generation" },
  {
    key: "algorithm",
    label: "Algorithm",
    type: "select",
    default: "calm",
    group: "type",
    options: [
      { value: "calm", label: "Calm (stripe compositing)" },
      { value: "ocean", label: "Ocean (Gerstner waves)" },
      { value: "flow", label: "Flow (flow-field ripples)" },
    ],
  },
  { key: "waterlinePosition", label: "Waterline Position", type: "number", default: 0.6, min: 0.1, max: 0.95, step: 0.05, group: "layout" },
  { key: "waveHeight", label: "Wave Height", type: "number", default: 0.3, min: 0, max: 1, step: 0.05, group: "waves" },
  { key: "wavePeriod", label: "Wave Period", type: "number", default: 0.8, min: 0.1, max: 1, step: 0.05, group: "waves" },
  { key: "waveComplexity", label: "Wave Complexity", type: "number", default: 0.2, min: 0, max: 1, step: 0.05, group: "waves" },
  { key: "chop", label: "Chop", type: "number", default: 0, min: 0, max: 1, step: 0.05, group: "waves" },
  { key: "surfaceColor", label: "Surface Color", type: "color", default: "#2A4A6B", group: "colors" },
  { key: "depthColor", label: "Depth Color", type: "color", default: "#152535", group: "colors" },
  { key: "shimmerIntensity", label: "Shimmer", type: "number", default: 0.15, min: 0, max: 1, step: 0.05, group: "style" },
  { key: "flowDirection", label: "Flow Direction", type: "number", default: 0, min: 0, max: 6.28, step: 0.1, group: "flow" },
  { key: "flowStrength", label: "Flow Strength", type: "number", default: 0, min: 0, max: 1, step: 0.05, group: "flow" },
  createDepthLaneProperty("midground"),
  createAtmosphericModeProperty(),
];

interface ResolvedSurfaceProps {
  seed: number;
  algorithm: "calm" | "ocean" | "flow";
  waterlinePosition: number;
  waveHeight: number;
  wavePeriod: number;
  waveComplexity: number;
  chop: number;
  surfaceColor: string;
  depthColor: string;
  shimmerIntensity: number;
  flowDirection: number;
  flowStrength: number;
  depthLane: string;
  atmosphericMode: AtmosphericMode;
}

function resolveProps(properties: LayerProperties): ResolvedSurfaceProps {
  const presetId = properties.preset as string | undefined;
  const preset = presetId ? getPreset(presetId) : undefined;
  const sp = preset?.category === "surface" ? (preset as SurfacePreset) : undefined;

  return {
    seed: (properties.seed as number) ?? 42,
    algorithm: (properties.algorithm as "calm" | "ocean" | "flow") ?? sp?.algorithm ?? "calm",
    waterlinePosition: (properties.waterlinePosition as number) ?? sp?.waterlinePosition ?? 0.6,
    waveHeight: (properties.waveHeight as number) ?? sp?.waveHeight ?? 0.3,
    wavePeriod: (properties.wavePeriod as number) ?? sp?.wavePeriod ?? 0.8,
    waveComplexity: (properties.waveComplexity as number) ?? sp?.waveComplexity ?? 0.2,
    chop: (properties.chop as number) ?? sp?.chop ?? 0,
    surfaceColor: (properties.surfaceColor as string) || sp?.surfaceColor || "#2A4A6B",
    depthColor: (properties.depthColor as string) || sp?.depthColor || "#152535",
    shimmerIntensity: (properties.shimmerIntensity as number) ?? sp?.shimmerIntensity ?? 0.15,
    flowDirection: (properties.flowDirection as number) ?? sp?.flowDirection ?? 0,
    flowStrength: (properties.flowStrength as number) ?? sp?.flowStrength ?? 0,
    depthLane: (properties.depthLane as string) ?? "midground",
    atmosphericMode: (properties.atmosphericMode as AtmosphericMode) ?? "none",
  };
}

// ---------------------------------------------------------------------------
// Gerstner wave helpers
// ---------------------------------------------------------------------------

interface GerstnerWave {
  amplitude: number;
  frequency: number;
  dirX: number;
  dirY: number;
  phase: number;
  steepness: number;
}

function buildGerstnerWaves(seed: number, complexity: number, chop: number): GerstnerWave[] {
  const rng = mulberry32(seed + 500);
  const count = 3 + Math.round(complexity * 4); // 3-7 waves
  const waves: GerstnerWave[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (rng() - 0.5) * Math.PI * 0.8; // spread around forward direction
    waves.push({
      amplitude: (0.3 + rng() * 0.7) / (i + 1),
      frequency: 0.5 + rng() * 2 + i * 0.5,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      phase: rng() * Math.PI * 2,
      steepness: 0.2 + chop * 0.6,
    });
  }
  return waves;
}

/** Evaluate Gerstner wave displacement at a point. Returns vertical offset. */
function gerstnerY(waves: GerstnerWave[], x: number, phase: number): number {
  let sum = 0;
  for (const w of waves) {
    const dot = w.dirX * x * w.frequency;
    sum += w.amplitude * Math.cos(dot + w.phase + phase);
  }
  return sum;
}

/** Evaluate Gerstner wave slope at a point (for shading). */
function gerstnerSlope(waves: GerstnerWave[], x: number, phase: number): number {
  let sum = 0;
  for (const w of waves) {
    const dot = w.dirX * x * w.frequency;
    sum += -w.amplitude * w.frequency * w.dirX * Math.sin(dot + w.phase + phase);
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderCalm(p: ResolvedSurfaceProps, ctx: CanvasRenderingContext2D, bx: number, by: number, width: number, height: number): void {
  const waterTop = by + height * p.waterlinePosition;
  const waterHeight = height - height * p.waterlinePosition;
  if (waterHeight <= 0) return;

  const [sr, sg, sb] = parseHex(p.surfaceColor);
  const [dr, dg, db] = parseHex(p.depthColor);

  // Gradient fill
  const grad = ctx.createLinearGradient(bx, waterTop, bx, by + height);
  grad.addColorStop(0, `rgb(${sr},${sg},${sb})`);
  grad.addColorStop(1, `rgb(${dr},${dg},${db})`);
  ctx.fillStyle = grad;
  ctx.fillRect(bx, waterTop, width, waterHeight);

  // Horizontal wave lines (stripe compositing)
  const rng = mulberry32(p.seed);
  const noise = createValueNoise(p.seed);
  const lineCount = Math.max(3, Math.round(p.waveHeight * 30 + 5));
  const step = Math.max(2, Math.round(width / 200));

  for (let i = 0; i < lineCount; i++) {
    const t = (i + 0.5) / lineCount;
    const lineY = waterTop + t * waterHeight;
    const alpha = Math.max(0.03, 0.2 * (1 - t));

    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = Math.max(0.3, 1 - t * 0.5);
    ctx.beginPath();

    for (let px = 0; px <= width; px += step) {
      const offset = (noise(px * 0.01, i * 5) - 0.5) * p.waveHeight * 8;
      if (px === 0) ctx.moveTo(bx + px, lineY + offset);
      else ctx.lineTo(bx + px, lineY + offset);
    }
    ctx.stroke();
  }

  // Shimmer highlights
  if (p.shimmerIntensity > 0) {
    renderShimmer(p, ctx, rng, bx, waterTop, width, waterHeight);
  }
}

function renderOcean(p: ResolvedSurfaceProps, ctx: CanvasRenderingContext2D, bx: number, by: number, width: number, height: number): void {
  const waterTop = by + height * p.waterlinePosition;
  const waterHeight = height - height * p.waterlinePosition;
  if (waterHeight <= 0) return;

  const [sr, sg, sb] = parseHex(p.surfaceColor);
  const [dr, dg, db] = parseHex(p.depthColor);

  // Base gradient fill
  const grad = ctx.createLinearGradient(bx, waterTop, bx, by + height);
  grad.addColorStop(0, `rgb(${sr},${sg},${sb})`);
  grad.addColorStop(1, `rgb(${dr},${dg},${db})`);
  ctx.fillStyle = grad;
  ctx.fillRect(bx, waterTop, width, waterHeight);

  // Gerstner wave lines
  const waves = buildGerstnerWaves(p.seed, p.waveComplexity, p.chop);
  const rng = mulberry32(p.seed);
  const rowCount = Math.max(8, Math.round(20 + p.waveComplexity * 20));
  const xStep = Math.max(2, Math.round(width / 300));

  for (let row = 0; row < rowCount; row++) {
    const rowT = (row + 0.5) / rowCount;
    const baseY = waterTop + rowT * waterHeight;
    const depthFade = 1 - rowT; // stronger at surface

    // Wave line with Gerstner displacement
    ctx.beginPath();
    const ampScale = p.waveHeight * waterHeight * 0.03 * depthFade;

    for (let px = 0; px <= width; px += xStep) {
      const nx = px / width;
      const gy = gerstnerY(waves, nx * 10, row * 0.8) * ampScale;

      if (px === 0) ctx.moveTo(bx + px, baseY + gy);
      else ctx.lineTo(bx + px, baseY + gy);
    }

    // Shade by slope: bright peaks, dark troughs
    const slopeAtMid = gerstnerSlope(waves, 0.5 * 10, row * 0.8);
    const slopeBrightness = 0.5 + slopeAtMid * 0.3;
    const lineAlpha = Math.max(0.03, 0.15 * depthFade * slopeBrightness);

    ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
    ctx.lineWidth = Math.max(0.3, (1.5 - rowT) * (1 + p.chop));
    ctx.stroke();
  }

  // Shimmer
  if (p.shimmerIntensity > 0) {
    renderShimmer(p, ctx, rng, bx, waterTop, width, waterHeight);
  }
}

function renderFlow(p: ResolvedSurfaceProps, ctx: CanvasRenderingContext2D, bx: number, by: number, width: number, height: number): void {
  const waterTop = by + height * p.waterlinePosition;
  const waterHeight = height - height * p.waterlinePosition;
  if (waterHeight <= 0) return;

  const [sr, sg, sb] = parseHex(p.surfaceColor);
  const [dr, dg, db] = parseHex(p.depthColor);

  // Base gradient
  const grad = ctx.createLinearGradient(bx, waterTop, bx, by + height);
  grad.addColorStop(0, `rgb(${sr},${sg},${sb})`);
  grad.addColorStop(1, `rgb(${dr},${dg},${db})`);
  ctx.fillStyle = grad;
  ctx.fillRect(bx, waterTop, width, waterHeight);

  // Flow-field lines following current direction
  const rng = mulberry32(p.seed);
  const noise = createFractalNoise(p.seed, 3);
  const flowDx = Math.cos(p.flowDirection) * p.flowStrength;
  const flowDy = Math.sin(p.flowDirection) * p.flowStrength;
  const lineCount = Math.max(5, Math.round(15 + p.waveComplexity * 25));
  const segmentCount = 40;

  for (let i = 0; i < lineCount; i++) {
    // Start points spread across the water zone
    let lx = bx + rng() * width;
    let ly = waterTop + rng() * waterHeight;
    const alpha = Math.max(0.03, 0.15 * (1 - (ly - waterTop) / waterHeight));

    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 0.5 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(lx, ly);

    for (let s = 0; s < segmentCount; s++) {
      const nx = (lx - bx) / width;
      const ny = (ly - waterTop) / waterHeight;
      // Flow direction + noise perturbation
      const n = noise(nx * 4, ny * 4);
      const angle = p.flowDirection + (n - 0.5) * Math.PI * 0.6;
      const speed = p.flowStrength * 3 + p.waveHeight * 2;

      lx += Math.cos(angle) * speed;
      ly += Math.sin(angle) * speed;

      // Clamp to water zone
      if (lx < bx || lx > bx + width || ly < waterTop || ly > by + height) break;

      ctx.lineTo(lx, ly);
    }
    ctx.stroke();
  }

  // Cross-line ripples perpendicular to flow
  const rippleCount = Math.round(p.waveHeight * 20);
  const crossAngle = p.flowDirection + Math.PI / 2;
  const crossDx = Math.cos(crossAngle);
  const crossDy = Math.sin(crossAngle);

  for (let i = 0; i < rippleCount; i++) {
    const cx = bx + rng() * width;
    const cy = waterTop + rng() * waterHeight;
    const len = 5 + rng() * 15;
    const rippleAlpha = 0.05 + rng() * 0.1;

    ctx.strokeStyle = `rgba(255,255,255,${rippleAlpha})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - crossDx * len, cy - crossDy * len);
    ctx.lineTo(cx + crossDx * len, cy + crossDy * len);
    ctx.stroke();
  }

  // Shimmer
  if (p.shimmerIntensity > 0) {
    renderShimmer(p, ctx, rng, bx, waterTop, width, waterHeight);
  }
}

function renderShimmer(
  p: ResolvedSurfaceProps,
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  bx: number,
  waterTop: number,
  width: number,
  waterHeight: number,
): void {
  const shimmerCount = Math.round(p.shimmerIntensity * 80);
  ctx.fillStyle = "rgba(255,255,255,0.4)";

  for (let i = 0; i < shimmerCount; i++) {
    const sx = bx + rng() * width;
    const depthT = rng() * 0.4;
    const sy = waterTop + depthT * waterHeight;
    const sw = 1 + rng() * 3;
    const sh = 0.5 + rng() * 1;
    const shimAlpha = (1 - depthT) * p.shimmerIntensity * 0.6;

    ctx.globalAlpha = shimAlpha;
    ctx.fillRect(sx, sy, sw, sh);
  }
  ctx.globalAlpha = 1;
}

export const surfaceLayerType: LayerTypeDefinition = {
  typeId: "water:surface",
  displayName: "Water Surface",
  icon: "water",
  category: "draw",
  properties: SURFACE_PROPERTIES,
  propertyEditorId: "water:surface-editor",

  createDefault(): LayerProperties {
    return createDefaultProps(SURFACE_PROPERTIES);
  },

  render(properties, ctx, bounds): void {
    const p = resolveProps(properties);
    const { width, height, x: bx, y: by } = bounds;

    // Apply atmospheric depth to colors
    let surfaceColor = p.surfaceColor;
    let depthColor = p.depthColor;
    if (p.atmosphericMode !== "none") {
      const laneConfig = resolveDepthLane(p.depthLane);
      if (laneConfig) {
        surfaceColor = applyAtmosphericDepth(surfaceColor, laneConfig.depth, p.atmosphericMode);
        depthColor = applyAtmosphericDepth(depthColor, laneConfig.depth, p.atmosphericMode);
      }
    }

    const adjusted = { ...p, surfaceColor, depthColor };

    switch (adjusted.algorithm) {
      case "calm":
        renderCalm(adjusted, ctx, bx, by, width, height);
        break;
      case "ocean":
        renderOcean(adjusted, ctx, bx, by, width, height);
        break;
      case "flow":
        renderFlow(adjusted, ctx, bx, by, width, height);
        break;
    }
  },

  validate(properties): ValidationError[] | null {
    const errors: ValidationError[] = [];
    const presetId = properties.preset as string;
    if (presetId && !getPreset(presetId)) {
      errors.push({ property: "preset", message: `Unknown water preset "${presetId}"` });
    }
    return errors.length > 0 ? errors : null;
  },
};
