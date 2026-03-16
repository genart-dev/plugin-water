import { describe, it, expect, vi } from "vitest";
import { causticsLayerType } from "../src/layers/caustics.js";

function createMockCtx() {
  return {
    fillRect: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
    beginPath: vi.fn(),
    fill: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

const BOUNDS = { x: 0, y: 0, width: 800, height: 600, rotation: 0, scaleX: 1, scaleY: 1 };

describe("water:caustics", () => {
  it("has correct typeId", () => {
    expect(causticsLayerType.typeId).toBe("water:caustics");
  });

  it("createDefault returns valid properties", () => {
    const defaults = causticsLayerType.createDefault();
    expect(defaults.preset).toBe("shallow-caustics");
    expect(defaults.clarity).toBe(0.7);
  });

  it("render executes for all presets", () => {
    const ctx = createMockCtx();
    for (const preset of ["shallow-caustics", "deep-pool-caustics", "tropical-caustics"]) {
      expect(() => causticsLayerType.render({ preset }, ctx, BOUNDS, {} as any)).not.toThrow();
    }
  });

  it("render skips when clarity too low", () => {
    const ctx = createMockCtx();
    const props = { ...causticsLayerType.createDefault(), clarity: 0.1 };
    causticsLayerType.render(props, ctx, BOUNDS, {} as any);
    // Should not render — clarity < 0.3
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("validate returns null for valid preset", () => {
    expect(causticsLayerType.validate!({ preset: "shallow-caustics" })).toBeNull();
  });

  it("validate returns error for invalid preset", () => {
    const errors = causticsLayerType.validate!({ preset: "nonexistent" });
    expect(errors).not.toBeNull();
  });
});
