import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, UNAUTHORIZED_EVENT } from '../api.js';

const Ctx = createContext(null);

/**
 * Who is logged in. The session itself lives in an HttpOnly cookie the page can't read, so the only way to
 * know is to ask the server (`/api/auth/me`) on load.
 *
 *   status: 'loading' → asking · 'authed' → user is set · 'guest' → not logged in · 'error' → server unreachable
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, expired: false, error: null });

  const boot = useCallback(async () => {
    try {
      const { user } = await api.auth.me();
      setState(user ? { status: 'authed', user, expired: false, error: null } : { status: 'guest', user: null, expired: false, error: null });
    } catch (e) {
      setState({ status: 'error', user: null, expired: false, error: e });
    }
  }, []);

  // Ask the server who we are (cancelled if unmounted, e.g. StrictMode's double mount in development).
  useEffect(() => {
    let cancelled = false;
    api.auth.me().then(
      ({ user }) => !cancelled && setState(user ? { status: 'authed', user, expired: false, error: null } : { status: 'guest', user: null, expired: false, error: null }),
      (e) => {
        if (cancelled) return;
        setState(e.status === 401 ? { status: 'guest', user: null, expired: false, error: null } : { status: 'error', user: null, expired: false, error: e });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Any logged-in request that comes back 401 means the session ended (expired, or password changed elsewhere).
  useEffect(() => {
    const onUnauthorized = () => setState((s) => (s.status === 'authed' ? { status: 'guest', user: null, expired: true, error: null } : s));
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      retry: () => {
        setState((s) => ({ ...s, status: 'loading' }));
        return boot();
      },
      async login(credentials) {
        const { user } = await api.auth.login(credentials);
        setState({ status: 'authed', user, expired: false, error: null });
        return user;
      },
      async signup(details) {
        const { user } = await api.auth.signup(details);
        // `fresh` lets the guest-page guard send a brand-new account to onboarding instead of the dashboard.
        setState({ status: 'authed', user, expired: false, error: null, fresh: true });
        return user;
      },
      async logout() {
        try {
          await api.auth.logout();
        } finally {
          setState({ status: 'guest', user: null, expired: false, error: null });
        }
      },
      clearExpired: () => setState((s) => (s.expired ? { ...s, expired: false } : s)),
    }),
    [state, boot],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
