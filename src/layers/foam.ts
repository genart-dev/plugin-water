import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  ValidationError,
} from "@genart-dev/core";
import { mulberry32 } from "../shared/prng.js";
import { parseHex, darken } from "../shared/color-utils.js";
import { createValueNoise, createFractalNoise, createWarpedNoise } from "../shared/noise.js";
import { createDepthLaneProperty } from "../shared/depth-lanes.js";
import { getPreset } from "../presets/index.js";
import type { FoamPreset } from "../presets/types.js";
import { createDefaultProps, smoothstep } from "./shared.js";

const FOAM_PROPERTIES: LayerPropertySchema[] = [
  {
    key: "preset",
    label: "Foam Type",
    type: "select",
    default: "ocean-whitecaps",
    group: "preset",
    options: [
      { value: "ocean-whitecaps", label: "Ocean Whitecaps" },
      { value: "surf-foam", label: "Surf Foam" },
      { value: "gentle-foam", label: "Gentle Foam" },
      { value: "storm-foam", label: "Storm Foam" },
    ],
  },
  { key: "seed", label: "Seed", type: "number", default: 42, min: 0, max: 99999, step: 1, group: "generation" },
  { key: "waterlinePosition", label: "Waterline Position", type: "number", default: 0.6, min: 0.1, max: 0.95, step: 0.05, group: "layout" },
  { key: "foamColor", label: "Foam Color", type: "color", default: "#F0F0F0", group: "colors" },
  { key: "foamAmount", label: "Foam Amount", type: "number", default: 0.5, min: 0, max: 1, step: 0.05, group: "foam" },
  { key: "whitecapThreshold", label: "Whitecap Threshold", type: "number", default: 0.6, min: 0, max: 1, step: 0.05, group: "foam" },
  { key: "foamTrailLength", label: "Trail Length", type: "number", default: 0.3, min: 0, max: 1, step: 0.05, group: "foam" },
  { key: "langmuirStrength", label: "Langmuir Streaks", type: "number", default: 0.2, min: 0, max: 1, step: 0.05, group: "foam" },
  { key: "bubbleIntensity", label: "Bubble Intensity", type: "number", default: 0.15, min: 0, max: 1, step: 0.05, group: "foam" },
  createDepthLaneProperty("midground"),
];

interface ResolvedFoamProps {
  seed: number;
  waterlinePosition: number;
  foamColor: string;
  foamAmount: number;
  whitecapThreshold: number;
  foamTrailLength: number;
  langmuirStrength: number;
  bubbleIntensity: number;
}

function resolveProps(properties: LayerProperties): ResolvedFoamProps {
  const presetId = properties.preset as string | undefined;
  const preset = presetId ? getPreset(presetId) : undefined;
  const fp = preset?.category === "foam" ? (preset as FoamPreset) : undefined;

  return {
    seed: (properties.seed as number) ?? 42,
    waterlinePosition: (properties.waterlinePosition as number) ?? 0.6,
    foamColor: (properties.foamColor as string) || fp?.foamColor || "#F0F0F0",
    foamAmount: (properties.foamAmount as number) ?? fp?.foamAmount ?? 0.5,
    whitecapThreshold: (properties.whitecapThreshold as number) ?? fp?.whitecapThreshold ?? 0.6,
    foamTrailLength: (properties.foamTrailLength as number) ?? fp?.foamTrailLength ?? 0.3,
    langmuirStrength: (properties.langmuirStrength as number) ?? fp?.langmuirStrength ?? 0.2,
    bubbleIntensity: (properties.bubbleIntensity as number) ?? fp?.bubbleIntensity ?? 0.15,
  };
}

