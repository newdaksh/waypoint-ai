import { pill } from '../lib/theme.js';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

// ───────────────────────── layout

/** Vertical flex container. */
export function Stack({ gap = 0, align, as: Tag = 'div', style, className, children, ...rest }) {
  return (
    <Tag className={className} style={{ display: 'flex', flexDirection: 'column', gap, alignItems: align, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

/** Horizontal flex container. */
export function Row({ gap = 0, align = 'center', justify, wrap, as: Tag = 'div', style, className, children, ...rest }) {
  return (
    <Tag
      className={className}
      style={{ display: 'flex', gap, alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Responsive grid with explicit column tracks; collapses to one column on narrow screens. */
export function Split({ cols, gap = 16, align, style, children, ...rest }) {
  return (
    <div className="split" style={{ '--cols': cols, gap, alignItems: align, ...style }} {...rest}>
      {children}
    </div>
  );
}

/** Auto-fit grid of cards no narrower than `min`. */
export function AutoGrid({ min = 280, gap = 16, align, style, children, ...rest }) {
  return (
    <div className="autogrid" style={{ '--min': `${min}px`, gap, alignItems: align, ...style }} {...rest}>
      {children}
    </div>
  );
}

export const Spacer = () => <span style={{ marginLeft: 'auto' }} />;

// ───────────────────────── surfaces

export function Card({ pad = 20, gap, accent, className, style, children, ...rest }) {
  return (
    <div
      className={cx('card', accent && 'card--accent', className)}
      style={{ padding: pad, ...(gap != null ? { display: 'flex', flexDirection: 'column', gap } : null), ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Dashed placeholder shown before an analysis has been run. */
export const EmptyCard = ({ children }) => <div className="card card--dashed">{children}</div>;

export const MonoLabel = ({ children, style }) => (
  <span className="mono-label" style={style}>
    {children}
  </span>
);

export const Notice = ({ children }) => <div className="notice">{children}</div>;

/** A small coloured badge. `tone` is a [background, foreground] pair from lib/theme `pill`. */
export function Pill({ tone = pill.gray, small, children, style }) {
  return (
    <span className={cx('pill', small && 'pill--sm')} style={{ background: tone[0], color: tone[1], ...style }}>
      {children}
    </span>
  );
}

/** Wrapping row of tags, e.g. matched / missing keywords. */
export function Tags({ items, tone }) {
  return (
    <Row gap={6} wrap>
      {items.map((t) => (
        <Pill key={t} tone={tone}>
          {t}
        </Pill>
      ))}
    </Row>
  );
}

// ───────────────────────── controls

export function Button({ variant = 'primary', size, className, type = 'button', ...props }) {
  return <button type={type} className={cx('btn', `btn--${variant}`, size && `btn--${size}`, className)} {...props} />;
}

export function LinkButton({ className, type = 'button', ...props }) {
  return <button type={type} className={cx('linkbtn', className)} {...props} />;
}

/** Label + control wrapper. */
export function Field({ label, small, className, style, children }) {
  return (
    <label className={cx('field', small && 'field--sm', className)} style={style}>
      {label}
      {children}
    </label>
  );
}

export const Input = ({ small, className, ...props }) => <input className={cx('input', small && 'input--sm', className)} {...props} />;
export const Select = ({ small, className, ...props }) => <select className={cx('select', small && 'select--sm', className)} {...props} />;
export const TextArea = ({ doc, mono, className, ...props }) => (
  <textarea className={cx('textarea', doc && 'textarea--doc', mono && 'textarea--mono', className)} {...props} />
);

/** Segmented tab control. `items`: [{ key, label, badge }]. */
export function Segmented({ items, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.key} type="button" className="seg__btn" aria-pressed={value === it.key} onClick={() => onChange(it.key)}>
          {it.label}
          {it.badge != null && <span className="mono" style={{ fontSize: 11.5, color: '#8b93a1' }}>{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Toggle pill used for filters. */
export function Chip({ active, count, children, ...props }) {
  return (
    <button type="button" className="chip" aria-pressed={active} {...props}>
      {children}
      {count != null && <span className="mono" style={{ opacity: 0.7 }}>{count}</span>}
    </button>
  );
}

/** A bullet list row: coloured glyph + text. */
export function Bullet({ glyph, color, children, gap = 9, style }) {
  return (
    <div style={{ fontSize: 13.5, display: 'flex', gap, lineHeight: 1.45, ...style }}>
      <span style={{ color, fontWeight: 700 }}>{glyph}</span>
      <span>{children}</span>
    </div>
  );
}

/** Horizontal progress bar. */
export function Bar({ value, color = 'var(--acc)', height = 6, track = '#eef0f3' }) {
  return (
    <div style={{ height, borderRadius: 9, background: track }}>
      <div style={{ height, borderRadius: 9, background: color, width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
