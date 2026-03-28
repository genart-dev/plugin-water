import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  ValidationError,
} from "@genart-dev/core";
import { mulberry32 } from "../shared/prng.js";
import { parseHex, darken, lighten, lerpColor } from "../shared/color-utils.js";
import { createValueNoise, createFractalNoise } from "../shared/noise.js";
import { createDepthLaneProperty } from "../shared/depth-lanes.js";
import { getPreset } from "../presets/index.js";
import type { IcePreset } from "../presets/types.js";
import { createDefaultProps, smoothstep } from "./shared.js";

const ICE_PROPERTIES: LayerPropertySchema[] = [
  {
    key: "preset",
    label: "Ice Type",
    type: "select",
    default: "frozen-lake",
    group: "preset",
    options: [
      { value: "frozen-lake", label: "Frozen Lake" },
      { value: "thin-ice", label: "Thin Ice" },
      { value: "pack-ice", label: "Pack Ice" },
      { value: "frost-glass", label: "Frost Glass" },
    ],
  },
  { key: "seed", label: "Seed", type: "number", default: 42, min: 0, max: 99999, step: 1, group: "generation" },
  { key: "waterlinePosition", label: "Waterline Position", type: "number", default: 0.6, min: 0.1, max: 0.95, step: 0.05, group: "layout" },
  { key: "iceThickness", label: "Ice Thickness", type: "number", default: 0.6, min: 0, max: 1, step: 0.05, group: "ice" },
  { key: "crackDensity", label: "Crack Density", type: "number", default: 0.4, min: 0, max: 1, step: 0.05, group: "ice" },
  { key: "frostIntensity", label: "Frost Intensity", type: "number", default: 0.3, min: 0, max: 1, step: 0.05, group: "ice" },
  { key: "snowCover", label: "Snow Cover", type: "number", default: 0.1, min: 0, max: 1, step: 0.05, group: "ice" },
  { key: "iceColor", label: "Ice Color", type: "color", default: "#C0D8E8", group: "colors" },
  { key: "crackColor", label: "Crack Color", type: "color", default: "#2A4A6A", group: "colors" },
  createDepthLaneProperty("midground"),
];

interface ResolvedIceProps {
  seed: number;
  waterlinePosition: number;
  iceThickness: number;
  crackDensity: number;
  frostIntensity: number;
  snowCover: number;
  iceColor: string;
  crackColor: string;
}

function resolveProps(properties: LayerProperties): ResolvedIceProps {
  const presetId = properties.preset as string | undefined;
  const preset = presetId ? getPreset(presetId) : undefined;
  const ip = preset?.category === "ice" ? (preset as IcePreset) : undefined;

  return {
    seed: (properties.seed as number) ?? 42,
    waterlinePosition: (properties.waterlinePosition as number) ?? 0.6,
    iceThickness: (properties.iceThickness as number) ?? ip?.iceThickness ?? 0.6,
    crackDensity: (properties.crackDensity as number) ?? ip?.crackDensity ?? 0.4,
    frostIntensity: (properties.frostIntensity as number) ?? ip?.frostIntensity ?? 0.3,
    snowCover: (properties.snowCover as number) ?? ip?.snowCover ?? 0.1,
    iceColor: (properties.iceColor as string) || ip?.iceColor || "#C0D8E8",
    crackColor: (properties.crackColor as string) || ip?.crackColor || "#2A4A6A",
  };
}

