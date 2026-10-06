import { Link } from 'react-router-dom';
import { CheckIcon, ShieldIcon } from '../icons.jsx';

function Logo({ size = 28 }) {
  return (
    <span className="auth-logo" style={{ width: size, height: size }} aria-hidden="true">
      <i />
    </span>
  );
}

// One continuous path through five waypoints (each node sits exactly on a segment end).
const ROUTE = 'M 30 220 C 90 220, 110 150, 175 150 S 255 205, 320 175 S 400 85, 470 85 S 515 62, 535 48';
const NODES = [
  { x: 30, y: 220, label: 'Resume', dy: 34 },
  { x: 175, y: 150, label: 'Match', dy: -30 },
  { x: 320, y: 175, label: 'Close gaps', dy: 34 },
  { x: 470, y: 85, label: 'Practice', dy: -30 },
  { x: 535, y: 48, label: 'Offer', dy: -30, dx: -20 },
];

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The animated career route: a path that draws itself, lighting up each waypoint in turn. */
function RouteMap() {
  return (
    <div className="route-wrap">
      <svg className="route" viewBox="0 0 580 270" role="presentation">
        <defs>
          <linearGradient id="wp-route-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8da2fb" />
            <stop offset=".55" stopColor="#c4b5fd" />
            <stop offset="1" stopColor="#7dd3fc" />
          </linearGradient>
          <filter id="wp-route-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={ROUTE} className="route__base" />
        <path d={ROUTE} className="route__draw" pathLength="100" stroke="url(#wp-route-grad)" filter="url(#wp-route-glow)" />
        {NODES.map((n, i) => {
          const w = n.label.length * 7.4 + 26;
          const delay = `${0.55 + i * 0.5}s`;
          return (
            <g key={n.label} transform={`translate(${n.x} ${n.y})`} style={{ '--d': delay }}>
              <g className="route__node">
                <circle r="14" className="route__halo" />
                <circle r="6.5" fill="#fff" />
              </g>
              {/* position and animation live on different elements: a CSS transform would override the attribute */}
              <g transform={`translate(${n.dx || 0} ${n.dy})`}>
                <g className="route__label">
                  <rect x={-w / 2} y="-13" width={w} height="26" rx="13" />
                  <text y="4.5" textAnchor="middle">{n.label}</text>
                </g>
              </g>
            </g>
          );
        })}
        {!prefersReducedMotion() && (
          <circle r="4.5" fill="#fff" filter="url(#wp-route-glow)">
            <animateMotion dur="7s" begin="2.8s" repeatCount="indefinite" path={ROUTE} />
          </circle>
        )}
      </svg>

      <div className="fcard fcard--a">
        <div className="ring"><span>72</span></div>
        <div>
          <b>Career readiness</b>
          <small>Every score shows its formula</small>
        </div>
      </div>
      <div className="fcard fcard--b">
        <small>Skill gaps closed</small>
        <div className="mini"><i /></div>
      </div>
      <div className="chip-float">
        <CheckIcon width={14} height={14} strokeWidth={3} /> ATS-ready
      </div>
    </div>
  );
}

/**
 * The frame shared by login, sign-up and password pages: a branded story panel on the left, the form on
 * the right. On phones the story collapses to a slim brand header.
 */
export default function AuthShell({ children, switcher }) {
  return (
    <div className="auth">
      <aside className="auth-art">
        <Link to="/" className="auth-brand">
          <Logo />
          <span>Waypoint</span>
        </Link>

        <div className="auth-art__body" aria-hidden="true">
          <p className="auth-eyebrow">AI career intelligence</p>
          <h2 className="auth-headline">
            Know exactly <em>where you stand</em> — and what to do next.
          </h2>
          <p className="auth-lede">Waypoint reads your resume once, then uses it everywhere: matching jobs, closing skill gaps, preparing interviews and tracking what works.</p>
          <RouteMap />
        </div>

        <ul className="auth-trust">
          {['No fabricated experience', 'Every score explained', 'Private by default'].map((t) => (
            <li key={t}>
              <ShieldIcon width={16} height={16} /> {t}
            </li>
          ))}
        </ul>
      </aside>

      <main className="auth-main">
        <header className="auth-top">
          <span />
          <div className="auth-switch">{switcher}</div>
        </header>
        <div className="auth-card-wrap">
          <div className="auth-card">{children}</div>
        </div>
        <footer className="auth-foot">© 2026 Waypoint · AI scores are estimates based on the information you provide.</footer>
      </main>
    </div>
  );
}
