import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Banner, Checkbox, PasswordField, SubmitButton, TextField } from '../../components/auth/fields.jsx';
import { MailIcon, ShieldIcon } from '../../components/icons.jsx';
import { emailError, safeNext } from '../../lib/validate.js';
import { useAuth } from '../../state/AuthContext.jsx';

export default function Login() {
  const { login, expired, clearExpired } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [values, setValues] = useState({ email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const change = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((er) => ({ ...er, [key]: '' }));
    setFormError('');
    clearExpired();
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const found = { email: emailError(values.email), password: values.password ? '' : 'Enter your password.' };
    if (found.email || found.password) {
      setErrors(found);
      setShake((n) => n + 1);
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await login({ email: values.email.trim(), password: values.password, remember: values.remember });
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      // Wrong-credentials answers are deliberately generic, so they are shown as one message, not on a field.
      if (err.field === 'email' || err.field === 'password') setErrors({ [err.field]: err.message });
      else setFormError(err.message);
      setShake((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      switcher={
        <>
          New to Waypoint? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <div className="auth-stagger">
        <div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Log in to pick up where your job search left off.</p>
        </div>

        <div>
          {params.get('reset') && <Banner tone="success">Password updated. Log in with your new password.</Banner>}
          {expired && <Banner tone="info">Your session ended. Please log in again.</Banner>}
          {formError && (
            <div key={shake} className="shake">
              <Banner tone="error">{formError}</Banner>
            </div>
          )}
        </div>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <TextField
            ref={emailRef}
            label="Email"
            icon={MailIcon}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="you@example.com"
            value={values.email}
            onChange={change('email')}
            error={errors.email}
          />
          <PasswordField ref={passwordRef} name="password" placeholder="Your password" value={values.password} onChange={change('password')} error={errors.password} />
          <div className="auth-row">
            <Checkbox label="Keep me logged in" checked={values.remember} onChange={change('remember')} />
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <SubmitButton busy={busy} busyLabel="Logging in…">
            Log in
          </SubmitButton>
        </form>

        <p className="auth-secure">
          <ShieldIcon width={15} height={15} /> Your resume and results stay private to your account.
        </p>
      </div>
    </AuthShell>
  );
}
