import { describe, it, expect, vi } from "vitest";
import { surfaceLayerType } from "../src/layers/surface.js";

function createMockCtx() {
  return {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
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
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const BOUNDS = { x: 0, y: 0, width: 800, height: 600, rotation: 0, scaleX: 1, scaleY: 1 };

describe("water:surface", () => {
  it("has correct typeId", () => {
    expect(surfaceLayerType.typeId).toBe("water:surface");
  });

  it("has correct displayName", () => {
    expect(surfaceLayerType.displayName).toBe("Water Surface");
  });

  it("createDefault returns valid properties", () => {
    const defaults = surfaceLayerType.createDefault();
    expect(defaults.preset).toBe("still-lake");
    expect(defaults.algorithm).toBe("calm");
    expect(defaults.waterlinePosition).toBe(0.6);
    expect(defaults.surfaceColor).toBe("#2A4A6B");
  });

  it("render (calm) executes without error", () => {
    const ctx = createMockCtx();
    const props = surfaceLayerType.createDefault();
    expect(() => surfaceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render (ocean) executes without error", () => {
    const ctx = createMockCtx();
    const props = { ...surfaceLayerType.createDefault(), preset: "choppy-sea", algorithm: "ocean" };
    expect(() => surfaceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render (flow) executes without error", () => {
    const ctx = createMockCtx();
    const props = { ...surfaceLayerType.createDefault(), preset: "mountain-stream", algorithm: "flow" };
    expect(() => surfaceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render with all presets without error", () => {
    const ctx = createMockCtx();
    const presets = ["still-lake", "pond", "misty-lake", "moonlit-water", "choppy-sea", "ocean-swell", "stormy-ocean", "tropical-shallows", "coastal-surf", "mountain-stream", "river"];
    for (const preset of presets) {
      expect(() => surfaceLayerType.render({ preset }, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("validate returns null for valid preset", () => {
    expect(surfaceLayerType.validate!({ preset: "still-lake" })).toBeNull();
  });

  it("validate returns error for invalid preset", () => {
    const errors = surfaceLayerType.validate!({ preset: "nonexistent" });
    expect(errors).not.toBeNull();
    expect(errors![0]!.property).toBe("preset");
  });

  it("render handles waterline at edge", () => {
    const ctx = createMockCtx();
    const props = { ...surfaceLayerType.createDefault(), waterlinePosition: 0.95 };
    expect(() => surfaceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render handles zero shimmer", () => {
    const ctx = createMockCtx();
    const props = { ...surfaceLayerType.createDefault(), shimmerIntensity: 0 };
    expect(() => surfaceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });
});
