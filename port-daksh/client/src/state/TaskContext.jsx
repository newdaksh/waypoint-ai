import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from './WorkspaceContext.jsx';

const Ctx = createContext(null);

const STEP_MS = 1700; // how often the progress list advances while a task runs
const SHOW_AFTER_MS = 150; // don't flash the progress card for instant validation errors

/**
 * Runs one long task at a time and exposes what the shell shows for it: a progress card while it
 * runs, and an error banner (with Retry when it makes sense) when it fails.
 */
export function TaskProvider({ children }) {
  const { runAi } = useWorkspace();
  const [loading, setLoading] = useState(null); // { title, steps } once the card is visible
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState(null); // { message, canRetry }
  const busy = useRef(false);
  const last = useRef(null);
  const runRef = useRef(null); // latest `run`, so Retry can re-run a task without `run` capturing itself

  const run = useCallback(async (title, steps, fn) => {
    if (busy.current) return false;
    busy.current = true;
    last.current = () => runRef.current(title, steps, fn);
    setError(null);
    setStepIdx(0);

    const show = setTimeout(() => setLoading({ title, steps }), SHOW_AFTER_MS);
    const tick = setInterval(() => setStepIdx((i) => Math.min(i + 1, steps.length - 1)), STEP_MS);
    try {
      await fn();
      return true;
    } catch (e) {
      setError({ message: e.message || 'Something went wrong.', canRetry: e.canRetry ?? true });
      return false;
    } finally {
      clearTimeout(show);
      clearInterval(tick);
      busy.current = false;
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  /** Convenience: run an AI task with its progress copy. Resolves true on success. */
  const ai = useCallback((title, steps, task, body) => run(title, steps, () => runAi(task, body)), [run, runAi]);

  const fail = useCallback((message) => {
    setError({ message, canRetry: false });
    return false;
  }, []);

  const value = useMemo(
    () => ({
      loading,
      stepIdx,
      error,
      run,
      ai,
      fail,
      retry: () => last.current?.(),
      dismissError: () => setError(null),
    }),
    [loading, stepIdx, error, run, ai, fail],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTasks() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTasks must be used inside <TaskProvider>');
  return ctx;
}
