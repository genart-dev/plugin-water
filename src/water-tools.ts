/**
 * MCP tool definitions for plugin-water.
 *
 * 8 tools: add_water_surface, add_water_reflection, add_water_foam,
 * add_water_shoreline, add_water_caustics, add_water_ice,
 * list_water_presets, set_water_conditions.
 */

import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
  DesignLayer,
  LayerTransform,
} from "@genart-dev/core";
import { ALL_PRESETS, getPreset, filterPresets, categoryToLayerType } from "./presets/index.js";
import type { PresetCategory, SurfacePreset, ReflectionPreset, FoamPreset, ShorelinePreset, CausticsPreset, IcePreset } from "./presets/types.js";

function textResult(text: string): McpToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function generateLayerId(): string {
  return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fullCanvasTransform(ctx: McpToolContext): LayerTransform {
  return {
    x: 0,
    y: 0,
    width: ctx.canvasWidth,
    height: ctx.canvasHeight,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    anchorX: 0,
    anchorY: 0,
  };
}

function createLayer(
  typeId: string,
  name: string,
  ctx: McpToolContext,
  properties: Record<string, unknown>,
): DesignLayer {
  return {
    id: generateLayerId(),
    type: typeId,
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: fullCanvasTransform(ctx),
    properties: properties as Record<string, string | number | boolean | null>,
  };
}

function surfacePropsFromPreset(preset: SurfacePreset, seed: number, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    preset: preset.id,
    seed,
    algorithm: preset.algorithm,
    waterlinePosition: preset.waterlinePosition,
    waveHeight: preset.waveHeight,
    wavePeriod: preset.wavePeriod,
    waveComplexity: preset.waveComplexity,
    chop: preset.chop,
    surfaceColor: preset.surfaceColor,
    depthColor: preset.depthColor,
    shimmerIntensity: preset.shimmerIntensity,
    flowDirection: preset.flowDirection,
    flowStrength: preset.flowStrength,
    ...overrides,
  };
}

function reflectionPropsFromPreset(preset: ReflectionPreset, seed: number, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    preset: preset.id,
    seed,
    skyColor: preset.skyColor,
    terrainColor: preset.terrainColor,
    reflectionStrength: preset.reflectionStrength,
    reflectionBlur: preset.reflectionBlur,
    reflectionDistortion: preset.reflectionDistortion,
    waterlinePosition: preset.waterlinePosition,
    ...overrides,
  };
}

function foamPropsFromPreset(preset: FoamPreset, seed: number, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    preset: preset.id,
    seed,
    foamColor: preset.foamColor,
    foamAmount: preset.foamAmount,
    whitecapThreshold: preset.whitecapThreshold,
    foamTrailLength: preset.foamTrailLength,
    langmuirStrength: preset.langmuirStrength,
    bubbleIntensity: preset.bubbleIntensity,
    ...overrides,
  };
}

function shorelinePropsFromPreset(preset: ShorelinePreset, seed: number, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    preset: preset.id,
    seed,
    width: preset.width,
    color: preset.color,
    wetColor: preset.wetColor,
    foamLine: preset.foamLine ? "true" : "false",
    foamIntensity: preset.foamIntensity,
    debrisType: preset.debrisType,
    waveBreakStyle: preset.waveBreakStyle,
    ...overrides,
  };
}

function causticsPropsFromPreset(preset: CausticsPreset, seed: number, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    preset: preset.id,
    seed,
    clarity: preset.clarity,
    causticScale: preset.causticScale,
    causticIntensity: preset.causticIntensity,
    bottomColor: preset.bottomColor,
    lightAngle: preset.lightAngle,
    ...overrides,
  };
}