export const foamLayerType: LayerTypeDefinition = {
  typeId: "water:foam",
  displayName: "Foam & Whitecaps",
  icon: "foam",
  category: "draw",
  properties: FOAM_PROPERTIES,
  propertyEditorId: "water:foam-editor",

  createDefault(): LayerProperties {
    return createDefaultProps(FOAM_PROPERTIES);
  },

  render(properties, ctx, bounds): void {
    const p = resolveProps(properties);
    const { width, height, x: bx, y: by } = bounds;

    const waterTop = by + height * p.waterlinePosition;
    const waterHeight = height - height * p.waterlinePosition;
    if (waterHeight <= 0) return;

    const rng = mulberry32(p.seed);
    const warpNoise = createWarpedNoise(p.seed + 200, 3, 0.6);
    const detailNoise = createValueNoise(p.seed + 300);
    const [fr, fg, fb] = parseHex(p.foamColor);

    // --- Built-in surface underlay (ref: foam needs water context to read) ---
    // Water-blue gradient underneath so foam reads as floating on water
    const surfGrad = ctx.createLinearGradient(bx, waterTop, bx, by + height);
    surfGrad.addColorStop(0, "#2A5070");
    surfGrad.addColorStop(1, "#152535");
    ctx.fillStyle = surfGrad;
    ctx.fillRect(bx, waterTop, width, waterHeight);

    // Subtle wave lines on the underlay
    const waveNoise = createValueNoise(p.seed + 100);
    const waveLineCount = 12;
    for (let i = 0; i < waveLineCount; i++) {
      const t = (i + 0.5) / waveLineCount;
      const ly = waterTop + t * t * waterHeight;
      const depthFade = 1 - t;
      ctx.strokeStyle = `rgba(255,255,255,${0.06 * depthFade})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const step = Math.max(2, Math.round(width / 200));
      for (let px = 0; px <= width; px += step) {
        const offset = (waveNoise(px * 0.015, i * 5) - 0.5) * 4;
        if (px === 0) ctx.moveTo(bx + px, ly + offset);
        else ctx.lineTo(bx + px, ly + offset);
      }
      ctx.stroke();
    }

    // --- Lace-like foam patches using noise thresholding ---
    // (ref: sea-foam-pattern-water-2757088 — fractal connected white networks)
    // 1px cells for fine lace detail; real foam has intricate web structure
    const cellSize = 1;
    // foamAmount 0.2→threshold 0.65, foamAmount 0.9→threshold 0.28
    const foamThreshold = 0.75 - p.foamAmount * 0.55;

    for (let cy = waterTop; cy < by + height; cy += cellSize) {
      const depthT = (cy - waterTop) / waterHeight;
      const depthFade = Math.max(0, 1 - depthT * 1.6);
      if (depthFade < 0.02) continue;

      for (let cx = bx; cx < bx + width; cx += cellSize) {
        const nx = (cx - bx) / width;
        const ny = depthT;

        // Domain-warped noise creates organic lace shapes
        const n = warpNoise(nx * 5, ny * 4);
        if (n < foamThreshold) continue;

        // Intensity ramps up above threshold — sqrt boost for visible opacity
        const foamStrength = Math.sqrt((n - foamThreshold) / (1 - foamThreshold));

        // Detail noise modulates alpha for lace breakup (soft, not binary cutoff)
        const detail = detailNoise(nx * 20, ny * 15);
        const detailFactor = smoothstep(detail * 1.5 - 0.2); // smooth ramp, not hard cut

        const alpha = Math.min(0.85, foamStrength * depthFade * detailFactor * 0.75);
        if (alpha < 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.fillRect(cx, cy, cellSize, cellSize);
      }
    }

    // --- Whitecap accents — brighter spots on top of the lace ---
    const capCount = Math.round(p.foamAmount * 40);
    for (let i = 0; i < capCount; i++) {
      const cx = bx + rng() * width;
      const depthT = rng() * rng() * 0.4; // bias near surface
      const cy = waterTop + depthT * waterHeight;

      const n = warpNoise((cx - bx) / width * 5, depthT * 4);
      if (n < foamThreshold + 0.1) continue; // only on foam patches

      const capW = 2 + rng() * 8 * p.foamAmount;
      const capH = 0.8 + rng() * 2;
      const alpha = (1 - depthT * 2) * 0.5;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, capW / 2, capH / 2, (rng() - 0.5) * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Trailing streak
      if (p.foamTrailLength > 0) {
        const trailLen = capW * (1 + p.foamTrailLength * 2);
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath();
        ctx.ellipse(cx + trailLen * 0.4, cy, trailLen / 2, capH * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Langmuir circulation streaks (wider, clustered, more organic) ---
    if (p.langmuirStrength > 0) {
      const streakCount = Math.round(p.langmuirStrength * 20);
      for (let i = 0; i < streakCount; i++) {
        const sx = bx + rng() * width;
        const sy = waterTop + rng() * waterHeight * 0.5;
        const len = 30 + rng() * 80 * p.langmuirStrength;
        const streakWidth = 1 + rng() * 3 * p.langmuirStrength;

        ctx.globalAlpha = 0.1 + rng() * 0.15 * p.langmuirStrength;
        ctx.strokeStyle = `rgb(${fr},${fg},${fb})`;
        ctx.lineWidth = streakWidth;
        ctx.beginPath();
        ctx.moveTo(sx, sy);

        const segments = 12;
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const lx = sx + t * len;
          const waver = (detailNoise(t * 3 + i * 0.7, i * 0.3) - 0.5) * 4;
          ctx.lineTo(lx, sy + waver);
        }
        ctx.stroke();
      }
    }

    // --- Bubble rafts ---
    if (p.bubbleIntensity > 0) {
      const bubbleCount = Math.round(p.bubbleIntensity * 150);
      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;

      for (let i = 0; i < bubbleCount; i++) {
        const bxPos = bx + rng() * width;
        const depthT = rng() * rng() * 0.3; // bias near surface
        const byPos = waterTop + depthT * waterHeight;
        const radius = 0.3 + rng() * 1.5;

        // Only place bubbles near foam patches
        const n = warpNoise((bxPos - bx) / width * 5, depthT * 4);
        if (n < foamThreshold - 0.1) continue;

        ctx.globalAlpha = (1 - depthT * 2) * p.bubbleIntensity * 0.35;
        ctx.beginPath();
        ctx.arc(bxPos, byPos, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  },

  validate(properties): ValidationError[] | null {
    const errors: ValidationError[] = [];
    const presetId = properties.preset as string;
    if (presetId && !getPreset(presetId)) {
      errors.push({ property: "preset", message: `Unknown foam preset "${presetId}"` });
    }
    return errors.length > 0 ? errors : null;
  },
};
