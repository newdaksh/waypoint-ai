import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Banner, SubmitButton, TextField } from '../../components/auth/fields.jsx';
import { ArrowLeftIcon, MailIcon } from '../../components/icons.jsx';
import { emailError } from '../../lib/validate.js';

const RESEND_SECONDS = 60;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null); // { to, devLink } once the request went through
  const [cooldown, setCooldown] = useState(0);
  const input = useRef(null);

  // Count down before another email may be requested.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function request(address) {
    setBusy(true);
    setFormError('');
    try {
      const res = await api.auth.forgotPassword(address);
      setSent({ to: address, devLink: res.devLink || null });
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      if (err.field === 'email') setError(err.message);
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const problem = emailError(email);
    if (problem) {
      setError(problem);
      input.current?.focus();
      return;
    }
    request(email.trim());
  }

  const switcher = (
    <>
      Remembered it? <Link to="/login">Log in</Link>
    </>
  );

  if (sent) {
    return (
      <AuthShell switcher={switcher}>
        <div className="state auth-stagger">
          <div className="state__badge" aria-hidden="true">
            <MailIcon />
          </div>
          <h1 className="auth-title">Check your inbox</h1>
          <p className="auth-sub">
            If an account exists for <strong>{sent.to}</strong>, a link to reset your password is on its way. It works once and expires in 1 hour.
          </p>
          {formError && <Banner tone="error">{formError}</Banner>}
          {sent.devLink && (
            <div className="devbox">
              <b>Development mode</b> — email is not sent in this setup. Use this link:
              <a href={sent.devLink}>Open the reset page</a>
            </div>
          )}
          <div className="state__actions">
            <button type="button" className="abtn abtn--ghost" disabled={busy || cooldown > 0} onClick={() => request(sent.to)}>
              {cooldown > 0 ? `Send again in ${cooldown}s` : busy ? 'Sending…' : "Didn't get it? Send again"}
            </button>
            <Link to="/login" className="auth-row" style={{ justifyContent: 'center', gap: 8, fontWeight: 600 }}>
              <ArrowLeftIcon width={16} height={16} /> Back to log in
            </Link>
          </div>
          <p className="auth-sub" style={{ fontSize: 13, marginTop: 20, marginBottom: 0 }}>
            Nothing arriving? Check your spam folder, and make sure you used the email you signed up with.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell switcher={switcher}>
      <div className="auth-stagger">
        <div>
          <h1 className="auth-title">Forgot your password?</h1>
          <p className="auth-sub">No problem. Enter your email and we'll send you a link to choose a new one.</p>
        </div>

        {formError && <Banner tone="error">{formError}</Banner>}

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <TextField
            ref={input}
            label="Email"
            icon={MailIcon}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
              setFormError('');
            }}
            error={error}
          />
          <SubmitButton busy={busy} busyLabel="Sending link…">
            Send reset link
          </SubmitButton>
        </form>

        <p className="auth-linkrow">
          <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ArrowLeftIcon width={16} height={16} /> Back to log in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
