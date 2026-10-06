// Client-side form checks. They give instant feedback; the server repeats and enforces every rule.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailError = (value) => {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (v.length > 254 || !EMAIL.test(v)) return 'Enter a valid email address.';
  return '';
};

export const nameError = (value) => {
  const v = value.replace(/\s+/g, ' ').trim();
  if (!v) return 'Enter your name.';
  if (v.length > 80) return 'Use 80 characters or fewer.';
  if (/[<>]/.test(v)) return "Your name can't contain < or >.";
  return '';
};

// A few of the most-used passwords. The server holds the real list; this only powers live feedback.
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', 'qwerty123', 'qwertyui', 'iloveyou', 'admin123', 'welcome1', 'letmein123', 'abc12345', '11111111', 'waypoint']);

/** The requirement checklist shown while choosing a password. `required` items block submitting. */
export function passwordChecks(password, { email = '', name = '' } = {}) {
  const lower = password.toLowerCase();
  const local = email.split('@')[0].toLowerCase();
  const personal = Boolean(password) && (lower === email.toLowerCase() || (local.length >= 4 && lower === local) || (name.trim().split(/\s+/)[0]?.toLowerCase() === lower && lower.length >= 4));
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return [
    { id: 'length', label: 'At least 8 characters', ok: password.length >= 8, required: true },
    { id: 'common', label: "Not a common password or your email", ok: Boolean(password) && !COMMON.has(lower) && !personal && !/^(.)\1+$/.test(password), required: true },
    { id: 'mix', label: 'Mix of letters, numbers or symbols', ok: classes >= 2 && /[A-Za-z]/.test(password), required: false },
  ];
}

/** 0–4 plus a label, for the strength meter. Length counts most; variety helps; known-weak caps the score. */
export function passwordStrength(password, context) {
  if (!password) return { score: 0, label: 'Enter a password' };
  const checks = passwordChecks(password, context);
  if (!checks[0].ok || !checks[1].ok) return { score: 1, label: password.length < 8 ? 'Too short' : 'Too guessable' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = 2;
  if (password.length >= 12 || (password.length >= 10 && classes >= 3)) score = 3;
  if (password.length >= 16 || (password.length >= 12 && classes >= 3)) score = 4;
  return { score, label: ['', '', 'Fair', 'Good', 'Excellent'][score] };
}

/** Only follow redirects that stay inside the app (never an attacker-supplied URL). */
export const safeNext = (next) => (typeof next === 'string' && /^\/app(\/|$)/.test(next) && !next.startsWith('//') ? next : '/app/dashboard');
