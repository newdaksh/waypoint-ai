import { DEFAULT_PREFS } from '@waypoint/shared';

// [accent, accent-dark, accent-tint, accent-ink, accent-border]
const ACCENTS = {
  Indigo: ['#3b5bdb', '#2f4ac0', '#eef1fd', '#2a3fa8', '#c9d3f7'],
  Emerald: ['#0f7b5f', '#0b6650', '#e4f4ee', '#0a5a45', '#bfe3d5'],
  Graphite: ['#1f2937', '#0b1220', '#eef0f3', '#1f2937', '#d1d5db'],
  Violet: ['#6d4ae0', '#5a38c9', '#f1ecfd', '#4b2aa8', '#d8ccf7'],
};
const ACCENT_VARS = ['--acc', '--acc-d', '--acc-t', '--acc-i', '--acc-b'];

// [bg, strong, text, mute, hover, card, border]
const SIDEBARS = {
  Ink: ['#0f1218', '#ffffff', '#c4cad4', '#6b7383', '#1b212b', '#171c25', '#0f1218'],
  Light: ['#ffffff', '#0f1218', '#3c4452', '#8b93a1', '#f1f3f5', '#f5f6f8', '#e5e7eb'],
};
const SIDEBAR_VARS = ['--side-bg', '--side-strong', '--side-text', '--side-mute', '--side-hover', '--side-card', '--side-border'];

/** Write the chosen accent / sidebar palette into CSS custom properties. */
export function applyTheme(prefs = DEFAULT_PREFS) {
  const style = document.documentElement.style;
  const accent = ACCENTS[prefs.accent] || ACCENTS.Indigo;
  const side = SIDEBARS[prefs.sidebar] || SIDEBARS.Ink;
  ACCENT_VARS.forEach((k, i) => style.setProperty(k, accent[i]));
  SIDEBAR_VARS.forEach((k, i) => style.setProperty(k, side[i]));
}

/** [background, foreground] pairs shared by pills, tags and badges. */
export const pill = {
  green: ['#e6f5ee', '#0b6247'],
  red: ['#fdecea', '#a8322a'],
  amber: ['#fcf3e1', '#8a5a12'],
  gray: ['#f1f3f5', '#3c4452'],
  blue: ['var(--acc-t)', 'var(--acc-i)'],
  violet: ['#f1ecfd', '#5531c4'],
};

export const statusTone = {
  Saved: pill.gray,
  Applied: pill.blue,
  Screening: pill.violet,
  Interview: pill.amber,
  'Technical Round': pill.amber,
  'HR Round': pill.amber,
  Offer: pill.green,
  Rejected: pill.red,
  Withdrawn: ['#f1f3f5', '#6b7280'],
};

/** Risk level → tone (Low is good, High is bad). */
export const riskTone = (risk) => (risk === 'Low' ? pill.green : risk === 'High' ? pill.red : pill.amber);

export const impactTone = (impact) => (impact === 'High' ? pill.red : impact === 'Low' ? pill.gray : pill.amber);
export const difficultyTone = { Easy: pill.green, Medium: pill.amber, Hard: pill.red };

/** Bar colour for a 0–100 score. */
export const scoreColor = (v) => (v >= 70 ? '#12805c' : v >= 50 ? '#d99a2b' : '#d1453b');
