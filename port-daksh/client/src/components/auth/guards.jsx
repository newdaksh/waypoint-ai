import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { safeNext } from '../../lib/validate.js';
import { useAuth } from '../../state/AuthContext.jsx';
import { Button } from '../ui.jsx';

function Splash({ children }) {
  return (
    <div role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f7f8fa' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: '#8b93a1', fontSize: 14, textAlign: 'center' }}>
        <span className="auth-logo" style={{ width: 40, height: 40 }} aria-hidden="true"><i /></span>
        {children}
      </div>
    </div>
  );
}

/** The app is for logged-in users only: everyone else is sent to the login page and returned afterwards. */
export function RequireAuth({ children }) {
  const { status, error, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Splash>Loading…</Splash>;
  if (status === 'error') {
    return (
      <Splash>
        <span style={{ color: '#3c4452' }}>{error?.message || "Couldn't reach the server."}</span>
        <Button onClick={retry}>Try again</Button>
      </Splash>
    );
  }
  if (status === 'guest') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

/** Login / sign-up pages are for guests: a logged-in visitor goes straight to the app. */
export function GuestOnly({ children }) {
  const { status, fresh } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <Splash>Loading…</Splash>;
  if (status === 'authed') return <Navigate to={fresh ? '/app/profile' : safeNext(params.get('next'))} replace />;
  return children;
}
