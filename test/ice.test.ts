import { describe, it, expect, vi } from "vitest";
import { iceLayerType } from "../src/layers/ice.js";

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
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

const BOUNDS = { x: 0, y: 0, width: 800, height: 600, rotation: 0, scaleX: 1, scaleY: 1 };

describe("water:ice", () => {
  it("has correct typeId", () => {
    expect(iceLayerType.typeId).toBe("water:ice");
  });

  it("createDefault returns valid properties", () => {
    const defaults = iceLayerType.createDefault();
    expect(defaults.preset).toBe("frozen-lake");
    expect(defaults.iceThickness).toBe(0.6);
  });

  it("render executes for all presets", () => {
    const ctx = createMockCtx();
    for (const preset of ["frozen-lake", "thin-ice", "pack-ice", "frost-glass"]) {
      expect(() => iceLayerType.render({ preset }, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("render with zero crack density", () => {
    const ctx = createMockCtx();
    const props = { ...iceLayerType.createDefault(), crackDensity: 0 };
    expect(() => iceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render with full snow cover", () => {
    const ctx = createMockCtx();
    const props = { ...iceLayerType.createDefault(), snowCover: 1 };
    expect(() => iceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("render with zero frost intensity", () => {
    const ctx = createMockCtx();
    const props = { ...iceLayerType.createDefault(), frostIntensity: 0 };
    expect(() => iceLayerType.render(props, ctx, BOUNDS, {} as any)).not.toThrow();
  });

  it("validate returns null for valid preset", () => {
    expect(iceLayerType.validate!({ preset: "frozen-lake" })).toBeNull();
  });

  it("validate returns error for invalid preset", () => {
    const errors = iceLayerType.validate!({ preset: "nonexistent" });
    expect(errors).not.toBeNull();
  });
});
