import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  ValidationError,
} from "@genart-dev/core";
import { mulberry32 } from "../shared/prng.js";
import { parseHex, darken, lighten } from "../shared/color-utils.js";
import { createValueNoise } from "../shared/noise.js";
import { createDepthLaneProperty, createAtmosphericModeProperty, resolveDepthLane, applyAtmosphericDepth } from "../shared/depth-lanes.js";
import type { AtmosphericMode } from "../shared/depth-lanes.js";
import { getPreset } from "../presets/index.js";
import type { ShorelinePreset } from "../presets/types.js";
import { createDefaultProps, smoothstep } from "./shared.js";

type ShoreType = "beach" | "rocky" | "marsh" | "riverbank" | "tidal-flat" | "cliff-base";
type DebrisType = "none" | "seaweed" | "driftwood" | "shells" | "pebbles";
type WaveBreakStyle = "spilling" | "plunging" | "surging";

const SHORELINE_PROPERTIES: LayerPropertySchema[] = [
  {
    key: "preset",
    label: "Shoreline Type",
    type: "select",
    default: "sandy-beach",
    group: "preset",
    options: [
      { value: "sandy-beach", label: "Sandy Beach" },
      { value: "rocky-shore", label: "Rocky Shore" },
      { value: "muddy-riverbank", label: "Muddy Riverbank" },
      { value: "grassy-bank", label: "Grassy Bank" },
      { value: "tidal-flat", label: "Tidal Flat" },
      { value: "cliff-base", label: "Cliff Base" },
      { value: "marsh-edge", label: "Marsh Edge" },
    ],
  },
  { key: "seed", label: "Seed", type: "number", default: 42, min: 0, max: 99999, step: 1, group: "generation" },
  { key: "waterlinePosition", label: "Waterline Position", type: "number", default: 0.6, min: 0.1, max: 0.95, step: 0.05, group: "layout" },
  { key: "width", label: "Shore Width", type: "number", default: 0.08, min: 0.01, max: 0.25, step: 0.01, group: "layout" },
  { key: "color", label: "Shore Color", type: "color", default: "#D4C4A0", group: "colors" },
  { key: "wetColor", label: "Wet Color", type: "color", default: "#B0A080", group: "colors" },
  {
    key: "foamLine",
    label: "Foam Line",
    type: "select",
    default: "true",
    group: "water-edge",
    options: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
  },
  { key: "foamIntensity", label: "Foam Intensity", type: "number", default: 0.5, min: 0, max: 1, step: 0.05, group: "water-edge" },
  {
    key: "debrisType",
    label: "Debris",
    type: "select",
    default: "shells",
    group: "details",
    options: [
      { value: "none", label: "None" },
      { value: "seaweed", label: "Seaweed" },
      { value: "driftwood", label: "Driftwood" },
      { value: "shells", label: "Shells" },
      { value: "pebbles", label: "Pebbles" },
    ],
  },
  {
    key: "waveBreakStyle",
    label: "Wave Break",
    type: "select",
    default: "spilling",
    group: "water-edge",
    options: [
      { value: "spilling", label: "Spilling" },
      { value: "plunging", label: "Plunging" },
      { value: "surging", label: "Surging" },
    ],
  },
  createDepthLaneProperty("ground-plane"),
  createAtmosphericModeProperty(),
];

interface ResolvedShorelineProps {
  seed: number;
  waterlinePosition: number;
  width: number;
  color: string;
  wetColor: string;
  foamLine: boolean;
  foamIntensity: number;
  debrisType: DebrisType;
  waveBreakStyle: WaveBreakStyle;
  depthLane: string;
  atmosphericMode: AtmosphericMode;
}

function resolveProps(properties: LayerProperties): ResolvedShorelineProps {
  const presetId = properties.preset as string | undefined;
  const preset = presetId ? getPreset(presetId) : undefined;
  const sp = preset?.category === "shoreline" ? (preset as ShorelinePreset) : undefined;

  return {
    seed: (properties.seed as number) ?? 42,
    waterlinePosition: (properties.waterlinePosition as number) ?? 0.6,
    width: (properties.width as number) ?? sp?.width ?? 0.08,
    color: (properties.color as string) || sp?.color || "#D4C4A0",
    wetColor: (properties.wetColor as string) || sp?.wetColor || "#B0A080",
    foamLine: properties.foamLine === "false" ? false : (sp?.foamLine ?? true),
    foamIntensity: (properties.foamIntensity as number) ?? sp?.foamIntensity ?? 0.5,
    debrisType: (properties.debrisType as DebrisType) ?? sp?.debrisType ?? "shells",
    waveBreakStyle: (properties.waveBreakStyle as WaveBreakStyle) ?? sp?.waveBreakStyle ?? "spilling",
    depthLane: (properties.depthLane as string) ?? "ground-plane",
    atmosphericMode: (properties.atmosphericMode as AtmosphericMode) ?? "none",
  };
}

