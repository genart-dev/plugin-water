import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  ValidationError,
} from "@genart-dev/core";
import { mulberry32 } from "../shared/prng.js";
import { parseHex, darken } from "../shared/color-utils.js";
import { createValueNoise } from "../shared/noise.js";
import { createDepthLaneProperty, createAtmosphericModeProperty, resolveDepthLane, applyAtmosphericDepth } from "../shared/depth-lanes.js";
import type { AtmosphericMode } from "../shared/depth-lanes.js";
import { getPreset } from "../presets/index.js";
import type { ReflectionPreset } from "../presets/types.js";
import { createDefaultProps, smoothstep } from "./shared.js";

const REFLECTION_PROPERTIES: LayerPropertySchema[] = [
  {
    key: "preset",
    label: "Reflection Type",
    type: "select",
    default: "calm-lake-reflection",
    group: "preset",
    options: [
      { value: "calm-lake-reflection", label: "Calm Lake" },
      { value: "rippled-reflection", label: "Rippled Reflection" },
      { value: "dark-water-reflection", label: "Dark Water" },
      { value: "golden-reflection", label: "Golden Reflection" },
    ],
  },
  { key: "seed", label: "Seed", type: "number", default: 42, min: 0, max: 99999, step: 1, group: "generation" },
  { key: "skyColor", label: "Sky Color", type: "color", default: "#87CEEB", group: "colors" },
  { key: "terrainColor", label: "Terrain Color", type: "color", default: "#3A5A30", group: "colors" },
  { key: "reflectionStrength", label: "Reflection Strength", type: "number", default: 0.8, min: 0, max: 1, step: 0.05, group: "reflection" },
  { key: "reflectionBlur", label: "Blur", type: "number", default: 0.3, min: 0, max: 1, step: 0.05, group: "reflection" },
  { key: "reflectionDistortion", label: "Distortion", type: "number", default: 0.2, min: 0, max: 1, step: 0.05, group: "reflection" },
  { key: "waterlinePosition", label: "Waterline Position", type: "number", default: 0.5, min: 0.2, max: 0.9, step: 0.05, group: "layout" },
  createDepthLaneProperty("ground-plane"),
  createAtmosphericModeProperty(),
];

interface ResolvedReflectionProps {
  seed: number;
  skyColor: string;
  terrainColor: string;
  reflectionStrength: number;
  reflectionBlur: number;
  reflectionDistortion: number;
  waterlinePosition: number;
  depthLane: string;
  atmosphericMode: AtmosphericMode;
}

function resolveProps(properties: LayerProperties): ResolvedReflectionProps {
  const presetId = properties.preset as string | undefined;
  const preset = presetId ? getPreset(presetId) : undefined;
  const rp = preset?.category === "reflection" ? (preset as ReflectionPreset) : undefined;

  return {
    seed: (properties.seed as number) ?? 42,
    skyColor: (properties.skyColor as string) || rp?.skyColor || "#87CEEB",
    terrainColor: (properties.terrainColor as string) || rp?.terrainColor || "#3A5A30",
    reflectionStrength: (properties.reflectionStrength as number) ?? rp?.reflectionStrength ?? 0.8,
    reflectionBlur: (properties.reflectionBlur as number) ?? rp?.reflectionBlur ?? 0.3,
    reflectionDistortion: (properties.reflectionDistortion as number) ?? rp?.reflectionDistortion ?? 0.2,
    waterlinePosition: (properties.waterlinePosition as number) ?? rp?.waterlinePosition ?? 0.5,
    depthLane: (properties.depthLane as string) ?? "ground-plane",
    atmosphericMode: (properties.atmosphericMode as AtmosphericMode) ?? "none",
  };
}

