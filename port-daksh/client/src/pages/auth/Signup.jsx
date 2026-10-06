import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Banner, Checkbox, PasswordField, PasswordStrength, SubmitButton, TextField } from '../../components/auth/fields.jsx';
import { MailIcon, ShieldIcon, UserIcon } from '../../components/icons.jsx';
import { emailError, nameError, passwordChecks } from '../../lib/validate.js';
import { useAuth } from '../../state/AuthContext.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const focusField = (key) => ({ name: nameRef, email: emailRef, password: passwordRef })[key].current?.focus();

  const change = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((er) => ({ ...er, [key]: '' }));
    setFormError('');
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const blocking = passwordChecks(values.password, values).find((c) => c.required && !c.ok);
    const found = {
      name: nameError(values.name),
      email: emailError(values.email),
      password: !values.password ? 'Choose a password.' : blocking ? (blocking.id === 'length' ? 'Use at least 8 characters.' : 'That password is too easy to guess. Try a longer one.') : '',
    };
    const first = ['name', 'email', 'password'].find((k) => found[k]);
    if (first) {
      setErrors(found);
      setShake((n) => n + 1);
      focusField(first);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await signup({ name: values.name.trim(), email: values.email.trim(), password: values.password, remember: values.remember });
      navigate('/app/profile', { replace: true });
    } catch (err) {
      if (['name', 'email', 'password'].includes(err.field)) {
        setErrors({ [err.field]: err.message });
        focusField(err.field);
      } else {
        setFormError(err.message);
      }
      setShake((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      switcher={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <div className="auth-stagger">
        <div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Analyze your resume once and put it to work across every job you consider.</p>
        </div>

        {formError && (
          <div key={shake} className="shake">
            <Banner tone="error">{formError}</Banner>
          </div>
        )}

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <TextField
            ref={nameRef}
            label="Full name"
            icon={UserIcon}
            name="name"
            autoComplete="name"
            autoFocus
            placeholder="Your name"
            value={values.name}
            onChange={change('name')}
            error={errors.name}
          />
          <TextField
            ref={emailRef}
            label="Email"
            icon={MailIcon}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={values.email}
            onChange={change('email')}
            error={errors.email}
          />
          <div className="auth-form" style={{ gap: 14 }}>
            <PasswordField
              ref={passwordRef}
              label="Password"
              autoComplete="new-password"
              name="password"
              placeholder="At least 8 characters"
              value={values.password}
              onChange={change('password')}
              error={errors.password}
            />
            {values.password && <PasswordStrength password={values.password} context={values} />}
          </div>
          <Checkbox label="Keep me logged in on this device" checked={values.remember} onChange={change('remember')} />
          <SubmitButton busy={busy} busyLabel="Creating your account…">
            Create account
          </SubmitButton>
        </form>

        <p className="auth-secure">
          <ShieldIcon width={15} height={15} /> Passwords are stored as salted hashes — never in plain text.
        </p>
      </div>
    </AuthShell>
  );
}