function renderDebris(
  type: DebrisType,
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  bx: number,
  shoreTop: number,
  shoreHeight: number,
  width: number,
  shoreColor: string,
): void {
  if (type === "none") return;

  const debrisCount = Math.round(30 + rng() * 30);
  for (let i = 0; i < debrisCount; i++) {
    const dx = bx + rng() * width;
    const dt = 0.6 + rng() * 0.35;
    const dy = shoreTop + shoreHeight * dt;

    switch (type) {
      case "seaweed": {
        ctx.globalAlpha = 0.2 + rng() * 0.15;
        ctx.strokeStyle = "#3A5A20";
        ctx.lineWidth = 0.5 + rng() * 0.5;
        const len = 3 + rng() * 8;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.quadraticCurveTo(dx + (rng() - 0.5) * 6, dy - len * 0.5, dx + (rng() - 0.5) * 4, dy - len);
        ctx.stroke();
        break;
      }
      case "driftwood": {
        ctx.globalAlpha = 0.15 + rng() * 0.1;
        ctx.strokeStyle = darken(shoreColor, 0.5);
        ctx.lineWidth = 1 + rng() * 2;
        const len = 5 + rng() * 15;
        const angle = rng() * Math.PI;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + Math.cos(angle) * len, dy + Math.sin(angle) * len * 0.3);
        ctx.stroke();
        break;
      }
      case "shells": {
        ctx.globalAlpha = 0.15 + rng() * 0.15;
        ctx.fillStyle = lighten(shoreColor, 0.3 + rng() * 0.2);
        const sz = 1 + rng() * 2.5;
        ctx.beginPath();
        ctx.arc(dx, dy, sz, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "pebbles": {
        ctx.globalAlpha = 0.2 + rng() * 0.15;
        ctx.fillStyle = rng() > 0.5 ? darken(shoreColor, 0.6) : darken(shoreColor, 0.75);
        const pw = 1.5 + rng() * 3;
        const ph = 1 + rng() * 2;
        ctx.fillRect(dx - pw / 2, dy - ph / 2, pw, ph);
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

export const shorelineLayerType: LayerTypeDefinition = {
  typeId: "water:shoreline",
  displayName: "Shoreline",
  icon: "shore",
  category: "draw",
  properties: SHORELINE_PROPERTIES,
  propertyEditorId: "water:shoreline-editor",

  createDefault(): LayerProperties {
    return createDefaultProps(SHORELINE_PROPERTIES);
  },

  render(properties, ctx, bounds): void {
    const p = resolveProps(properties);
    const { width, height, x: bx, y: by } = bounds;

    // Apply atmospheric depth
    let shoreColor = p.color;
    let wetColor = p.wetColor;
    if (p.atmosphericMode !== "none") {
      const laneConfig = resolveDepthLane(p.depthLane);
      if (laneConfig) {
        shoreColor = applyAtmosphericDepth(shoreColor, laneConfig.depth, p.atmosphericMode);
        wetColor = applyAtmosphericDepth(wetColor, laneConfig.depth, p.atmosphericMode);
      }
    }

    const waterY = by + height * p.waterlinePosition;
    const shoreHeight = height * p.width;
    const shoreTop = waterY - shoreHeight;
    if (shoreHeight <= 0) return;

    const rng = mulberry32(p.seed);
    const noise = createValueNoise(p.seed);
    const step = Math.max(2, Math.round(width / 200));

    // Shore gradient: dry sand → distinct dark wet strip → water edge
    // (ref: aerial-beach-waves-shoreline — 3 clear zones)
    const shoreGrad = ctx.createLinearGradient(bx, shoreTop, bx, waterY);
    shoreGrad.addColorStop(0, shoreColor);
    shoreGrad.addColorStop(0.55, shoreColor);
    shoreGrad.addColorStop(0.65, wetColor); // sharp transition to wet sand
    shoreGrad.addColorStop(0.85, darken(wetColor, 0.8)); // darker wet strip near water
    shoreGrad.addColorStop(1, darken(wetColor, 0.7));

    // Noise-modulated shore shape
    ctx.beginPath();
    ctx.moveTo(bx, shoreTop);
    for (let px = 0; px <= width; px += step) {
      const n = noise(px * 0.01, 0) * 3;
      ctx.lineTo(bx + px, shoreTop + n);
    }
    for (let px = width; px >= 0; px -= step) {
      const n = noise(px * 0.015, 5) * shoreHeight * 0.15;
      ctx.lineTo(bx + px, waterY + n);
    }
    ctx.closePath();
    ctx.fillStyle = shoreGrad;
    ctx.fill();

    // Wet sand texture — irregular dark patches in the wet zone
    const wetZoneTop = shoreTop + shoreHeight * 0.6;
    for (let i = 0; i < 40; i++) {
      const wx = bx + rng() * width;
      const wy = wetZoneTop + rng() * (waterY - wetZoneTop);
      const ww = 3 + rng() * 12;
      const wh = 1 + rng() * 3;
      ctx.globalAlpha = 0.05 + rng() * 0.08;
      ctx.fillStyle = darken(wetColor, 0.6);
      ctx.fillRect(wx, wy, ww, wh);
    }
    ctx.globalAlpha = 1;

    // Lace foam pattern at water edge (ref: wet-sand-beach-waterline photos)
    if (p.foamLine && p.foamIntensity > 0) {
      // Lace foam: noise-thresholded white in a band along the waterline
      const foamBandHeight = shoreHeight * 0.3;
      const foamCellSize = 2;

      for (let cy = waterY - foamBandHeight; cy < waterY + 3; cy += foamCellSize) {
        for (let cx = bx; cx < bx + width; cx += foamCellSize) {
          const nx = (cx - bx) / width;
          const bandT = (cy - (waterY - foamBandHeight)) / foamBandHeight;
          const n = noise(nx * 15, bandT * 8 + 10);

          // Foam concentrates near the waterline (bandT ≈ 1)
          const proximityBoost = smoothstep(bandT);
          const threshold = 0.7 - p.foamIntensity * 0.3 - proximityBoost * 0.2;
          if (n < threshold) continue;

          const foamAlpha = (n - threshold) / (1 - threshold) * p.foamIntensity * 0.7 * (0.3 + proximityBoost * 0.7);
          ctx.globalAlpha = foamAlpha;
          ctx.fillStyle = "rgba(255,255,255,1)";
          ctx.fillRect(cx, cy, foamCellSize, foamCellSize);
        }
      }
      ctx.globalAlpha = 1;

      // Wave break style: distinct foam line strokes on top
      const passCount = p.waveBreakStyle === "plunging" ? 3 : 2;
      const baseWidth = p.waveBreakStyle === "surging" ? 0.5 : 1.5 + p.foamIntensity;
      ctx.lineWidth = baseWidth;

      for (let pass = 0; pass < passCount; pass++) {
        ctx.globalAlpha = p.foamIntensity * (pass === 0 ? 0.5 : 0.25);
        ctx.strokeStyle = "rgba(255,255,255,1)";
        ctx.beginPath();
        const yOffset = pass * 2.5;
        for (let px = 0; px <= width; px += step) {
          const n = noise(px * 0.015 + pass * 3, 5) * shoreHeight * 0.15;
          const foamN = noise(px * 0.03, 10 + pass) * 2;
          const fy = waterY + n - yOffset + foamN;
          if (px === 0) ctx.moveTo(bx + px, fy);
          else ctx.lineTo(bx + px, fy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Debris
    renderDebris(p.debrisType, ctx, rng, bx, shoreTop, shoreHeight, width, shoreColor);
  },

  validate(properties): ValidationError[] | null {
    const errors: ValidationError[] = [];
    const presetId = properties.preset as string;
    if (presetId && !getPreset(presetId)) {
      errors.push({ property: "preset", message: `Unknown shoreline preset "${presetId}"` });
    }
    return errors.length > 0 ? errors : null;
  },
};
