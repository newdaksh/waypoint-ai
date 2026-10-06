import { STATUSES } from '@waypoint/shared';
import { useState } from 'react';
import { Button, Card, Chip, Field, Input, Pill, Row, Select, Spacer, Stack } from '../components/ui.jsx';
import { today, versionShort } from '../lib/derive.js';
import { pill, statusTone } from '../lib/theme.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const EMPTY_DRAFT = { company: '', role: '', category: '', match: '', url: '', version: 'master' };
const toScore = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 0; };
const gridCols = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 16, alignItems: 'start' };

export default function Tracker() {
  const { ws, save } = useWorkspace();
  const tasks = useTasks();
  const [filter, setFilter] = useState('All');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [selId, setSelId] = useState(ws.apps[0]?.id ?? null);
  const [noteDraft, setNoteDraft] = useState('');

  const setDraftField = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const sel = ws.apps.find((a) => a.id === selId) || null;

  const counts = {};
  ws.apps.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
  const filters = ['All', ...STATUSES.filter((s) => counts[s])];
  const rows = ws.apps.filter((a) => filter === 'All' || a.status === filter);

  // Any change to the application list marks it as the user's own data.
  const saveApps = (apps) => save({ set: { apps }, merge: { src: { apps: 'live' } } });
  const update = (patch) =>
    saveApps(ws.apps.map((a) => (a.id === selId ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a)));
  const field = (k) => (e) => update({ [k]: e.target.value });

  const saveDraft = () => {
    if (!draft.company.trim() || !draft.role.trim()) return tasks.fail('Company and role are required.');
    const id = `a${Date.now()}`;
    const date = today();
    saveApps([
      {
        id, company: draft.company.trim(), role: draft.role.trim(), category: draft.category.trim() || 'Other', version: draft.version,
        match: toScore(draft.match), url: draft.url, recruiter: '', salary: '', interview: '', status: 'Applied', applied: date,
        events: [{ status: 'Applied', date }], notes: [],
      },
      ...ws.apps,
    ]);
    setSelId(id);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  };

  const onStatus = (e) => {
    const status = e.target.value;
    const date = today();
    update((a) => ({ status, applied: a.applied || (status === 'Applied' ? date : ''), events: [...a.events, { status, date }] }));
  };

  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    update((a) => ({ notes: [...a.notes, { date: today(), text }] }));
    setNoteDraft('');
  };

  const remove = () => {
    if (!window.confirm(`Delete the ${sel.company} application? This can't be undone.`)) return;
    const apps = ws.apps.filter((a) => a.id !== selId);
    saveApps(apps);
    setSelId(apps[0]?.id ?? null);
  };

  return (
    <Stack gap={16}>
      <Row gap={6} wrap>
        {filters.map((f) => (
          <Chip key={f} active={filter === f} count={f === 'All' ? ws.apps.length : counts[f]} onClick={() => setFilter(f)}>{f}</Chip>
        ))}
        <Spacer />
        <Button onClick={() => setAdding((v) => !v)}>Add application</Button>
      </Row>

      {adding && (
        <Card accent pad={20} gap={12}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <Field label="Company"><Input value={draft.company} onChange={setDraftField('company')} /></Field>
            <Field label="Role"><Input value={draft.role} onChange={setDraftField('role')} /></Field>
            <Field label="Category"><Input value={draft.category} onChange={setDraftField('category')} /></Field>
            <Field label="Match score"><Input inputMode="numeric" value={draft.match} onChange={setDraftField('match')} /></Field>
            <Field label="Resume version">
              <Select value={draft.version} onChange={setDraftField('version')}>
                {ws.versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Field>
            <Field label="Job URL"><Input value={draft.url} onChange={setDraftField('url')} /></Field>
          </div>
          <Row gap={8}>
            <Button onClick={saveDraft}>Save as Applied</Button>
            <Button variant="outline" onClick={() => setAdding(false)} style={{ fontWeight: 400 }}>Cancel</Button>
          </Row>
        </Card>
      )}

      <div style={gridCols}>
        <Card pad={0} className="table-wrap">
          <table className="tbl" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ background: '#f7f8fa' }}>
                <th>Company · role</th><th>Status</th><th style={{ textAlign: 'right' }}>Match</th><th>Resume</th><th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td colSpan={5} style={{ color: '#8b93a1', padding: '28px 12px', textAlign: 'center' }}>
                    {ws.apps.length ? `No applications with status “${filter}”.` : 'No applications yet. Choose “Add application” to log your first one.'}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  aria-selected={r.id === selId}
                  onClick={() => setSelId(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(r.id); } }}
                  style={{ borderTop: '1px solid #f1f2f5', cursor: 'pointer', background: r.id === selId ? '#fafbff' : '#fff' }}
                >
                  <td><div style={{ fontWeight: 600 }}>{r.company}</div><div style={{ fontSize: 12.5, color: '#5b6472' }}>{r.role}</div></td>
                  <td><Pill tone={statusTone[r.status] || pill.gray}>{r.status}</Pill></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.match}%</td>
                  <td style={{ color: '#5b6472', fontSize: 12.5 }}>{versionShort(ws, r.version)}</td>
                  <td className="mono" style={{ color: '#5b6472', fontSize: 12.5 }}>{r.applied || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {sel && (
          <Card pad={20} gap={14} style={{ position: 'sticky', top: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 620, letterSpacing: '-.02em' }}>{sel.company}</div>
              <div style={{ fontSize: 13.5, color: '#5b6472' }}>{sel.role}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
              <Field small label="Status">
                <Select small value={sel.status} onChange={onStatus}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
              </Field>
              <Field small label="Resume version">
                <Select small value={sel.version} onChange={field('version')}>
                  {!ws.versions.some((v) => v.id === sel.version) && <option value={sel.version}>—</option>}
                  {ws.versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <Field small label="Recruiter"><Input small value={sel.recruiter} onChange={field('recruiter')} /></Field>
              <Field small label="Salary"><Input small value={sel.salary} onChange={field('salary')} /></Field>
              <Field small label="Interview date"><Input small type="date" value={sel.interview} onChange={field('interview')} /></Field>
              <Field small label="Job URL"><Input small value={sel.url} onChange={field('url')} /></Field>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3c4452', marginBottom: 8 }}>Timeline</div>
              {sel.events.map((ev, i) => (
                <Row key={i} gap={10} style={{ fontSize: 13, padding: '4px 0' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acc)', flex: 'none' }} />
                  <span style={{ fontWeight: 500 }}>{ev.status}</span>
                  <span className="mono" style={{ marginLeft: 'auto', color: '#8b93a1', fontSize: 12 }}>{ev.date}</span>
                </Row>
              ))}
            </div>
            <Stack gap={8}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3c4452' }}>Notes</div>
              {sel.notes.map((nt, i) => (
                <div key={i} style={{ background: '#f7f8fa', borderRadius: 8, padding: '8px 10px', fontSize: 13, lineHeight: 1.45 }}>
                  <div className="mono" style={{ fontSize: 11.5, color: '#8b93a1' }}>{nt.date}</div>
                  {nt.text}
                </div>
              ))}
              <Row gap={6}>
                <Input
                  small
                  style={{ flex: 1 }}
                  placeholder="Add a note"
                  aria-label="Add a note"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
                />
                <Button variant="dark" size="sm" onClick={addNote} style={{ height: 34, borderRadius: 8, fontSize: 13, fontWeight: 400 }}>Add</Button>
              </Row>
            </Stack>
            <button className="ghostbtn" style={{ color: '#a8322a', alignSelf: 'flex-start', padding: 0 }} onClick={remove}>Delete application</button>
          </Card>
        )}
      </div>
    </Stack>
  );
}
