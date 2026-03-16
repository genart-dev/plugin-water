# @genart-dev/plugin-water

Water effects for [genart.dev](https://genart.dev) — surface waves, reflections, foam, shoreline interactions, underwater caustics, and ice layers. 33 presets across 6 categories, with 8 MCP tools for AI-agent control.

Part of [genart.dev](https://genart.dev) — a generative art platform with an MCP server, desktop app, and IDE extensions.

## Install

```bash
npm install @genart-dev/plugin-water
```

## Usage

```typescript
import waterPlugin from "@genart-dev/plugin-water";
import { createDefaultRegistry } from "@genart-dev/core";

const registry = createDefaultRegistry();
registry.registerPlugin(waterPlugin);

// Or access individual exports
import {
  ALL_PRESETS,
  getPreset,
  filterPresets,
  searchPresets,
  surfaceLayerType,
  reflectionLayerType,
  foamLayerType,
  shorelineLayerType,
  causticsLayerType,
  iceLayerType,
} from "@genart-dev/plugin-water";
```

## Layer Types (6)

| Layer Type | Category | Default Preset | Description |
|---|---|---|---|
| `water:surface` | Surface (11) | `still-lake` | Water body rendering with 3 algorithms: calm (stripe compositing), ocean (Gerstner waves), flow (flow-field ripples) |
| `water:reflection` | Reflection (4) | `calm-lake-reflection` | Terrain/sky mirroring below waterline with Fresnel-based strength and noise distortion |
| `water:foam` | Foam (4) | `ocean-whitecaps` | Whitecap patches, foam trails, Langmuir circulation streaks, and bubble rafts |
| `water:shoreline` | Shoreline (7) | `sandy-beach` | Water-land transition with wave break styles (spilling/plunging/surging) and debris |
| `water:caustics` | Caustics (3) | `shallow-caustics` | Underwater light patterns from dual-noise refraction, clarity-gated |
| `water:ice` | Ice (4) | `frozen-lake` | Frozen surface with cracks, frost crystals, snow cover, thickness transparency |

## Presets (33)

### Surface (11)

| ID | Name | Algorithm | Description |
|---|---|---|---|
| `still-lake` | Still Lake | calm | Calm, mirror-like lake surface with minimal ripples |
| `pond` | Pond | calm | Small quiet pond with subtle surface movement |
| `misty-lake` | Misty Lake | calm | Still lake surface shrouded in atmospheric mist |
| `moonlit-water` | Moonlit Water | calm | Dark water with a single bright moonlight reflection path |
| `choppy-sea` | Choppy Sea | ocean | Rough ocean surface with strong waves and whitecaps |
| `ocean-swell` | Ocean Swell | ocean | Deep ocean with long rolling swells |
| `stormy-ocean` | Stormy Ocean | ocean | Violent storm-tossed ocean with towering waves |
| `tropical-shallows` | Tropical Shallows | ocean | Clear turquoise shallow water over sandy bottom |
| `coastal-surf` | Coastal Surf | ocean | Breaking waves in the surf zone near shore |
| `mountain-stream` | Mountain Stream | flow | Clear mountain stream with visible ripple patterns and current |
| `river` | River | flow | Wide river with moderate current and surface texture |

### Reflection (4)

| ID | Name | Description |
|---|---|---|
| `calm-lake-reflection` | Calm Lake | Near-perfect mirror reflection on still lake water |
| `rippled-reflection` | Rippled Reflection | Broken reflection with moderate ripple distortion |
| `dark-water-reflection` | Dark Water | Deep dark water reflection with strong darkening |
| `golden-reflection` | Golden Reflection | Warm golden hour reflection with amber tints |

### Foam (4)

| ID | Name | Description |
|---|---|---|
| `ocean-whitecaps` | Ocean Whitecaps | Scattered whitecaps on wind-driven ocean waves |
| `surf-foam` | Surf Foam | Dense churning foam in the breaking wave zone |
| `gentle-foam` | Gentle Foam | Subtle foam lines on calm water surface |
| `storm-foam` | Storm Foam | Heavy foam and spray from storm-force winds |

### Shoreline (7)

| ID | Name | Description |
|---|---|---|
| `sandy-beach` | Sandy Beach | Wide sandy beach with gentle foam line and shell debris |
| `rocky-shore` | Rocky Shore | Rugged rocky shoreline with crashing surf |
| `muddy-riverbank` | Muddy Riverbank | Soft muddy bank along a river |
| `grassy-bank` | Grassy Bank | Gentle grassy slope meeting the water |
| `tidal-flat` | Tidal Flat | Exposed tidal flat with wet sand and pools |
| `cliff-base` | Cliff Base | Narrow strip at the base of sea cliffs |
| `marsh-edge` | Marsh Edge | Marshy waterline with organic matter and vegetation |

### Caustics (3)

| ID | Name | Description |
|---|---|---|
| `shallow-caustics` | Shallow Caustics | Bright caustic light patterns in clear shallow water |
| `deep-pool-caustics` | Deep Pool | Faint caustic shimmer in deeper clear water |
| `tropical-caustics` | Tropical Caustics | Vivid dancing caustics over white sand |

### Ice (4)

| ID | Name | Description |
|---|---|---|
| `frozen-lake` | Frozen Lake | Thick frozen lake with deep cracks and air bubbles |
| `thin-ice` | Thin Ice | Translucent ice revealing dark water beneath |
| `pack-ice` | Pack Ice | Broken pack ice with snow-covered chunks |
| `frost-glass` | Frost Glass | Delicate frost crystal patterns on clear ice |

## Rendering

Each layer type renders via canvas2d:

- **Surface** — Three algorithm modes:
  - *Calm*: Horizontal stripe compositing with noise-displaced wave lines, shimmer highlights (lakes, ponds)
  - *Ocean*: Gerstner wave field with 3-7 superimposed wave components, slope-based shading (seas, oceans)
  - *Flow*: Flow-field lines following current direction with fractal noise perturbation, cross-ripples (rivers, streams)
- **Reflection** — Sliced terrain/sky color bands with Fresnel-based opacity (stronger at glancing angles), noise-based ripple distortion
- **Foam** — Noise-threshold whitecap ellipses, trailing foam streaks, Langmuir circulation lines (wind-parallel foam), bubble raft particles
- **Shoreline** — Noise-modulated shore gradient with wave break style modifiers (spilling/plunging/surging foam passes), procedural debris (seaweed, driftwood, shells, pebbles)
- **Caustics** — Dual-layer fractal noise creating bright intersections, light-angle offset, clarity-gated (invisible below 0.3 clarity), depth-faded
- **Ice** — Noise-modulated ice transparency over dark water, procedural crack networks with branching, frost crystal stars, fractal noise snow cover patches

## MCP Tools (8)

Exposed to AI agents through the MCP server when this plugin is registered:

| Tool | Description |
|---|---|
| `design_add_water_surface` | Add a water surface by preset with optional overrides (surfaceColor, waveHeight, shimmer) |
| `design_add_water_reflection` | Add a reflection layer by preset with optional overrides (skyColor, terrainColor, strength) |
| `design_add_water_foam` | Add a foam/whitecaps layer by preset with optional overrides (foamAmount, waterlinePosition) |
| `design_add_water_shoreline` | Add a shoreline by preset with optional overrides (foamIntensity, waterlinePosition) |
| `design_add_water_caustics` | Add underwater caustics by preset with optional overrides (clarity, waterlinePosition) |
| `design_add_water_ice` | Add a frozen surface by preset with optional overrides (iceThickness, snowCover) |
| `list_water_presets` | List all presets, optionally filtered by category |
| `design_set_water_conditions` | Compose a multi-layer water scene from 4 conditions (calm, choppy, stormy, frozen) |

## Water Conditions

The `design_set_water_conditions` tool creates coordinated multi-layer scenes:

| Condition | Layers Created |
|---|---|
| `calm` | still-lake surface + calm-lake reflection |
| `choppy` | choppy-sea surface + rippled reflection + ocean whitecaps |
| `stormy` | stormy-ocean surface + dark-water reflection + storm foam |
| `frozen` | frozen-lake ice |

All conditions accept an optional `withShoreline` parameter to add a shoreline layer.

## Depth Lane System

Every water layer supports the depth lane system for atmospheric depth integration:

- `depthLane` — Named slot (sky, far-background, background, midground, foreground, ground-plane, overlay)
- `atmosphericMode` — Western (blue shift) or ink-wash (paper tone) atmospheric perspective

Default depth lanes: surface/foam = midground, reflection/shoreline = ground-plane.

## Utilities

Shared utilities exported for advanced use:

```typescript
import {
  mulberry32,                                    // Deterministic PRNG
  createValueNoise, createFractalNoise,          // Procedural noise
  createWarpedNoise,                             // Domain-warped noise
  parseHex, toHex, lerpColor, darken, lighten,   // Color utils
  varyColor,                                     // Random color variation
} from "@genart-dev/plugin-water";
```

## Preset Discovery

```typescript
import { ALL_PRESETS, filterPresets, searchPresets, getPreset } from "@genart-dev/plugin-water";

// All 33 presets
console.log(ALL_PRESETS.length); // 33

// Filter by category
const surface = filterPresets("surface");       // 11 presets
const ice = filterPresets("ice");               // 4 presets

// Full-text search
const results = searchPresets("ocean");         // choppy-sea, ocean-swell, ...

// Look up by ID
const preset = getPreset("stormy-ocean");
```

## Related Packages

| Package | Purpose |
|---|---|
| [`@genart-dev/core`](https://github.com/genart-dev/core) | Plugin host, layer system, compositor (dependency) |
| [`@genart-dev/mcp-server`](https://github.com/genart-dev/mcp-server) | MCP server that surfaces plugin tools to AI agents |
| [`@genart-dev/plugin-terrain`](https://github.com/genart-dev/plugin-terrain) | Sky, terrain profiles — provides reflection sources and shore context |
| [`@genart-dev/plugin-atmosphere`](https://github.com/genart-dev/plugin-atmosphere) | Fog, mist, clouds — pairs with misty-lake and atmospheric water scenes |
| [`@genart-dev/plugin-particles`](https://github.com/genart-dev/plugin-particles) | Rain particles — can trigger foam splash impacts |
| [`@genart-dev/plugin-plants`](https://github.com/genart-dev/plugin-plants) | Vegetation near shorelines |
| [`@genart-dev/plugin-patterns`](https://github.com/genart-dev/plugin-patterns) | Geometric and cultural pattern fills |

## Support

Questions, bugs, or feedback — [support@genart.dev](mailto:support@genart.dev) or [open an issue](https://github.com/genart-dev/plugin-water/issues).

## License

MIT
