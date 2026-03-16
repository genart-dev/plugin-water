import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  ValidationError,
} from "@genart-dev/core";
import { parseHex, lerpColor, lighten } from "../shared/color-utils.js";
import { createValueNoise, createFractalNoise } from "../shared/noise.js";
import { createDepthLaneProperty } from "../shared/depth-lanes.js";
import { getPreset } from "../presets/index.js";
import type { CausticsPreset } from "../presets/types.js";
import { createDefaultProps } from "./shared.js";

const CAUSTICS_PROPERTIES: LayerPropertySchema[] = [
  {
    key: "preset",
    label: "Caustic Type",
    type: "select",
    default: "shallow-caustics",
    group: "preset",
    options: [
      { value: "shallow-caustics", label: "Shallow Caustics" },
      { value: "deep-pool-caustics", label: "Deep Pool" },
      { value: "tropical-caustics", label: "Tropical Caustics" },
    ],
  },
  { key: "seed", label: "Seed", type: "number", default: 42, min: 0, max: 99999, step: 1, group: "generation" },
  { key: "waterlinePosition", label: "Waterline Position", type: "number", default: 0.6, min: 0.1, max: 0.95, step: 0.05, group: "layout" },
  { key: "clarity", label: "Clarity", type: "number", default: 0.7, min: 0, max: 1, step: 0.05, group: "caustics" },
  { key: "causticScale", label: "Scale", type: "number", default: 0.5, min: 0.1, max: 1, step: 0.05, group: "caustics" },
  { key: "causticIntensity", label: "Intensity", type: "number", default: 0.6, min: 0, max: 1, step: 0.05, group: "caustics" },
  { key: "bottomColor", label: "Bottom Color", type: "color", default: "#C8B890", group: "colors" },
  { key: "lightAngle", label: "Light Angle", type: "number", default: 0.3, min: 0, max: 1, step: 0.05, group: "caustics" },
  createDepthLaneProperty("midground"),
];

interface ResolvedCausticsProps {
  seed: number;
  waterlinePosition: number;
  clarity: number;
  causticScale: number;
  causticIntensity: number;
  bottomColor: string;
  lightAngle: number;
}

function resolveProps(properties: LayerProperties): ResolvedCausticsProps {
  const presetId = properties.preset as string | undefined;
  const preset = presetId ? getPreset(presetId) : undefined;
  const cp = preset?.category === "caustics" ? (preset as CausticsPreset) : undefined;

  return {
    seed: (properties.seed as number) ?? 42,
    waterlinePosition: (properties.waterlinePosition as number) ?? 0.6,
    clarity: (properties.clarity as number) ?? cp?.clarity ?? 0.7,
    causticScale: (properties.causticScale as number) ?? cp?.causticScale ?? 0.5,
    causticIntensity: (properties.causticIntensity as number) ?? cp?.causticIntensity ?? 0.6,
    bottomColor: (properties.bottomColor as string) || cp?.bottomColor || "#C8B890",
    lightAngle: (properties.lightAngle as number) ?? cp?.lightAngle ?? 0.3,
  };
}

export const causticsLayerType: LayerTypeDefinition = {
  typeId: "water:caustics",
  displayName: "Caustics",
  icon: "caustics",
  category: "draw",
  properties: CAUSTICS_PROPERTIES,
  propertyEditorId: "water:caustics-editor",

  createDefault(): LayerProperties {
    return createDefaultProps(CAUSTICS_PROPERTIES);
  },

  render(properties, ctx, bounds): void {
    const p = resolveProps(properties);
    const { width, height, x: bx, y: by } = bounds;

    // Caustics only visible in water zone
    const waterTop = by + height * p.waterlinePosition;
    const waterHeight = height - height * p.waterlinePosition;
    if (waterHeight <= 0 || p.clarity < 0.3) return;

    const noise1 = createFractalNoise(p.seed + 300, 3);
    const noise2 = createFractalNoise(p.seed + 700, 2);

    const [br, bg, bb] = parseHex(p.bottomColor);
    const lightColor = lighten(p.bottomColor, 0.5);
    const [lr, lg, lb] = parseHex(lightColor);

    // Render caustic pattern as a grid of cells
    const cellSize = Math.max(3, Math.round(8 * p.causticScale));
    const lightOffsetX = p.lightAngle * 0.3;

    for (let cy = waterTop; cy < by + height; cy += cellSize) {
      const depthT = (cy - waterTop) / waterHeight;
      // Caustics fade with depth and low clarity
      const depthFade = Math.max(0, 1 - depthT * 1.5) * p.clarity;
      if (depthFade < 0.01) continue;

      for (let cx = bx; cx < bx + width; cx += cellSize) {
        const nx = (cx - bx) / width;
        const ny = (cy - waterTop) / waterHeight;

        // Two overlapping noise patterns create caustic web
        const n1 = noise1((nx + lightOffsetX) * (6 / p.causticScale), ny * (4 / p.causticScale));
        const n2 = noise2(nx * (8 / p.causticScale), (ny + 0.5) * (5 / p.causticScale));

        // Caustic intensity: bright where both noise patterns peak
        const caustic = Math.max(0, n1 + n2 - 1) * 2;
        if (caustic < 0.1) continue;

        const intensity = caustic * p.causticIntensity * depthFade;
        const r = Math.round(br + (lr - br) * intensity);
        const g = Math.round(bg + (lg - bg) * intensity);
        const b = Math.round(bb + (lb - bb) * intensity);

        ctx.globalAlpha = intensity * 0.6;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(cx, cy, cellSize, cellSize);
      }
    }

    ctx.globalAlpha = 1;
  },

  validate(properties): ValidationError[] | null {
    const errors: ValidationError[] = [];
    const presetId = properties.preset as string;
    if (presetId && !getPreset(presetId)) {
      errors.push({ property: "preset", message: `Unknown caustics preset "${presetId}"` });
    }
    return errors.length > 0 ? errors : null;
  },
};
