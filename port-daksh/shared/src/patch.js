/**
 * Workspace patches.
 *
 * Both the client (local state + autosave) and the server (persistence + AI results) describe
 * changes with the same shape, so they can never disagree about how a change applies:
 *
 *   {
 *     set:   { key: value },                  // replace whole top-level keys
 *     merge: { mapKey: { id: value | null } } // shallow-merge entries into a map; null deletes the entry
 *   }
 *
 * `set` is applied first, then `merge`.
 */

export function applyPatch(state, patch) {
  const { set = {}, merge = {} } = patch || {};
  const next = { ...state, ...set };
  for (const [key, entries] of Object.entries(merge)) {
    const map = { ...next[key] };
    for (const [id, value] of Object.entries(entries || {})) {
      if (value === null) delete map[id];
      else map[id] = value;
    }
    next[key] = map;
  }
  return next;
}

/** Combine two patches into one that is equivalent to applying `a` then `b`. */
export function mergePatches(a, b) {
  const out = { set: { ...a?.set }, merge: {} };
  for (const [k, v] of Object.entries(a?.merge || {})) out.merge[k] = { ...v };
  for (const [k, v] of Object.entries(b?.set || {})) {
    out.set[k] = v;
    delete out.merge[k]; // a later full replacement supersedes earlier entry-level changes
  }
  for (const [k, v] of Object.entries(b?.merge || {})) out.merge[k] = { ...out.merge[k], ...v };
  return out;
}

export const isEmptyPatch = (p) => !p || (!Object.keys(p.set || {}).length && !Object.keys(p.merge || {}).length);

/** Keys a client may change directly. AI-derived results are only ever written by the server. */
export const CLIENT_SET_KEYS = ['profile', 'resumeText', 'jobs', 'activeJobId', 'versions', 'roadmap', 'bulletInput', 'safetyInput', 'apps', 'chat'];
export const CLIENT_MERGE_KEYS = ['tailorBy', 'answers', 'claimTests', 'src', 'prefs'];
