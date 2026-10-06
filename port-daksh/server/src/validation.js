import { AI_TONES, ACCENTS, CLIENT_MERGE_KEYS, CLIENT_SET_KEYS, ENTRY_ID, SIDEBARS } from '@waypoint/shared';
import { HttpError } from './errors.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (max) => (v) => typeof v === 'string' && v.length <= max;
const arrOf = (max, item) => (v) => Array.isArray(v) && v.length <= max && v.every(item);

const hasStrings = (...keys) => (o) => isObj(o) && keys.every((k) => typeof o[k] === 'string');

/** Whole-value validators for keys a client may replace. */
const SET_RULES = {
  profile: (v) => isObj(v) && Object.values(v).every((x) => typeof x === 'string' && x.length <= 5000),
  resumeText: isStr(200_000),
  jobs: arrOf(100, hasStrings('id', 'title', 'text')),
  activeJobId: isStr(64),
  versions: arrOf(200, hasStrings('id', 'name')),
  roadmap: (v) => v === null || (isObj(v) && Array.isArray(v.phases)),
  bulletInput: isStr(20_000),
  safetyInput: isStr(20_000),
  apps: arrOf(2000, (a) => hasStrings('id', 'company', 'role')(a) && Array.isArray(a.events) && Array.isArray(a.notes)),
  chat: arrOf(200, (m) => isObj(m) && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'),
};

/** Per-entry validators for map keys a client may merge into. */
const MERGE_RULES = {
  tailorBy: (v) => isObj(v) && typeof v.text === 'string',
  answers: isStr(20_000),
  claimTests: isObj,
  src: isStr(16),
  prefs: (v, id) =>
    (id === 'accent' && ACCENTS.includes(v)) || (id === 'sidebar' && SIDEBARS.includes(v)) || (id === 'aiTone' && AI_TONES.includes(v)),
};

const bad = (msg) => new HttpError(400, msg, { canRetry: false });

/** Validate a client-supplied workspace patch, returning only whitelisted, well-formed parts. */
export function validateClientPatch(body) {
  if (!isObj(body)) throw bad('Request body must be a JSON object.');
  const { set = {}, merge = {} } = body;
  if (!isObj(set) || !isObj(merge)) throw bad('"set" and "merge" must be objects.');

  const clean = { set: {}, merge: {} };
  for (const [key, value] of Object.entries(set)) {
    if (!CLIENT_SET_KEYS.includes(key)) throw bad(`"${key}" cannot be set by the client.`);
    if (!SET_RULES[key](value)) throw bad(`Invalid value for "${key}".`);
    clean.set[key] = value;
  }
  for (const [key, entries] of Object.entries(merge)) {
    if (!CLIENT_MERGE_KEYS.includes(key)) throw bad(`"${key}" cannot be merged by the client.`);
    if (!isObj(entries)) throw bad(`Entries for "${key}" must be an object.`);
    clean.merge[key] = {};
    for (const [id, value] of Object.entries(entries)) {
      if (!ENTRY_ID.test(id)) throw bad('Invalid entry id.'); // ids become MongoDB field paths
      if (value !== null && !MERGE_RULES[key](value, id)) throw bad(`Invalid entry "${id}" for "${key}".`);
      clean.merge[key][id] = value;
    }
  }
  return clean;
}
