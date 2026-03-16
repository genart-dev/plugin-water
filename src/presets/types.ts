/** Base preset fields shared by all water presets. */
interface BasePreset {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

/** Water surface preset — calm lakes, choppy seas, flowing rivers. */
export interface SurfacePreset extends BasePreset {
  category: "surface";
  /** Algorithm mode: "calm" (stripe compositing), "ocean" (Gerstner waves), "flow" (flow-field ripples). */
  algorithm: "calm" | "ocean" | "flow";
  waterlinePosition: number;
  waveHeight: number;
  wavePeriod: number;
  waveComplexity: number;
  chop: number;
  surfaceColor: string;
  depthColor: string;
  shimmerIntensity: number;
  /** Flow direction in radians (for flow algorithm). 0 = right, PI/2 = down. */
  flowDirection: number;
  flowStrength: number;
}

/** Reflection preset — mirrored terrain/sky below waterline. */
export interface ReflectionPreset extends BasePreset {
  category: "reflection";
  skyColor: string;
  terrainColor: string;
  reflectionStrength: number;
  reflectionBlur: number;
  reflectionDistortion: number;
  waterlinePosition: number;
}

/** Foam preset — whitecaps, foam trails, beach foam. */
export interface FoamPreset extends BasePreset {
  category: "foam";
  foamColor: string;
  foamAmount: number;
  whitecapThreshold: number;
  foamTrailLength: number;
  langmuirStrength: number;
  bubbleIntensity: number;
}

/** Shoreline preset — water-land edge interactions. */
export interface ShorelinePreset extends BasePreset {
  category: "shoreline";
  shoreType: "beach" | "rocky" | "marsh" | "riverbank" | "tidal-flat" | "cliff-base";
  width: number;
  color: string;
  wetColor: string;
  foamLine: boolean;
  foamIntensity: number;
  debrisType: "none" | "seaweed" | "driftwood" | "shells" | "pebbles";
  waveBreakStyle: "spilling" | "plunging" | "surging";
}

/** Caustics preset — underwater light patterns. */
export interface CausticsPreset extends BasePreset {
  category: "caustics";
  clarity: number;
  causticScale: number;
  causticIntensity: number;
  bottomColor: string;
  lightAngle: number;
}

/** Ice preset — frozen water surface. */
export interface IcePreset extends BasePreset {
  category: "ice";
  iceThickness: number;
  crackDensity: number;
  frostIntensity: number;
  snowCover: number;
  iceColor: string;
  crackColor: string;
}

/** Union of all water preset types. */
export type WaterPreset =
  | SurfacePreset
  | ReflectionPreset
  | FoamPreset
  | ShorelinePreset
  | CausticsPreset
  | IcePreset;

/** All preset categories. */
export type PresetCategory = "surface" | "reflection" | "foam" | "shoreline" | "caustics" | "ice";