export const reflectionLayerType: LayerTypeDefinition = {
  typeId: "water:reflection",
  displayName: "Water Reflection",
  icon: "reflection",
  category: "draw",
  properties: REFLECTION_PROPERTIES,
  propertyEditorId: "water:reflection-editor",

  createDefault(): LayerProperties {
    return createDefaultProps(REFLECTION_PROPERTIES);
  },

  render(properties, ctx, bounds): void {
    const p = resolveProps(properties);
    const rng = mulberry32(p.seed);
    const noise = createValueNoise(p.seed + 1000);
    const w = bounds.width;
    const h = bounds.height;

    // Apply atmospheric depth
    let skyColor = p.skyColor;
    let terrainColor = p.terrainColor;
    if (p.atmosphericMode !== "none") {
      const laneConfig = resolveDepthLane(p.depthLane);
      if (laneConfig) {
        skyColor = applyAtmosphericDepth(skyColor, laneConfig.depth, p.atmosphericMode);
        terrainColor = applyAtmosphericDepth(terrainColor, laneConfig.depth, p.atmosphericMode);
      }
    }

    // Darken reflected colors (water absorbs light)
    const darkFactor = 1 - p.reflectionStrength * 0.4;
    const reflectedSky = darken(skyColor, darkFactor);
    const reflectedTerrain = darken(terrainColor, darkFactor);

    const waterTop = bounds.y + p.waterlinePosition * h;
    const waterH = bounds.y + h - waterTop;
    if (waterH <= 0) return;

    const [skyR, skyG, skyB] = parseHex(reflectedSky);
    const [terR, terG, terB] = parseHex(reflectedTerrain);

    // Render reflected color bands with noise-based ripple distortion
    const sliceCount = Math.ceil(w / 2);
    const rowCount = 20;

    for (let i = 0; i < sliceCount; i++) {
      const nx = i / sliceCount;
      const x = bounds.x + nx * w;
      const sliceW = w / sliceCount + 1;

      for (let row = 0; row < rowCount; row++) {
        const rowT = row / rowCount;
        const y = waterTop + rowT * waterH;
        const rowH = waterH / rowCount + 1;

        // Noise-based ripple distortion
        const rippleN = noise(
          nx * (4 + p.reflectionDistortion * 8),
          rowT * (3 + p.reflectionDistortion * 6),
        );
        const rippleOffset = (rippleN - 0.5) * p.reflectionDistortion * 30;

        // Fresnel effect: stronger reflections near waterline (small angles)
        const fresnelT = smoothstep(rowT);
        const fresnelStrength = p.reflectionStrength * (1 - fresnelT * 0.4);

        // Blend terrain (top) → sky (bottom)
        const terrainAmount = Math.max(0, 1 - rowT * 2.5);

        // Blur: bands get more transparent near bottom
        const blurAlpha = fresnelStrength * (1 - p.reflectionBlur * rowT * 0.5);

        const r = Math.round(terR * terrainAmount + skyR * (1 - terrainAmount));
        const g = Math.round(terG * terrainAmount + skyG * (1 - terrainAmount));
        const b = Math.round(terB * terrainAmount + skyB * (1 - terrainAmount));

        ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.1, blurAlpha)})`;
        ctx.fillRect(x, y + rippleOffset, sliceW, rowH);
      }
    }

    // Subtle ripple lines
    if (p.reflectionDistortion > 0) {
      const lineCount = Math.round(p.reflectionDistortion * 15);
      for (let i = 0; i < lineCount; i++) {
        const ly = waterTop + rng() * waterH;
        const n = noise(i * 0.5, p.seed * 0.01);
        const alpha = 0.05 + n * 0.1;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(bounds.x, ly);
        const waveSegments = 10;
        for (let j = 1; j <= waveSegments; j++) {
          const wt = j / waveSegments;
          const wx = bounds.x + wt * w;
          const wy = ly + Math.sin(wt * Math.PI * 4 + i) * p.reflectionDistortion * 3;
          ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
    }
  },

  validate(properties): ValidationError[] | null {
    const errors: ValidationError[] = [];
    const presetId = properties.preset as string;
    if (presetId && !getPreset(presetId)) {
      errors.push({ property: "preset", message: `Unknown reflection preset "${presetId}"` });
    }
    return errors.length > 0 ? errors : null;
  },
};
