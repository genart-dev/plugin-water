import { describe, it, expect, vi } from "vitest";
import { reflectionLayerType } from "../src/layers/reflection.js";

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
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

const BOUNDS = { x: 0, y: 0, width: 800, height: 600, rotation: 0, scaleX: 1, scaleY: 1 };

describe("water:reflection", () => {
  it("has correct typeId", () => {
    expect(reflectionLayerType.typeId).toBe("water:reflection");
  });

  it("createDefault returns valid properties", () => {
    const defaults = reflectionLayerType.createDefault();
    expect(defaults.preset).toBe("calm-lake-reflection");
    expect(defaults.reflectionStrength).toBe(0.8);
  });

  it("render executes without error for all presets", () => {
    const ctx = createMockCtx();
    const presets = ["calm-lake-reflection", "rippled-reflection", "dark-water-reflection", "golden-reflection"];
    for (const preset of presets) {
      expect(() => reflectionLayerType.render({ preset }, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("validate returns null for valid preset", () => {
    expect(reflectionLayerType.validate!({ preset: "calm-lake-reflection" })).toBeNull();
  });

  it("validate returns error for invalid preset", () => {
    const errors = reflectionLayerType.validate!({ preset: "nonexistent" });
    expect(errors).not.toBeNull();
  });

  it("render with zero distortion", () => {
    const ctx = createMockCtx();
    const props = { ...reflectionLayerType.createDefault(), reflectionDistortion: 0 };
    expect(() => reflectionLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render with atmospheric mode", () => {
    const ctx = createMockCtx();
    const props = { ...reflectionLayerType.createDefault(), atmosphericMode: "western" };
    expect(() => reflectionLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });
});