export const iceLayerType: LayerTypeDefinition = {
  typeId: "water:ice",
  displayName: "Ice",
  icon: "ice",
  category: "draw",
  properties: ICE_PROPERTIES,
  propertyEditorId: "water:ice-editor",

  createDefault(): LayerProperties {
    return createDefaultProps(ICE_PROPERTIES);
  },

  render(properties, ctx, bounds): void {
    const p = resolveProps(properties);
    const { width, height, x: bx, y: by } = bounds;

    const waterTop = by + height * p.waterlinePosition;
    const waterHeight = height - height * p.waterlinePosition;
    if (waterHeight <= 0) return;

    const rng = mulberry32(p.seed);
    const noise = createFractalNoise(p.seed + 400, 3);
    const frostNoise = createValueNoise(p.seed + 600);

    // --- Base ice fill ---
    // Thick ice = opaque; thin ice = semi-transparent over dark water
    const darkWater = darken(p.crackColor, 0.5);
    const [wr, wg, wb] = parseHex(darkWater);

    // Dark water beneath
    ctx.fillStyle = `rgb(${wr},${wg},${wb})`;
    ctx.fillRect(bx, waterTop, width, waterHeight);

    // Ice surface with noise-modulated transparency
    const [ir, ig, ib] = parseHex(p.iceColor);
    const cellSize = 4;

    for (let cy = waterTop; cy < by + height; cy += cellSize) {
      for (let cx = bx; cx < bx + width; cx += cellSize) {
        const nx = (cx - bx) / width;
        const ny = (cy - waterTop) / waterHeight;
        const n = noise(nx * 3, ny * 3);

        // Ice opacity varies with thickness and noise
        const iceAlpha = p.iceThickness * (0.5 + n * 0.5);
        ctx.globalAlpha = iceAlpha;
        ctx.fillStyle = `rgb(${ir},${ig},${ib})`;
        ctx.fillRect(cx, cy, cellSize, cellSize);
      }
    }
    ctx.globalAlpha = 1;

    // --- Cracks (ref: frozen-lake-ice-cracks-4685227 — sharp geometric plate fractures) ---
    if (p.crackDensity > 0) {
      const crackCount = Math.round(p.crackDensity * 30);
      const [cr, cg, cb] = parseHex(p.crackColor);

      for (let i = 0; i < crackCount; i++) {
        let cx = bx + rng() * width;
        let cy = waterTop + rng() * waterHeight;
        // Straighter main direction (real ice cracks are more linear than random walks)
        const mainAngle = rng() * Math.PI * 2;
        const segments = 6 + Math.round(rng() * 20);
        const crackAlpha = 0.35 + rng() * 0.45;

        // Main crack line — straighter with smaller angular deviation
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${crackAlpha})`;
        ctx.lineWidth = 0.3 + rng() * 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);

        for (let s = 0; s < segments; s++) {
          // Tighter angular deviation for straighter cracks
          const angle = mainAngle + (rng() - 0.5) * 0.6;
          const len = 5 + rng() * 15;
          cx += Math.cos(angle) * len;
          cy += Math.sin(angle) * len;

          if (cx < bx || cx > bx + width || cy < waterTop || cy > by + height) break;
          ctx.lineTo(cx, cy);

          // Branch at angular intersections (plate fracture junctions)
          if (rng() < 0.35 && p.crackDensity > 0.3) {
            // Branches tend toward 60° or 120° angles (crystalline)
            const branchOffset = (rng() > 0.5 ? 1 : -1) * (Math.PI / 3 + (rng() - 0.5) * 0.4);
            const branchAngle = angle + branchOffset;
            const branchLen = 4 + rng() * 12;
            const bx2 = cx + Math.cos(branchAngle) * branchLen;
            const by2 = cy + Math.sin(branchAngle) * branchLen;

            // Branch with same or slightly thinner stroke
            ctx.moveTo(cx, cy);
            ctx.lineTo(bx2, by2);
            ctx.moveTo(cx, cy);
          }
        }
        ctx.stroke();

        // Thin highlight along crack edge (light catching the crack lip)
        if (crackAlpha > 0.5) {
          ctx.strokeStyle = `rgba(255,255,255,${crackAlpha * 0.15})`;
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }
      }
    }

    // --- Frost patterns ---
    if (p.frostIntensity > 0) {
      const frostCount = Math.round(p.frostIntensity * 200);
      const frostColor = lighten(p.iceColor, 0.3);
      const [fr, fg, fb] = parseHex(frostColor);

      for (let i = 0; i < frostCount; i++) {
        const fx = bx + rng() * width;
        const fy = waterTop + rng() * waterHeight;
        const fn = frostNoise(fx * 0.02, fy * 0.02);

        if (fn < 0.4) continue;

        ctx.globalAlpha = (fn - 0.4) * p.frostIntensity * 0.5;
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;

        // Star-like frost crystal
        const size = 1 + rng() * 3;
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
          const angle = (a / 6) * Math.PI * 2;
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + Math.cos(angle) * size, fy + Math.sin(angle) * size);
        }
        ctx.strokeStyle = `rgb(${fr},${fg},${fb})`;
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // --- Snow cover ---
    if (p.snowCover > 0) {
      const snowNoise = createFractalNoise(p.seed + 800, 2);
      ctx.fillStyle = `rgba(255,255,255,1)`;

      for (let cy = waterTop; cy < by + height; cy += cellSize) {
        for (let cx = bx; cx < bx + width; cx += cellSize) {
          const nx = (cx - bx) / width;
          const ny = (cy - waterTop) / waterHeight;
          const n = snowNoise(nx * 4, ny * 4);

          if (n > 1 - p.snowCover) {
            const alpha = (n - (1 - p.snowCover)) / p.snowCover * 0.8;
            ctx.globalAlpha = alpha;
            ctx.fillRect(cx, cy, cellSize, cellSize);
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  },

  validate(properties): ValidationError[] | null {
    const errors: ValidationError[] = [];
    const presetId = properties.preset as string;
    if (presetId && !getPreset(presetId)) {
      errors.push({ property: "preset", message: `Unknown ice preset "${presetId}"` });
    }
    return errors.length > 0 ? errors : null;
  },
};
