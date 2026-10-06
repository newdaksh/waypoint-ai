import { applyPatch, isEmptyPatch, mergePatches } from '@waypoint/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const Ctx = createContext(null);

const SAVE_DELAY_MS = 500;
const RETRY_DELAY_MS = 4000;

/**
 * Holds the logged-in user's workspace (the server is the source of truth) and keeps it in sync:
 *
 *  - `save(patch)` applies a user edit locally at once and autosaves it (debounced, serialized,
 *    coalesced into one PATCH). Failed saves are kept and retried; `saveState` exposes the status.
 *  - `runAi(task, body)` first flushes pending edits (the server reads the resume / jobs from its
 *    own copy), runs the task, then applies the patch the server stored.
 *
 * The workspace is remembered together with the id of the user it belongs to, so logging out (or in as
 * someone else) can never expose the previous user's data, even for a single render.
 */
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [held, setHeld] = useState({ userId: null, ws: null, error: null });
  const ws = held.userId === userId ? held.ws : null;
  const loadError = held.userId === userId ? held.error : null;
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error

  const pending = useRef(null); // edits not yet sent
  const timer = useRef(null);
  const inflight = useRef(Promise.resolve()); // serializes PATCH requests; never rejects
  const sendRef = useRef(null); // lets the retry timer call the latest `send` without capturing itself

  const apply = useCallback((patch) => setHeld((h) => (h.ws ? { ...h, ws: applyPatch(h.ws, patch) } : h)), []);

  const send = useCallback((opts) => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (isEmptyPatch(patch)) return inflight.current;
    pending.current = null;
    setSaveState('saving');
    inflight.current = inflight.current
      .then(() => api.patchWorkspace(patch, opts))
      .then(() => {
        if (isEmptyPatch(pending.current)) setSaveState('idle');
      })
      .catch(() => {
        // Keep the edits (older first) and try again shortly.
        pending.current = mergePatches(patch, pending.current);
        setSaveState('error');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => sendRef.current?.(), RETRY_DELAY_MS);
      });
    return inflight.current;
  }, []);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const save = useCallback(
    (patch) => {
      apply(patch);
      pending.current = mergePatches(pending.current, patch);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => send(), SAVE_DELAY_MS);
    },
    [apply, send],
  );

  /** Send everything now; rejects if the edits could not be saved. */
  const flush = useCallback(async () => {
    await send();
    if (!isEmptyPatch(pending.current)) {
      throw new ApiError("Your latest changes couldn't be saved. Check the connection and retry.", { canRetry: true });
    }
  }, [send]);

  // Load the workspace of whoever is logged in; drop unsent edits and timers when they leave.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    api.getWorkspace().then(
      (data) => !cancelled && setHeld({ userId, ws: data, error: null }),
      (e) => !cancelled && setHeld({ userId, ws: null, error: e }),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      pending.current = null;
      setSaveState('idle');
    };
  }, [userId]);

  /** "Try again" after a failed load. */
  const load = useCallback(async () => {
    setHeld({ userId, ws: null, error: null });
    try {
      setHeld({ userId, ws: await api.getWorkspace(), error: null });
    } catch (e) {
      setHeld({ userId, ws: null, error: e });
    }
  }, [userId]);

  // Don't lose edits when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !isEmptyPatch(pending.current)) send({ keepalive: true });
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [send]);

  const runAi = useCallback(
    async (task, body) => {
      await flush();
      const { patch } = await api.runAi(task, body);
      apply(patch);
      return patch;
    },
    [flush, apply],
  );

  const chat = useCallback(
    async (message) => {
      await flush();
      const { patch } = await api.chat(message);
      apply(patch);
    },
    [flush, apply],
  );

  const value = useMemo(
    () => ({
      ws,
      loadError,
      saveState,
      reload: load,
      save,
      /** Replace top-level keys, e.g. set({ resumeText }). */
      set: (obj) => save({ set: obj }),
      /** Merge entries into a map key, e.g. merge('answers', { 3: 'text' }). Use null to delete. */
      merge: (key, entries) => save({ merge: { [key]: entries } }),
      apply,
      flush,
      runAi,
      chat,
    }),
    [ws, loadError, saveState, load, save, apply, flush, runAi, chat],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
