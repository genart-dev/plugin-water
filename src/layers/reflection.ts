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

    // Per-pixel reflection with noise distortion (ref: lake-reflection-mountains-mirror)
    // 1px-wide columns eliminate visible banding entirely
    const cellH = 2;
    const colStep = 2;
    const rowCount = Math.ceil(waterH / cellH);

    for (let col = 0; col < w; col += colStep) {
      const nx = col / w;
      const x = bounds.x + col;

      for (let row = 0; row < rowCount; row++) {
        const rowT = row / rowCount;
        const y = waterTop + rowT * waterH;

        // Noise-based ripple distortion — stronger with depth
        const rippleN = noise(
          nx * (3 + p.reflectionDistortion * 6),
          rowT * (2 + p.reflectionDistortion * 4),
        );
        const rippleOffset = (rippleN - 0.5) * p.reflectionDistortion * 20 * (1 + rowT);

        // Fresnel effect: strong near waterline, weaker at distance
        const fresnelT = smoothstep(rowT);
        const fresnelStrength = p.reflectionStrength * (1 - fresnelT * 0.5);

        // Reflected content: terrain near waterline → sky at depth
        const terrainAmount = Math.max(0, 1 - rowT * 2.2);

        // Progressive blur: alpha decreases with depth
        const blurAlpha = fresnelStrength * (1 - p.reflectionBlur * rowT * 0.6);

        // Color temperature shift — reflections are slightly cooler/darker
        const coolShift = rowT * 0.08;
        const r = Math.round((terR * terrainAmount + skyR * (1 - terrainAmount)) * (1 - coolShift));
        const g = Math.round((terG * terrainAmount + skyG * (1 - terrainAmount)) * (1 - coolShift * 0.5));
        const b = Math.round(terB * terrainAmount + skyB * (1 - terrainAmount));

        ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.05, blurAlpha)})`;
        ctx.fillRect(x, y + rippleOffset, colStep + 1, cellH + 1);
      }
    }

    // Subtle horizontal ripple highlights — paired dark/bright
    if (p.reflectionDistortion > 0) {
      const lineCount = Math.round(p.reflectionDistortion * 20 + 5);
      for (let i = 0; i < lineCount; i++) {
        const ly = waterTop + rng() * waterH;
        const depthT = (ly - waterTop) / waterH;
        const n = noise(i * 0.5, p.seed * 0.01);

        // Dark line
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + n * 0.05})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(bounds.x, ly + 1);
        const waveSegments = 12;
        for (let j = 1; j <= waveSegments; j++) {
          const wt = j / waveSegments;
          const wx = bounds.x + wt * w;
          const wy = ly + 1 + Math.sin(wt * Math.PI * 3 + i) * p.reflectionDistortion * 4;
          ctx.lineTo(wx, wy);
        }
        ctx.stroke();

        // Bright line
        const brightAlpha = (0.04 + n * 0.08) * (1 - depthT * 0.5);
        ctx.strokeStyle = `rgba(255,255,255,${brightAlpha})`;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(bounds.x, ly);
        for (let j = 1; j <= waveSegments; j++) {
          const wt = j / waveSegments;
          const wx = bounds.x + wt * w;
          const wy = ly + Math.sin(wt * Math.PI * 3 + i) * p.reflectionDistortion * 4;
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
