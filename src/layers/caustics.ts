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

    // Three noise layers: two base + one high-frequency detail (ref: pool caustics 103817)
    const noise1 = createFractalNoise(p.seed + 300, 3);
    const noise2 = createFractalNoise(p.seed + 700, 2);
    const noiseDetail = createValueNoise(p.seed + 900);

    const [br, bg, bb] = parseHex(p.bottomColor);
    // Warm caustic light — shifted toward yellow-white (ref: shallow caustics photos)
    const warmLight = lighten(p.bottomColor, 0.6);
    const [wlr, wlg, wlb] = parseHex(warmLight);
    // Extra warm: boost red/green relative to blue
    const lr = Math.min(255, wlr + 30);
    const lg = Math.min(255, wlg + 15);
    const lb = wlb;

    // Smaller cells for sharper web edges
    const cellSize = Math.max(2, Math.round(5 * p.causticScale));
    const lightOffsetX = p.lightAngle * 0.3;

    for (let cy = waterTop; cy < by + height; cy += cellSize) {
      const depthT = (cy - waterTop) / waterHeight;
      const depthFade = Math.max(0, 1 - depthT * 1.3) * p.clarity;
      if (depthFade < 0.01) continue;

      for (let cx = bx; cx < bx + width; cx += cellSize) {
        const nx = (cx - bx) / width;
        const ny = (cy - waterTop) / waterHeight;

        // Two overlapping noise patterns create caustic web
        const freq = 8 / p.causticScale;
        const n1 = noise1((nx + lightOffsetX) * freq * 0.75, ny * freq * 0.5);
        const n2 = noise2(nx * freq, (ny + 0.5) * freq * 0.625);

        // Caustic intensity: bright where both noise patterns peak
        const causticRaw = Math.max(0, n1 + n2 - 1) * 2;

        // High-frequency detail adds fine web structure
        const detail = noiseDetail(nx * freq * 2, ny * freq * 1.5);
        const caustic = causticRaw * (0.6 + detail * 0.6);
        if (caustic < 0.08) continue;

        // Sharper edges: apply power curve to concentrate brightness
        const sharpCaustic = Math.pow(caustic, 0.7);
        const intensity = sharpCaustic * p.causticIntensity * depthFade;

        const r = Math.round(br + (lr - br) * intensity);
        const g = Math.round(bg + (lg - bg) * intensity);
        const b = Math.round(bb + (lb - bb) * intensity);

        ctx.globalAlpha = Math.min(0.8, intensity * 0.7);
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
