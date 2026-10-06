import { ACCENTS, AI_TONES, SIDEBARS } from '@waypoint/shared';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isNavActive, NAV } from '../lib/nav.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const initialsOf = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { ws, merge, flush } = useWorkspace();
  const { user, logout } = useAuth();
  const { profile, prefs } = ws;
  const displayName = profile.name || user.name;
  const [open, setOpen] = useState(false); // only matters on narrow screens, where the menu collapses

  const go = (route) => {
    setOpen(false);
    navigate(route);
  };
  const signOut = async () => {
    try {
      await flush(); // don't lose the last edits
    } catch {
      /* they can't be saved right now; signing out is still what was asked for */
    }
    navigate('/', { replace: true }); // leave the protected area first, or its guard would bounce us to /login?next=…
    await logout();
  };
  const setPref = (key) => (e) => merge('prefs', { [key]: e.target.value });

  return (
    <aside className={open ? 'side side--open' : 'side'}>
      <div className="side__inner">
        <div className="side__top">
          <button className="side__brand" onClick={() => navigate('/')} aria-label="Waypoint home">
            <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--acc)', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
            </div>
            <span style={{ fontWeight: 650, fontSize: 16, color: 'var(--side-strong)', letterSpacing: '-.02em' }}>Waypoint</span>
          </button>
          <button className="side__toggle" aria-expanded={open} aria-controls="side-menu" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>

        <div id="side-menu" className="side__menu">
          <nav aria-label="Modules" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {NAV.map(([label, items]) => (
              <div className="side__group" key={label}>
                <div className="side__label">{label}</div>
                {items.map(([text, route]) => (
                  <button
                    key={route}
                    className="side__link"
                    aria-current={isNavActive(route, pathname) ? 'page' : undefined}
                    onClick={() => go(route)}
                  >
                    <span className="side__dot" />
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <details className="side__prefs">
              <summary>Preferences</summary>
              <label>
                Accent
                <select value={prefs.accent} onChange={setPref('accent')}>
                  {ACCENTS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label>
                Sidebar
                <select value={prefs.sidebar} onChange={setPref('sidebar')}>
                  {SIDEBARS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label>
                AI tone
                <select value={prefs.aiTone} onChange={setPref('aiTone')}>
                  {AI_TONES.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
            </details>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: 'var(--side-card)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--acc)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 12, flex: 'none' }}>
                {initialsOf(displayName)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--side-strong)', ...ellipsis }}>{displayName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--side-mute)', ...ellipsis }} title={user.email}>{profile.role || user.email}</div>
              </div>
            </div>
            <button className="side__link side__signout" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    </aside>
  );
}
