import { describe, it, expect } from "vitest";
import waterPlugin from "../src/index.js";

describe("waterPlugin", () => {
  it("has correct id and version", () => {
    expect(waterPlugin.id).toBe("water");
    expect(waterPlugin.version).toBe("0.1.0");
  });

  it("has 6 layer types", () => {
    expect(waterPlugin.layerTypes).toHaveLength(6);
  });

  it("layer type ids use water: prefix", () => {
    for (const lt of waterPlugin.layerTypes) {
      expect(lt.typeId).toMatch(/^water:/);
    }
  });

  it("has correct layer type ids", () => {
    const ids = waterPlugin.layerTypes.map((l) => l.typeId);
    expect(ids).toContain("water:surface");
    expect(ids).toContain("water:reflection");
    expect(ids).toContain("water:foam");
    expect(ids).toContain("water:shoreline");
    expect(ids).toContain("water:caustics");
    expect(ids).toContain("water:ice");
  });

  it("has 8 MCP tools", () => {
    expect(waterPlugin.mcpTools).toHaveLength(8);
  });

  it("MCP tools have required fields", () => {
    for (const tool of waterPlugin.mcpTools!) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeTypeOf("function");
    }
  });

  it("initialize and dispose do not throw", async () => {
    await expect(waterPlugin.initialize!({} as any)).resolves.toBeUndefined();
    expect(() => waterPlugin.dispose!()).not.toThrow();
  });
});
