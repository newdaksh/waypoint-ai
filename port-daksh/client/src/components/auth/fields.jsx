import { forwardRef, useId, useState } from 'react';
import { passwordChecks, passwordStrength } from '../../lib/validate.js';
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon, Spinner } from '../icons.jsx';

/** Labelled text input with a leading icon, inline error text and accessible wiring. */
export const TextField = forwardRef(function TextField({ label, icon: Icon, error, hint, trailing, className = '', ...input }, ref) {
  const id = useId();
  const messageId = `${id}-msg`;
  return (
    <div className={`af ${error ? 'af--error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className="af__control">
        {Icon && <Icon className="af__icon" />}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          style={{ paddingRight: trailing ? 48 : 14, paddingLeft: Icon ? 44 : 14 }}
          {...input}
        />
        {trailing}
      </div>
      {error ? (
        <p className="af__msg" id={messageId} role="alert">
          <AlertIcon width={15} height={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="af__hint" id={messageId}>{hint}</p>
      ) : null}
    </div>
  );
});

/** Password input with a show/hide toggle. */
export const PasswordField = forwardRef(function PasswordField({ label = 'Password', autoComplete = 'current-password', ...props }, ref) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      ref={ref}
      label={label}
      icon={LockIcon}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      autoCapitalize="none"
      spellCheck={false}
      trailing={
        <button type="button" className="af__toggle" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
          {shown ? <EyeOffIcon width={19} height={19} /> : <EyeIcon width={19} height={19} />}
        </button>
      }
      {...props}
    />
  );
});

const STRENGTH_COLORS = ['#e5e7eb', '#d1453b', '#e0a030', '#4f8f6b', '#12805c'];

/** Four-segment strength meter plus the live requirement checklist. */
export function PasswordStrength({ password, context }) {
  const { score, label } = passwordStrength(password, context);
  const checks = passwordChecks(password, context);
  return (
    <div className="pw" aria-live="polite">
      <div className="pw__bar" role="img" aria-label={`Password strength: ${label}`}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} style={{ background: i <= score ? STRENGTH_COLORS[score] : undefined }} />
        ))}
        <b style={{ color: score > 1 ? STRENGTH_COLORS[score] : '#6b7280' }}>{label}</b>
      </div>
      <ul className="pw__reqs">
        {checks.map((c) => (
          <li key={c.id} className={c.ok ? 'is-ok' : ''}>
            <span className="pw__tick">{c.ok && <CheckIcon width={11} height={11} strokeWidth={3.2} />}</span>
            {c.label}
            {!c.required && <em> · recommended</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Custom checkbox (the real input stays in the DOM for keyboards and screen readers). */
export function Checkbox({ label, ...input }) {
  return (
    <label className="ck">
      <input type="checkbox" {...input} />
      <span className="ck__box"><CheckIcon width={12} height={12} strokeWidth={3.4} /></span>
      {label}
    </label>
  );
}

/** Full-width primary button with a built-in busy state. */
export function SubmitButton({ busy, children, busyLabel, ...props }) {
  return (
    <button type="submit" className="abtn" disabled={busy} aria-busy={busy || undefined} {...props}>
      {busy ? (
        <>
          <Spinner /> {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** A message banner: error, success or info. Errors are announced to screen readers. */
export function Banner({ tone = 'error', children, ...props }) {
  const Icon = tone === 'success' ? CheckIcon : AlertIcon;
  return (
    <div className={`abanner abanner--${tone}`} role={tone === 'error' ? 'alert' : 'status'} {...props}>
      <Icon width={18} height={18} style={{ flex: 'none', marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}
