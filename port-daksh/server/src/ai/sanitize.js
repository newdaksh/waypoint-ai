// Defensive coercion for model output. The model is asked for JSON in a given shape, but nothing
// guarantees it, so every field is normalised before it reaches the workspace (and the UI).

/** Integer clamped to 0–100; anything non-numeric becomes 0. */
export const n = (v) => {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 0;
};

export const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : []);

export const str = (v) => (v == null ? '' : String(v));

/** `v` if it is one of `options`, otherwise the default `d`. */
export const one = (v, options, d) => (options.includes(v) ? v : d);

/** Array of strings. */
export const list = (v) => arr(v).map(str);
