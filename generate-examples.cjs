/**
 * Generate .genart example files for all water presets.
 */
const fs = require("fs");
const path = require("path");

// Import presets from the built plugin
const plugin = require("./dist/index.cjs");
const ALL_PRESETS = plugin.ALL_PRESETS;

const BACKGROUNDS = {
  surface: "#1A2A40",
  reflection: "#1A2A30",
  foam: "#1A3A5C",
  shoreline: "#2A4050",
  caustics: "#1A3050",
  ice: "#1A2530",
};

const TRANSFORM = {
  x: 0, y: 0, width: 600, height: 600,
  rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0,
};

for (const preset of ALL_PRESETS) {
  const dir = path.join(__dirname, "examples", preset.category);
  fs.mkdirSync(dir, { recursive: true });

  const bgColor = BACKGROUNDS[preset.category] || "#1A2A40";

  const sketch = {
    genart: "1.3",
    id: `water-${preset.id}`,
    title: preset.name,
    created: "2026-03-16T00:00:00.000Z",
    modified: "2026-03-16T00:00:00.000Z",
    renderer: { type: "canvas2d" },
    canvas: { width: 600, height: 600 },
    parameters: [],
    colors: [],
    state: { seed: 42, params: {}, colorPalette: [] },
    algorithm: "function sketch(ctx, state) {}",
    layers: [
      {
        id: "bg-layer",
        type: "composite:solid",
        name: "Background",
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        transform: TRANSFORM,
        properties: { color: bgColor },
      },
      {
        id: "water-layer",
        type: `water:${preset.category}`,
        name: preset.name,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        transform: TRANSFORM,
        properties: {
          preset: preset.id,
          seed: 42,
        },
      },
    ],
  };

  const outPath = path.join(dir, `${preset.id}.genart`);
  fs.writeFileSync(outPath, JSON.stringify(sketch, null, 2) + "\n");
}

console.log(`Generated ${ALL_PRESETS.length} example files.`);
