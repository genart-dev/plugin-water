import { describe, it, expect } from "vitest";
import {
  ALL_PRESETS,
  getPreset,
  filterPresets,
  searchPresets,
  categoryToLayerType,
  SURFACE_PRESETS,
  REFLECTION_PRESETS,
  FOAM_PRESETS,
  SHORELINE_PRESETS,
  CAUSTICS_PRESETS,
  ICE_PRESETS,
} from "../src/presets/index.js";

describe("presets", () => {
  it("ALL_PRESETS has correct total", () => {
    const expected =
      SURFACE_PRESETS.length +
      REFLECTION_PRESETS.length +
      FOAM_PRESETS.length +
      SHORELINE_PRESETS.length +
      CAUSTICS_PRESETS.length +
      ICE_PRESETS.length;
    expect(ALL_PRESETS).toHaveLength(expected);
    expect(ALL_PRESETS.length).toBeGreaterThanOrEqual(30);
  });

  it("each preset has required fields", () => {
    for (const p of ALL_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.tags.length).toBeGreaterThan(0);
    }
  });

  it("preset ids are unique", () => {
    const ids = ALL_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getPreset returns correct preset", () => {
    const p = getPreset("still-lake");
    expect(p).toBeDefined();
    expect(p?.category).toBe("surface");
    expect(p?.name).toBe("Still Lake");
  });

  it("getPreset returns undefined for unknown", () => {
    expect(getPreset("nonexistent")).toBeUndefined();
  });

  it("filterPresets returns correct counts", () => {
    expect(filterPresets("surface")).toHaveLength(SURFACE_PRESETS.length);
    expect(filterPresets("reflection")).toHaveLength(REFLECTION_PRESETS.length);
    expect(filterPresets("foam")).toHaveLength(FOAM_PRESETS.length);
    expect(filterPresets("shoreline")).toHaveLength(SHORELINE_PRESETS.length);
    expect(filterPresets("caustics")).toHaveLength(CAUSTICS_PRESETS.length);
    expect(filterPresets("ice")).toHaveLength(ICE_PRESETS.length);
  });

  it("searchPresets works by tag", () => {
    const results = searchPresets("ocean");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.id.includes("ocean") || p.tags.includes("ocean"))).toBe(true);
  });

  it("searchPresets works by name", () => {
    const results = searchPresets("frozen");
    expect(results.length).toBeGreaterThan(0);
  });

  it("categoryToLayerType maps correctly", () => {
    expect(categoryToLayerType("surface")).toBe("water:surface");
    expect(categoryToLayerType("reflection")).toBe("water:reflection");
    expect(categoryToLayerType("foam")).toBe("water:foam");
    expect(categoryToLayerType("shoreline")).toBe("water:shoreline");
    expect(categoryToLayerType("caustics")).toBe("water:caustics");
    expect(categoryToLayerType("ice")).toBe("water:ice");
  });

  it("surface presets have valid algorithm", () => {
    for (const p of SURFACE_PRESETS) {
      expect(["calm", "ocean", "flow"]).toContain(p.algorithm);
    }
  });

  it("shoreline presets have valid shore type", () => {
    for (const p of SHORELINE_PRESETS) {
      expect(["beach", "rocky", "marsh", "riverbank", "tidal-flat", "cliff-base"]).toContain(p.shoreType);
    }
  });
});
