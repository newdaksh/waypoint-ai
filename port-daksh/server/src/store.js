import { ENTRY_ID } from '@waypoint/shared';
import { MongoClient } from 'mongodb';
import { emptyWorkspace } from './domain/workspace.js';

const COLLECTION = 'workspaces';
const CHAT_LIMIT = 200; // most recent messages kept
const TOP_LEVEL_KEY = /^[A-Za-z][A-Za-z0-9]*$/;

const now = () => new Date().toISOString();
const stripId = ({ _id, ...workspace }) => workspace;

/**
 * Translate a workspace patch ({ set, merge }, see shared/src/patch.js) into one atomic MongoDB update.
 *
 *   set:   { key: value }                  → $set  { key: value }
 *   merge: { map: { id: value } }          → $set  { "map.id": value }
 *          { map: { id: null } }           → $unset { "map.id": "" }
 *
 * Updating exact paths (instead of rewriting the document) means two requests touching different
 * entries can never overwrite each other. Equivalent to `applyPatch` — a test checks that.
 * Keys and ids become field paths, so anything that could address something else is rejected.
 */
export function buildUpdate(patch) {
  const { set = {}, merge = {} } = patch || {};
  const $set = {};
  const $unset = {};
  const replaced = { ...set };

  const checkKey = (key) => {
    if (!TOP_LEVEL_KEY.test(key)) throw new Error(`Invalid workspace key "${key}".`);
  };
  const checkId = (id) => {
    if (!ENTRY_ID.test(id)) throw new Error(`Invalid entry id "${id}".`);
  };

  Object.keys(set).forEach(checkKey);
  for (const [key, entries] of Object.entries(merge)) {
    checkKey(key);
    if (key in replaced) {
      // Replaced and merged in one patch: fold the merge into the replacement (a path can't be both).
      const map = { ...replaced[key] };
      for (const [id, value] of Object.entries(entries || {})) {
        checkId(id);
        if (value === null) delete map[id];
        else map[id] = value;
      }
      replaced[key] = map;
      continue;
    }
    for (const [id, value] of Object.entries(entries || {})) {
      checkId(id);
      if (value === null) $unset[`${key}.${id}`] = '';
      else $set[`${key}.${id}`] = value;
    }
  }

  Object.assign($set, replaced, { updatedAt: now() });
  return Object.keys($unset).length ? { $set, $unset } : { $set };
}

/**
 * MongoDB access. Each user has exactly one workspace document (`workspaces` collection, `_id` = the
 * user's id). MongoDB is the only source of truth — nothing is cached in the process, so several server
 * instances can safely share one database. Workspace objects handed out never include `_id`.
 *
 * `store.db` exposes the database so the auth module can keep its own collections beside the workspaces.
 */
export function createStore({ uri, dbName, appName = 'waypoint' }) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName });
  let db = null;
  let workspaces = null;
  const col = () => {
    if (!workspaces) throw new Error('Store used before init()');
    return workspaces;
  };

  /** Create the user's empty workspace if needed (atomically) and add any keys newer app versions need. */
  async function ensureWorkspace(userId, name) {
    const defaults = emptyWorkspace({ name });
    await col().updateOne({ _id: userId }, { $setOnInsert: { ...defaults, updatedAt: now() } }, { upsert: true });
    const stored = await col().findOne({ _id: userId });
    const missing = Object.keys(defaults).filter((k) => !(k in stored));
    if (missing.length) await col().updateOne({ _id: userId }, { $set: Object.fromEntries(missing.map((k) => [k, defaults[k]])) });
  }

  return {
    async init() {
      await client.connect();
      db = client.db(dbName);
      workspaces = db.collection(COLLECTION);
      return this;
    },

    get db() {
      return db;
    },

    /** The workspace API for one user. `name` seeds the profile name of a brand-new workspace. */
    forUser(userId, { name = '' } = {}) {
      const id = String(userId);

      /** Run an update; if the document is missing, create it first and try once more. */
      async function update(operation) {
        const options = { returnDocument: 'after' };
        let doc = await col().findOneAndUpdate({ _id: id }, operation, options);
        if (!doc) {
          await ensureWorkspace(id, name);
          doc = await col().findOneAndUpdate({ _id: id }, operation, options);
        }
        return stripId(doc);
      }

      return {
        ensure: () => ensureWorkspace(id, name),

        /** The current workspace (created empty on first use). */
        async read() {
          let doc = await col().findOne({ _id: id });
          if (!doc) {
            await ensureWorkspace(id, name);
            doc = await col().findOne({ _id: id });
          }
          return stripId(doc);
        },

        /** Apply a { set, merge } patch atomically; resolves to the updated workspace. */
        patch: (patch) => update(buildUpdate(patch)),

        /** Append a chat message (atomic, keeps the latest CHAT_LIMIT). */
        appendChat: (message) => update({ $push: { chat: { $each: [message], $slice: -CHAT_LIMIT } }, $set: { updatedAt: now() } }),

        /** Replace the whole workspace (used by tests and imports). */
        async replace(workspace) {
          const { _id, ...rest } = workspace;
          await col().replaceOne({ _id: id }, { _id: id, ...rest, updatedAt: now() }, { upsert: true });
        },

        /** Delete the user's workspace permanently. */
        remove: () => col().deleteOne({ _id: id }),
      };
    },

    close() {
      return client.close();
    },
  };
}
