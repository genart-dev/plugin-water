/**
 * @genart-dev/plugin-water — Water effects for generative landscapes
 *
 * 6 layer types (surface, reflection, foam, shoreline, caustics, ice),
 * 33 presets, 8 MCP tools.
 * v0.1.0: Gerstner waves, flow-field rivers, Fresnel reflections,
 * whitecaps, caustic patterns, ice cracks & frost.
 */

import type { DesignPlugin, PluginContext } from "@genart-dev/core";
import { waterMcpTools } from "./water-tools.js";
import {
  surfaceLayerType,
  reflectionLayerType,
  foamLayerType,
  shorelineLayerType,
  causticsLayerType,
  iceLayerType,
} from "./layers/index.js";

const waterPlugin: DesignPlugin = {
  id: "water",
  name: "Water",
  version: "0.1.0",
  description:
    "Water effects for generative landscapes: surface waves (calm stripe compositing, Gerstner ocean waves, flow-field rivers), " +
    "reflections (Fresnel-based terrain/sky mirroring), foam & whitecaps (Langmuir circulation, bubble rafts), " +
    "shoreline interactions (wave break styles, debris), underwater caustics (noise-based light patterns), " +
    "and ice (cracks, frost crystals, snow cover). " +
    "6 layer types, 33 presets, 8 MCP tools.",

  layerTypes: [
    surfaceLayerType,
    reflectionLayerType,
    foamLayerType,
    shorelineLayerType,
    causticsLayerType,
    iceLayerType,
  ],
  tools: [],
  exportHandlers: [],
  mcpTools: waterMcpTools,

  async initialize(_context: PluginContext): Promise<void> {},
  dispose(): void {},
};

export default waterPlugin;

// Re-export layer types
export {
  surfaceLayerType,
  reflectionLayerType,
  foamLayerType,
  shorelineLayerType,
  causticsLayerType,
  iceLayerType,
} from "./layers/index.js";

// Re-export presets
export { ALL_PRESETS, getPreset, filterPresets, searchPresets, categoryToLayerType } from "./presets/index.js";
export type {
  WaterPreset,
  SurfacePreset,
  ReflectionPreset,
  FoamPreset,
  ShorelinePreset,
  CausticsPreset,
  IcePreset,
  PresetCategory,
} from "./presets/types.js";

// Re-export tools
export { waterMcpTools } from "./water-tools.js";

// Re-export shared utilities
export { mulberry32 } from "./shared/prng.js";
export { createValueNoise, createFractalNoise, createWarpedNoise } from "./shared/noise.js";
export { parseHex, toHex, lerpColor, darken, lighten, varyColor } from "./shared/color-utils.js";
