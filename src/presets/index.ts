import type { WaterPreset, PresetCategory } from "./types.js";
import { SURFACE_PRESETS } from "./surface.js";
import { REFLECTION_PRESETS } from "./reflection.js";
import { FOAM_PRESETS } from "./foam.js";
import { SHORELINE_PRESETS } from "./shoreline.js";
import { CAUSTICS_PRESETS } from "./caustics.js";
import { ICE_PRESETS } from "./ice.js";

export const ALL_PRESETS: WaterPreset[] = [
  ...SURFACE_PRESETS,
  ...REFLECTION_PRESETS,
  ...FOAM_PRESETS,
  ...SHORELINE_PRESETS,
  ...CAUSTICS_PRESETS,
  ...ICE_PRESETS,
];

export function getPreset(id: string): WaterPreset | undefined {
  return ALL_PRESETS.find((p) => p.id === id);
}

export function filterPresets(category: PresetCategory): WaterPreset[] {
  return ALL_PRESETS.filter((p) => p.category === category);
}

export function searchPresets(query: string): WaterPreset[] {
  const q = query.toLowerCase();
  return ALL_PRESETS.filter(
    (p) =>
      p.id.includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q)),
  );
}

const CATEGORY_TO_LAYER: Record<PresetCategory, string> = {
  surface: "water:surface",
  reflection: "water:reflection",
  foam: "water:foam",
  shoreline: "water:shoreline",
  caustics: "water:caustics",
  ice: "water:ice",
};

export function categoryToLayerType(category: PresetCategory): string {
  return CATEGORY_TO_LAYER[category];
}

// Re-export preset arrays for direct access
export { SURFACE_PRESETS } from "./surface.js";
export { REFLECTION_PRESETS } from "./reflection.js";
export { FOAM_PRESETS } from "./foam.js";
export { SHORELINE_PRESETS } from "./shoreline.js";
export { CAUSTICS_PRESETS } from "./caustics.js";
export { ICE_PRESETS } from "./ice.js";