function icePropsFromPreset(preset: IcePreset, seed: number, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    preset: preset.id,
    seed,
    iceThickness: preset.iceThickness,
    crackDensity: preset.crackDensity,
    frostIntensity: preset.frostIntensity,
    snowCover: preset.snowCover,
    iceColor: preset.iceColor,
    crackColor: preset.crackColor,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const waterMcpTools: McpToolDefinition[] = [
  // ── design_add_water_surface ──────────────────────────────────────────
  {
    name: "design_add_water_surface",
    description:
      "Add a water surface layer. Supports 3 algorithms: calm (stripe compositing for lakes/ponds), " +
      "ocean (Gerstner waves for seas), flow (flow-field ripples for rivers/streams). " +
      "11 presets: still-lake, pond, misty-lake, moonlit-water, choppy-sea, ocean-swell, " +
      "stormy-ocean, tropical-shallows, coastal-surf, mountain-stream, river.",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          description: "Surface preset ID",
          enum: ["still-lake", "pond", "misty-lake", "moonlit-water", "choppy-sea", "ocean-swell", "stormy-ocean", "tropical-shallows", "coastal-surf", "mountain-stream", "river"],
        },
        seed: { type: "number", description: "Random seed (default: random)" },
        surfaceColor: { type: "string", description: "Hex color for surface" },
        depthColor: { type: "string", description: "Hex color for depth" },
        waterlinePosition: { type: "number", description: "Waterline position (0.1-0.95)" },
        waveHeight: { type: "number", description: "Wave height (0-1)" },
        shimmerIntensity: { type: "number", description: "Shimmer intensity (0-1)" },
      },
      required: ["preset"],
    },
    handler: async (input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> => {
      const presetId = input.preset as string;
      const preset = getPreset(presetId);
      if (!preset || preset.category !== "surface") {
        return errorResult(`Unknown surface preset "${presetId}". Use list_water_presets to see options.`);
      }
      const seed = (input.seed as number) ?? Math.floor(Math.random() * 99999);
      const overrides: Record<string, unknown> = {};
      if (input.surfaceColor) overrides.surfaceColor = input.surfaceColor;
      if (input.depthColor) overrides.depthColor = input.depthColor;
      if (input.waterlinePosition !== undefined) overrides.waterlinePosition = input.waterlinePosition;
      if (input.waveHeight !== undefined) overrides.waveHeight = input.waveHeight;
      if (input.shimmerIntensity !== undefined) overrides.shimmerIntensity = input.shimmerIntensity;

      const props = surfacePropsFromPreset(preset as SurfacePreset, seed, overrides);
      const layer = createLayer("water:surface", `Water - ${preset.name}`, context, props);
      context.layers.add(layer);
      return textResult(`Added water surface "${preset.name}" (seed: ${seed})`);
    },
  },

  // ── design_add_water_reflection ───────────────────────────────────────
  {
    name: "design_add_water_reflection",
    description:
      "Add a water reflection layer that mirrors terrain and sky below the waterline. " +
      "Features Fresnel-based strength (stronger at glancing angles). " +
      "4 presets: calm-lake-reflection, rippled-reflection, dark-water-reflection, golden-reflection.",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          description: "Reflection preset ID",
          enum: ["calm-lake-reflection", "rippled-reflection", "dark-water-reflection", "golden-reflection"],
        },
        seed: { type: "number", description: "Random seed" },
        skyColor: { type: "string", description: "Sky hex color to reflect" },
        terrainColor: { type: "string", description: "Terrain hex color to reflect" },
        reflectionStrength: { type: "number", description: "Reflection strength (0-1)" },
        waterlinePosition: { type: "number", description: "Waterline position (0.2-0.9)" },
      },
      required: ["preset"],
    },
    handler: async (input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> => {
      const presetId = input.preset as string;
      const preset = getPreset(presetId);
      if (!preset || preset.category !== "reflection") {
        return errorResult(`Unknown reflection preset "${presetId}".`);
      }
      const seed = (input.seed as number) ?? Math.floor(Math.random() * 99999);
      const overrides: Record<string, unknown> = {};
      if (input.skyColor) overrides.skyColor = input.skyColor;
      if (input.terrainColor) overrides.terrainColor = input.terrainColor;
      if (input.reflectionStrength !== undefined) overrides.reflectionStrength = input.reflectionStrength;
      if (input.waterlinePosition !== undefined) overrides.waterlinePosition = input.waterlinePosition;

      const props = reflectionPropsFromPreset(preset as ReflectionPreset, seed, overrides);
      const layer = createLayer("water:reflection", `Reflection - ${preset.name}`, context, props);
      context.layers.add(layer);
      return textResult(`Added water reflection "${preset.name}" (seed: ${seed})`);
    },
  },

  // ── design_add_water_foam ─────────────────────────────────────────────
  {
    name: "design_add_water_foam",
    description:
      "Add a foam and whitecaps layer. Renders whitecap patches on wave crests, foam trails, " +
      "Langmuir circulation streaks, and bubble rafts. " +
      "4 presets: ocean-whitecaps, surf-foam, gentle-foam, storm-foam.",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: ["ocean-whitecaps", "surf-foam", "gentle-foam", "storm-foam"],
        },
        seed: { type: "number" },
        foamAmount: { type: "number", description: "Foam amount (0-1)" },
        waterlinePosition: { type: "number" },
      },
      required: ["preset"],
    },
    handler: async (input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> => {
      const presetId = input.preset as string;
      const preset = getPreset(presetId);
      if (!preset || preset.category !== "foam") {
        return errorResult(`Unknown foam preset "${presetId}".`);
      }
      const seed = (input.seed as number) ?? Math.floor(Math.random() * 99999);
      const overrides: Record<string, unknown> = {};
      if (input.foamAmount !== undefined) overrides.foamAmount = input.foamAmount;
      if (input.waterlinePosition !== undefined) overrides.waterlinePosition = input.waterlinePosition;

      const props = foamPropsFromPreset(preset as FoamPreset, seed, overrides);
      const layer = createLayer("water:foam", `Foam - ${preset.name}`, context, props);
      context.layers.add(layer);
      return textResult(`Added foam "${preset.name}" (seed: ${seed})`);
    },
  },

  // ── design_add_water_shoreline ────────────────────────────────────────
  {
    name: "design_add_water_shoreline",
    description:
      "Add a shoreline interaction layer. Renders the water-land transition with foam lines, " +
      "wave break styles (spilling/plunging/surging), and debris. " +
      "7 presets: sandy-beach, rocky-shore, muddy-riverbank, grassy-bank, tidal-flat, cliff-base, marsh-edge.",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: ["sandy-beach", "rocky-shore", "muddy-riverbank", "grassy-bank", "tidal-flat", "cliff-base", "marsh-edge"],
        },
        seed: { type: "number" },
        waterlinePosition: { type: "number" },
        foamIntensity: { type: "number", description: "Foam intensity (0-1)" },
      },
      required: ["preset"],
    },
    handler: async (input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> => {
      const presetId = input.preset as string;
      const preset = getPreset(presetId);
      if (!preset || preset.category !== "shoreline") {
        return errorResult(`Unknown shoreline preset "${presetId}".`);
      }
      const seed = (input.seed as number) ?? Math.floor(Math.random() * 99999);
      const overrides: Record<string, unknown> = {};
      if (input.waterlinePosition !== undefined) overrides.waterlinePosition = input.waterlinePosition;
      if (input.foamIntensity !== undefined) overrides.foamIntensity = input.foamIntensity;

      const props = shorelinePropsFromPreset(preset as ShorelinePreset, seed, overrides);
      const layer = createLayer("water:shoreline", `Shoreline - ${preset.name}`, context, props);
      context.layers.add(layer);
      return textResult(`Added shoreline "${preset.name}" (seed: ${seed})`);
    },
  },

  // ── design_add_water_caustics ─────────────────────────────────────────
  {
    name: "design_add_water_caustics",
    description:
      "Add underwater caustic light patterns. Visible only in clear water (clarity > 0.3). " +
      "3 presets: shallow-caustics, deep-pool-caustics, tropical-caustics.",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: ["shallow-caustics", "deep-pool-caustics", "tropical-caustics"],
        },
        seed: { type: "number" },
        clarity: { type: "number", description: "Water clarity (0-1)" },
        waterlinePosition: { type: "number" },
      },
      required: ["preset"],
    },
    handler: async (input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> => {
      const presetId = input.preset as string;
      const preset = getPreset(presetId);
      if (!preset || preset.category !== "caustics") {
        return errorResult(`Unknown caustics preset "${presetId}".`);
      }
      const seed = (input.seed as number) ?? Math.floor(Math.random() * 99999);
      const overrides: Record<string, unknown> = {};
      if (input.clarity !== undefined) overrides.clarity = input.clarity;
      if (input.waterlinePosition !== undefined) overrides.waterlinePosition = input.waterlinePosition;

      const props = causticsPropsFromPreset(preset as CausticsPreset, seed, overrides);
      const layer = createLayer("water:caustics", `Caustics - ${preset.name}`, context, props);
      context.layers.add(layer);
      return textResult(`Added caustics "${preset.name}" (seed: ${seed})`);
    },
  },

  // ── design_add_water_ice ──────────────────────────────────────────────
  {
    name: "design_add_water_ice",
    description:
      "Add a frozen water surface layer with ice texture, cracks, frost patterns, and optional snow cover. " +
      "4 presets: frozen-lake, thin-ice, pack-ice, frost-glass.",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: ["frozen-lake", "thin-ice", "pack-ice", "frost-glass"],
        },
        seed: { type: "number" },
        iceThickness: { type: "number", description: "Ice thickness (0-1)" },
        snowCover: { type: "number", description: "Snow cover (0-1)" },
        waterlinePosition: { type: "number" },
      },
      required: ["preset"],
    },
    handler: async (input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> => {
      const presetId = input.preset as string;
      const preset = getPreset(presetId);
      if (!preset || preset.category !== "ice") {
        return errorResult(`Unknown ice preset "${presetId}".`);
      }
      const seed = (input.seed as number) ?? Math.floor(Math.random() * 99999);
      const overrides: Record<string, unknown> = {};
      if (input.iceThickness !== undefined) overrides.iceThickness = input.iceThickness;
      if (input.snowCover !== undefined) overrides.snowCover = input.snowCover;
      if (input.waterlinePosition !== undefined) overrides.waterlinePosition = input.waterlinePosition;

      const props = icePropsFromPreset(preset as IcePreset, seed, overrides);
      const layer = createLayer("water:ice", `Ice - ${preset.name}`, context, props);
      context.layers.add(layer);
      return textResult(`Added ice "${preset.name}" (seed: ${seed})`);
    },
  },

  // ── list_water_presets ────────────────────────────────────────────────
  {
    name: "list_water_presets",
    description: "List available water presets, optionally filtered by category (surface, reflection, foam, shoreline, caustics, ice).",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by category",
          enum: ["surface", "reflection", "foam", "shoreline", "caustics", "ice"],
        },
      },
    },
    handler: async (input: Record<string, unknown>): Promise<McpToolResult> => {
      const category = input.category as PresetCategory | undefined;
      const presets = category ? filterPresets(category) : ALL_PRESETS;
      const lines = presets.map(
        (p) => `- **${p.id}** (${p.category}): ${p.description} [${p.tags.join(", ")}]`,
      );
      return textResult(
        `${presets.length} water presets${category ? ` (${category})` : ""}:\n\n${lines.join("\n")}`,
      );
    },
  },

  // ── design_set_water_conditions ───────────────────────────────────────
  {
    name: "design_set_water_conditions",
    description:
      "Set coordinated water conditions across multiple water layers. " +
      "Creates a complete water scene with surface + reflection + optional foam/shoreline. " +
      "Conditions: calm (still-lake + calm-lake-reflection), choppy (choppy-sea + rippled-reflection + ocean-whitecaps), " +
      "stormy (stormy-ocean + dark-water-reflection + storm-foam), frozen (frozen-lake ice).",
    inputSchema: {
      type: "object",
      properties: {
        conditions: {
          type: "string",
          description: "Water conditions",
          enum: ["calm", "choppy", "stormy", "frozen"],
        },
        seed: { type: "number", description: "Random seed" },
        waterlinePosition: { type: "number", description: "Waterline position (0.1-0.95)" },
        withShoreline: { type: "string", description: "Shoreline preset to add (optional)" },
      },
      required: ["conditions"],
    },
    handler: async (input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> => {
      const conditions = input.conditions as string;
      const seed = (input.seed as number) ?? Math.floor(Math.random() * 99999);
      const waterlinePos = input.waterlinePosition as number | undefined;
      const layers: string[] = [];

      const posOverride: Record<string, unknown> = {};
      if (waterlinePos !== undefined) posOverride.waterlinePosition = waterlinePos;

      switch (conditions) {
        case "calm": {
          const surfPreset = getPreset("still-lake") as SurfacePreset;
          const reflPreset = getPreset("calm-lake-reflection") as ReflectionPreset;
          context.layers.add(createLayer("water:surface", "Water - Still Lake", context, surfacePropsFromPreset(surfPreset, seed, posOverride)));
          context.layers.add(createLayer("water:reflection", "Reflection - Calm Lake", context, reflectionPropsFromPreset(reflPreset, seed + 1, posOverride)));
          layers.push("still-lake surface", "calm-lake reflection");
          break;
        }
        case "choppy": {
          const surfPreset = getPreset("choppy-sea") as SurfacePreset;
          const reflPreset = getPreset("rippled-reflection") as ReflectionPreset;
          const foamPreset = getPreset("ocean-whitecaps") as FoamPreset;
          context.layers.add(createLayer("water:surface", "Water - Choppy Sea", context, surfacePropsFromPreset(surfPreset, seed, posOverride)));
          context.layers.add(createLayer("water:reflection", "Reflection - Rippled", context, reflectionPropsFromPreset(reflPreset, seed + 1, posOverride)));
          context.layers.add(createLayer("water:foam", "Foam - Whitecaps", context, foamPropsFromPreset(foamPreset, seed + 2, posOverride)));
          layers.push("choppy-sea surface", "rippled reflection", "ocean whitecaps");
          break;
        }
        case "stormy": {
          const surfPreset = getPreset("stormy-ocean") as SurfacePreset;
          const reflPreset = getPreset("dark-water-reflection") as ReflectionPreset;
          const foamPreset = getPreset("storm-foam") as FoamPreset;
          context.layers.add(createLayer("water:surface", "Water - Stormy Ocean", context, surfacePropsFromPreset(surfPreset, seed, posOverride)));
          context.layers.add(createLayer("water:reflection", "Reflection - Dark Water", context, reflectionPropsFromPreset(reflPreset, seed + 1, posOverride)));
          context.layers.add(createLayer("water:foam", "Foam - Storm", context, foamPropsFromPreset(foamPreset, seed + 2, posOverride)));
          layers.push("stormy-ocean surface", "dark-water reflection", "storm foam");
          break;
        }
        case "frozen": {
          const icePreset = getPreset("frozen-lake") as IcePreset;
          context.layers.add(createLayer("water:ice", "Ice - Frozen Lake", context, icePropsFromPreset(icePreset, seed, posOverride)));
          layers.push("frozen-lake ice");
          break;
        }
        default:
          return errorResult(`Unknown conditions "${conditions}". Use: calm, choppy, stormy, frozen.`);
      }

      // Optional shoreline
      if (input.withShoreline) {
        const shorePreset = getPreset(input.withShoreline as string);
        if (shorePreset && shorePreset.category === "shoreline") {
          context.layers.add(createLayer("water:shoreline", `Shoreline - ${shorePreset.name}`, context, shorelinePropsFromPreset(shorePreset as ShorelinePreset, seed + 10, posOverride)));
          layers.push(`${shorePreset.id} shoreline`);
        }
      }

      return textResult(`Created ${conditions} water scene (seed: ${seed}): ${layers.join(", ")}`);
    },
  },
];
