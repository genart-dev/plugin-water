import { describe, it, expect, vi } from "vitest";
import { shorelineLayerType } from "../src/layers/shoreline.js";

function createMockCtx() {
  return {
    fillRect: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    quadraticCurveTo: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

const BOUNDS = { x: 0, y: 0, width: 800, height: 600, rotation: 0, scaleX: 1, scaleY: 1 };

describe("water:shoreline", () => {
  it("has correct typeId", () => {
    expect(shorelineLayerType.typeId).toBe("water:shoreline");
  });

  it("createDefault returns valid properties", () => {
    const defaults = shorelineLayerType.createDefault();
    expect(defaults.preset).toBe("sandy-beach");
    expect(defaults.foamLine).toBe("true");
  });

  it("render executes for all presets", () => {
    const ctx = createMockCtx();
    const presets = ["sandy-beach", "rocky-shore", "muddy-riverbank", "grassy-bank", "tidal-flat", "cliff-base", "marsh-edge"];
    for (const preset of presets) {
      expect(() => shorelineLayerType.render({ preset }, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("render with all debris types", () => {
    const ctx = createMockCtx();
    for (const debrisType of ["none", "seaweed", "driftwood", "shells", "pebbles"]) {
      const props = { ...shorelineLayerType.createDefault(), debrisType };
      expect(() => shorelineLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("render with all wave break styles", () => {
    const ctx = createMockCtx();
    for (const waveBreakStyle of ["spilling", "plunging", "surging"]) {
      const props = { ...shorelineLayerType.createDefault(), waveBreakStyle };
      expect(() => shorelineLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("render without foam line", () => {
    const ctx = createMockCtx();
    const props = { ...shorelineLayerType.createDefault(), foamLine: "false" };
    expect(() => shorelineLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("validate returns null for valid preset", () => {
    expect(shorelineLayerType.validate!({ preset: "sandy-beach" })).toBeNull();
  });
});
