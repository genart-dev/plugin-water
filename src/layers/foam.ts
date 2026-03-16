import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  ValidationError,
} from "@genart-dev/core";
import { mulberry32 } from "../shared/prng.js";
import { parseHex } from "../shared/color-utils.js";
import { createValueNoise, createFractalNoise } from "../shared/noise.js";
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
    const noise = createFractalNoise(p.seed + 200, 3);
    const [fr, fg, fb] = parseHex(p.foamColor);

    // --- Whitecap patches ---
    const capCount = Math.round(p.foamAmount * 60);
    for (let i = 0; i < capCount; i++) {
      const cx = bx + rng() * width;
      const depthT = rng() * 0.6; // concentrate near surface
      const cy = waterTop + depthT * waterHeight;

      // Only render if noise exceeds threshold (simulates wave crest)
      const n = noise((cx - bx) / width * 6, depthT * 4);
      if (n < p.whitecapThreshold) continue;

      const capW = 3 + rng() * 12 * p.foamAmount;
      const capH = 1 + rng() * 3;
      const alpha = (n - p.whitecapThreshold) / (1 - p.whitecapThreshold) * 0.6 * (1 - depthT);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;

      // Elliptical whitecap
      ctx.beginPath();
      ctx.ellipse(cx, cy, capW / 2, capH / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Trailing foam streak
      if (p.foamTrailLength > 0) {
        const trailLen = capW * (1 + p.foamTrailLength * 3);
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.beginPath();
        ctx.ellipse(cx + trailLen * 0.4, cy, trailLen / 2, capH * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Langmuir circulation streaks (wind-aligned foam lines) ---
    if (p.langmuirStrength > 0) {
      const streakCount = Math.round(p.langmuirStrength * 12);
      ctx.strokeStyle = `rgb(${fr},${fg},${fb})`;

      for (let i = 0; i < streakCount; i++) {
        const sx = bx + rng() * width;
        const sy = waterTop + rng() * waterHeight * 0.5;
        const len = 20 + rng() * 60 * p.langmuirStrength;

        ctx.globalAlpha = 0.08 + rng() * 0.12 * p.langmuirStrength;
        ctx.lineWidth = 0.3 + rng() * 0.7;
        ctx.beginPath();
        ctx.moveTo(sx, sy);

        // Slightly wavy streak line
        const segments = 8;
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const lx = sx + t * len;
          const ly = sy + Math.sin(t * Math.PI * 2 + i) * 1.5;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      }
    }

    // --- Bubble rafts ---
    if (p.bubbleIntensity > 0) {
      const bubbleCount = Math.round(p.bubbleIntensity * 100);
      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;

      for (let i = 0; i < bubbleCount; i++) {
        const bxPos = bx + rng() * width;
        const depthT = rng() * 0.3;
        const byPos = waterTop + depthT * waterHeight;
        const radius = 0.3 + rng() * 1.2;

        ctx.globalAlpha = (1 - depthT * 2) * p.bubbleIntensity * 0.4;
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
