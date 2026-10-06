import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Banner, PasswordField, PasswordStrength, SubmitButton } from '../../components/auth/fields.jsx';
import { AlertIcon, ArrowRightIcon, CheckIcon, LinkIcon } from '../../components/icons.jsx';
import { passwordChecks } from '../../lib/validate.js';

/** The one-time token arrives in the URL fragment (#token=…), which browsers never send to any server. */
const readToken = () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [token] = useState(readToken);
  const [phase, setPhase] = useState(token ? 'checking' : 'invalid'); // checking | form | invalid | offline | done
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Remove the token from the address bar and history so it can't be shared, bookmarked or leaked by accident.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  // Find out right away whether the link is still good, before asking for a password.
  useEffect(() => {
    if (!token) return undefined;
    let off = false;
    api.auth.checkResetToken(token).then(
      ({ valid }) => !off && setPhase(valid ? 'form' : 'invalid'),
      () => !off && setPhase('offline'),
    );
    return () => {
      off = true;
    };
  }, [token, attempt]);

  // After success, continue to the login page.
  useEffect(() => {
    if (phase !== 'done') return undefined;
    const t = setTimeout(() => navigate('/login?reset=1', { replace: true }), 2400);
    return () => clearTimeout(t);
  }, [phase, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const blocking = passwordChecks(password).find((c) => c.required && !c.ok);
    if (!password || blocking) {
      setError(!password ? 'Choose a new password.' : blocking.id === 'length' ? 'Use at least 8 characters.' : 'That password is too easy to guess.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await api.auth.resetPassword(token, password);
      setPhase('done');
    } catch (err) {
      if (err.code === 'invalid_token') setPhase('invalid');
      else if (err.field === 'password') setError(err.message);
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const switcher = (
    <>
      <Link to="/login">Back to log in</Link>
    </>
  );

  if (phase === 'checking') {
    return (
      <AuthShell switcher={switcher}>
        <div className="auth-stagger" aria-busy="true">
          <div>
            <h1 className="auth-title">Checking your link…</h1>
            <p className="auth-sub">One moment while we verify it.</p>
          </div>
          <div className="skeleton" />
        </div>
      </AuthShell>
    );
  }

  if (phase === 'invalid' || phase === 'offline') {
    const offline = phase === 'offline';
    return (
      <AuthShell switcher={switcher}>
        <div className="state auth-stagger">
          <div className="state__badge state__badge--bad" aria-hidden="true">
            {offline ? <AlertIcon /> : <LinkIcon />}
          </div>
          <h1 className="auth-title">{offline ? "Couldn't check your link" : 'This link has expired'}</h1>
          <p className="auth-sub">
            {offline
              ? "We couldn't reach the server. Check your connection and try again."
              : 'Reset links work once and expire after an hour. Request a new one and we will email it right away.'}
          </p>
          <div className="state__actions">
            {offline ? (
              <button type="button" className="abtn" onClick={() => { setPhase('checking'); setAttempt((n) => n + 1); }}>
                Try again
              </button>
            ) : (
              <Link to="/forgot-password" className="abtn" style={{ textDecoration: 'none', color: '#fff' }}>
                Request a new link <ArrowRightIcon width={18} height={18} />
              </Link>
            )}
            <Link to="/login" className="auth-row" style={{ justifyContent: 'center', fontWeight: 600 }}>
              Back to log in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (phase === 'done') {
    return (
      <AuthShell switcher={switcher}>
        <div className="state auth-stagger">
          <div className="state__badge state__badge--ok" aria-hidden="true">
            <CheckIcon />
          </div>
          <h1 className="auth-title">Password updated</h1>
          <p className="auth-sub">You've been signed out everywhere for safety. Taking you to the login page…</p>
          <div className="state__actions">
            <Link to="/login?reset=1" className="abtn" style={{ textDecoration: 'none', color: '#fff' }}>
              Continue to log in <ArrowRightIcon width={18} height={18} />
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell switcher={switcher}>
      <div className="auth-stagger">
        <div>
          <h1 className="auth-title">Choose a new password</h1>
          <p className="auth-sub">Pick something you don't use anywhere else. Longer is stronger.</p>
        </div>

        {formError && <Banner tone="error">{formError}</Banner>}

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="auth-form" style={{ gap: 14 }}>
            <PasswordField
              label="New password"
              autoComplete="new-password"
              name="password"
              autoFocus
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
                setFormError('');
              }}
              error={error}
            />
            {password && <PasswordStrength password={password} />}
          </div>
          <SubmitButton busy={busy} busyLabel="Updating password…">
            Update password
          </SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
