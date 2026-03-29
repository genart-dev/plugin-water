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

  // Paired dark-trough / bright-crest wave lines (ref: still-lake photo 3085701)
  // Real calm water has alternating dark/bright bands from wave facets
  // More lines + varying wavelength = organic, not mechanical
  const rng = mulberry32(p.seed);
  const noise = createValueNoise(p.seed);
  const noiseDetail = createFractalNoise(p.seed + 50, 2);
  const lineCount = Math.max(15, Math.round(p.waveHeight * 80 + 25));
  const step = Math.max(1, Math.round(width / 400));

  for (let i = 0; i < lineCount; i++) {
    // Depth-compressed spacing with per-line jitter for organic feel
    const t = (i + 0.3 + rng() * 0.4) / lineCount;
    const compressed = t * t; // quadratic compression — more lines near waterline
    const lineY = waterTop + compressed * waterHeight;
    const depthFade = 1 - compressed;

    // Vary noise frequency per line so lines don't all have the same wavelength
    const freqMult = 0.008 + rng() * 0.015;
    const ampMult = p.waveHeight * (4 + rng() * 6);

    // Dark trough line (slightly below)
    const darkAlpha = Math.max(0.02, 0.15 * depthFade * (0.5 + p.waveHeight * 0.5));
    ctx.strokeStyle = `rgba(0,0,0,${darkAlpha})`;
    ctx.lineWidth = Math.max(0.5, (1.5 - compressed * 0.8) * (0.8 + p.waveHeight * 0.6));
    ctx.beginPath();
    for (let px = 0; px <= width; px += step) {
      const offset = (noise(px * freqMult, i * 5 + 1) - 0.5) * ampMult;
      if (px === 0) ctx.moveTo(bx + px, lineY + offset + 1.5);
      else ctx.lineTo(bx + px, lineY + offset + 1.5);
    }
    ctx.stroke();

    // Bright crest line (on top)
    const brightAlpha = Math.max(0.03, 0.3 * depthFade * (0.4 + p.waveHeight * 0.6));
    ctx.strokeStyle = `rgba(255,255,255,${brightAlpha})`;
    ctx.lineWidth = Math.max(0.3, (0.8 - compressed * 0.4));
    ctx.beginPath();
    for (let px = 0; px <= width; px += step) {
      const offset = (noise(px * freqMult, i * 5) - 0.5) * ampMult;
      if (px === 0) ctx.moveTo(bx + px, lineY + offset);
      else ctx.lineTo(bx + px, lineY + offset);
    }
    ctx.stroke();
  }

  // Subtle color variation — soft noise-based hue shifts across the surface
  // Use many small semi-transparent dots instead of blocky rectangles
  const patchCount = Math.round(200 + p.waveHeight * 100);
  for (let i = 0; i < patchCount; i++) {
    const px = bx + rng() * width;
    const py = waterTop + rng() * waterHeight * 0.7;
    const depthT = (py - waterTop) / waterHeight;
    const n = noiseDetail(px * 0.003, py * 0.003);
    ctx.globalAlpha = (0.01 + n * 0.02) * (1 - depthT);
    ctx.fillStyle = n > 0.5 ? "rgba(200,220,255,1)" : "rgba(0,20,50,1)";
    ctx.beginPath();
    ctx.arc(px, py, 3 + rng() * 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Horizon shimmer band — concentrated glare near waterline
  if (p.shimmerIntensity > 0) {
    const bandHeight = waterHeight * 0.15;
    const shimGrad = ctx.createLinearGradient(bx, waterTop, bx, waterTop + bandHeight);
    shimGrad.addColorStop(0, `rgba(255,255,255,${p.shimmerIntensity * 0.08})`);
    shimGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shimGrad;
    ctx.fillRect(bx, waterTop, width, bandHeight);

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

  // Gerstner wave lines with per-segment slope shading (ref: stormy ocean 5949243)
  // Real ocean waves have bright crests where light passes through thin water
  // and dark troughs in shadow — strong value contrast
  const waves = buildGerstnerWaves(p.seed, p.waveComplexity, p.chop);
  const rng = mulberry32(p.seed);
  const rowCount = Math.max(12, Math.round(30 + p.waveComplexity * 25));
  const xStep = Math.max(2, Math.round(width / 350));

  for (let row = 0; row < rowCount; row++) {
    const rowT = (row + 0.5) / rowCount;
    const baseY = waterTop + rowT * waterHeight;
    const depthFade = 1 - rowT * 0.8;
    const ampScale = p.waveHeight * waterHeight * 0.04 * depthFade;
    const lineWidth = Math.max(0.4, (2 - rowT * 1.2) * (1 + p.chop * 0.5));

    // Draw dark trough band first
    ctx.beginPath();
    for (let px = 0; px <= width; px += xStep) {
      const nx = px / width;
      const gy = gerstnerY(waves, nx * 10, row * 0.8) * ampScale;
      if (px === 0) ctx.moveTo(bx + px, baseY + gy + lineWidth * 1.5);
      else ctx.lineTo(bx + px, baseY + gy + lineWidth * 1.5);
    }
    const darkStrength = 0.08 + p.chop * 0.08;
    ctx.strokeStyle = `rgba(0,0,0,${Math.max(0.02, darkStrength * depthFade)})`;
    ctx.lineWidth = lineWidth * 1.5;
    ctx.stroke();

    // Draw bright crest line on top, with per-segment slope-based alpha
    // Build path segments with varying brightness
    for (let px = 0; px < width; px += xStep) {
      const nx = px / width;
      const nx2 = (px + xStep) / width;
      const gy1 = gerstnerY(waves, nx * 10, row * 0.8) * ampScale;
      const gy2 = gerstnerY(waves, nx2 * 10, row * 0.8) * ampScale;

      // Slope determines brightness: positive slope (rising face) = bright
      const slope = gerstnerSlope(waves, nx * 10, row * 0.8);
      const slopeFactor = smoothstep(0.5 + slope * 0.5); // 0=trough, 1=crest
      const brightAlpha = Math.max(0.02, (0.08 + slopeFactor * 0.25) * depthFade);

      ctx.strokeStyle = `rgba(255,255,255,${brightAlpha})`;
      ctx.lineWidth = lineWidth * (0.6 + slopeFactor * 0.6);
      ctx.beginPath();
      ctx.moveTo(bx + px, baseY + gy1);
      ctx.lineTo(bx + px + xStep, baseY + gy2);
      ctx.stroke();
    }
  }

  // Horizon shimmer band
  if (p.shimmerIntensity > 0) {
    const bandHeight = waterHeight * 0.12;
    const shimGrad = ctx.createLinearGradient(bx, waterTop, bx, waterTop + bandHeight);
    shimGrad.addColorStop(0, `rgba(255,255,255,${p.shimmerIntensity * 0.06})`);
    shimGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shimGrad;
    ctx.fillRect(bx, waterTop, width, bandHeight);

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

  // Dense flow-field lines with dark/bright pairing (ref: river current photos)
  // Rivers have many visible current streaks layered over each other
  const rng = mulberry32(p.seed);
  const noise = createFractalNoise(p.seed, 3);
  const lineCount = Math.max(40, Math.round(80 + p.waveComplexity * 100));
  const segmentCount = 60;

  for (let i = 0; i < lineCount; i++) {
    let lx = bx + rng() * width;
    let ly = waterTop + rng() * waterHeight;
    const depthT = (ly - waterTop) / waterHeight;
    const depthFade = 1 - depthT * 0.7;

    // Build path points first
    const points: [number, number][] = [[lx, ly]];
    for (let s = 0; s < segmentCount; s++) {
      const nx = (lx - bx) / width;
      const ny = (ly - waterTop) / waterHeight;
      const n = noise(nx * 4, ny * 4);
      const angle = p.flowDirection + (n - 0.5) * Math.PI * 0.6;
      const speed = p.flowStrength * 3 + p.waveHeight * 2 + 1;

      lx += Math.cos(angle) * speed;
      ly += Math.sin(angle) * speed;

      if (lx < bx || lx > bx + width || ly < waterTop || ly > by + height) break;
      points.push([lx, ly]);
    }
    if (points.length < 3) continue;

    // Dark shadow line (offset below)
    ctx.strokeStyle = `rgba(0,0,0,${0.08 * depthFade})`;
    ctx.lineWidth = 1.0 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(points[0]![0], points[0]![1] + 1.5);
    for (let j = 1; j < points.length; j++) ctx.lineTo(points[j]![0], points[j]![1] + 1.5);
    ctx.stroke();

    // Bright highlight line — varying width for natural feel
    const brightAlpha = Math.max(0.06, 0.25 * depthFade);
    ctx.strokeStyle = `rgba(255,255,255,${brightAlpha})`;
    ctx.lineWidth = 0.3 + rng() * 1.0;
    ctx.beginPath();
    ctx.moveTo(points[0]![0], points[0]![1]);
    for (let j = 1; j < points.length; j++) ctx.lineTo(points[j]![0], points[j]![1]);
    ctx.stroke();
  }

  // Cross-line ripples perpendicular to flow — dense field of short marks
  const rippleCount = Math.max(30, Math.round(p.waveHeight * 120 + 40));
  const crossAngle = p.flowDirection + Math.PI / 2;
  const crossDx = Math.cos(crossAngle);
  const crossDy = Math.sin(crossAngle);

  for (let i = 0; i < rippleCount; i++) {
    const cx = bx + rng() * width;
    const cy = waterTop + rng() * waterHeight;
    const depthT = (cy - waterTop) / waterHeight;
    const depthFade = 1 - depthT * 0.7;
    const len = 2 + rng() * 15;

    // Dark underline
    ctx.strokeStyle = `rgba(0,0,0,${0.06 * depthFade})`;
    ctx.lineWidth = 0.6 + rng() * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx - crossDx * len, cy - crossDy * len + 1);
    ctx.lineTo(cx + crossDx * len, cy + crossDy * len + 1);
    ctx.stroke();

    // Bright line
    ctx.strokeStyle = `rgba(255,255,255,${(0.08 + rng() * 0.15) * depthFade})`;
    ctx.lineWidth = 0.3 + rng() * 0.3;
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
  // Sun sparkle: elongated horizontal flecks concentrated near surface
  // (ref: sunlight-sparkling-water-surface photos)
  const shimmerCount = Math.round(p.shimmerIntensity * 120);

  // Sun path: sparkles concentrate in a vertical band (center ± 30% width)
  const sunCenterX = bx + width * 0.5;
  const sunSpread = width * 0.35;

  for (let i = 0; i < shimmerCount; i++) {
    // Gaussian-ish distribution around sun path
    const rawX = bx + rng() * width;
    const distFromSun = Math.abs(rawX - sunCenterX) / sunSpread;
    const pathWeight = Math.exp(-distFromSun * distFromSun * 1.5);

    // Concentrate near surface with exponential falloff
    const depthT = rng() * rng() * 0.5; // squared bias toward surface
    const sy = waterTop + depthT * waterHeight;
    const depthFade = 1 - depthT * 1.5;

    const sw = 1 + rng() * 4; // horizontal elongation
    const sh = 0.3 + rng() * 0.7;
    const shimAlpha = depthFade * pathWeight * p.shimmerIntensity * 0.5;

    if (shimAlpha < 0.01) continue;
    ctx.globalAlpha = shimAlpha;
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillRect(rawX, sy, sw, sh);
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
