import type { LayerPropertySchema, LayerProperties } from "@genart-dev/core";

/** Create default properties from a schema array. */
export function createDefaultProps(properties: LayerPropertySchema[]): LayerProperties {
  const props: LayerProperties = {};
  for (const schema of properties) {
    props[schema.key] = schema.default;
  }
  return props;
}

/** Smoothstep interpolation t in [0,1]. */
export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Smootherstep (C2 continuous) interpolation t in [0,1]. */
export function smootherstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
}
