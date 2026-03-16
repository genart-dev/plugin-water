import { describe, it, expect, vi } from "vitest";
import { foamLayerType } from "../src/layers/foam.js";

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
    ellipse: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

const BOUNDS = { x: 0, y: 0, width: 800, height: 600, rotation: 0, scaleX: 1, scaleY: 1 };

describe("water:foam", () => {
  it("has correct typeId", () => {
    expect(foamLayerType.typeId).toBe("water:foam");
  });

  it("createDefault returns valid properties", () => {
    const defaults = foamLayerType.createDefault();
    expect(defaults.preset).toBe("ocean-whitecaps");
    expect(defaults.foamAmount).toBe(0.5);
  });

  it("render executes for all presets", () => {
    const ctx = createMockCtx();
    for (const preset of ["ocean-whitecaps", "surf-foam", "gentle-foam", "storm-foam"]) {
      expect(() => foamLayerType.render({ preset }, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("render with zero foam amount", () => {
    const ctx = createMockCtx();
    const props = { ...foamLayerType.createDefault(), foamAmount: 0 };
    expect(() => foamLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render with max langmuir strength", () => {
    const ctx = createMockCtx();
    const props = { ...foamLayerType.createDefault(), langmuirStrength: 1 };
    expect(() => foamLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render with zero bubble intensity", () => {
    const ctx = createMockCtx();
    const props = { ...foamLayerType.createDefault(), bubbleIntensity: 0 };
    expect(() => foamLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("validate returns null for valid preset", () => {
    expect(foamLayerType.validate!({ preset: "ocean-whitecaps" })).toBeNull();
  });
});
