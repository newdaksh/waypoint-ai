import { PRIORITY_FORMULA, priorityOf } from '@waypoint/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyCard, Field, Input, LinkButton, Pill, Row, Stack, TextArea } from '../components/ui.jsx';
import { activeJobOf } from '../lib/derive.js';
import { pill } from '../lib/theme.js';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

const PRIORITY_TONE = { 'Apply now': pill.green, 'Tailor, then apply': pill.blue, 'Upskill first': pill.amber, 'Low priority': pill.gray };
const EFFORT_RANK = { Low: 1, Medium: 2, High: 3 };
// [sort key, header label, alignment]. "Priority" sorts by the same score as "Score".
const COLUMNS = [['title', 'Job', 'left'], ['resume', 'Resume', 'right'], ['skill', 'Skill', 'right'], ['experience', 'Exp.', 'right'], ['goal', 'Goal', 'right'], ['effort', 'Effort', 'left'], ['score', 'Score', 'right'], ['score', 'Priority', 'left']];
const EMPTY_DRAFT = { title: '', company: '', location: '', text: '' };
const num = { padding: '14px 12px', textAlign: 'right' };

export default function SavedJobs() {
  const { ws, set } = useWorkspace();
  const tasks = useTasks();
  const activeId = activeJobOf(ws)?.id;
  const [sort, setSort] = useState({ key: 'score', dir: -1 });
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(params.get('add') === '1'); // other pages link here to add the first job
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const setField = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const valueOf = ({ job, p, pr }) =>
    sort.key === 'title' ? job.title : sort.key === 'effort' ? (p ? EFFORT_RANK[p.effort] : 9) : sort.key === 'score' ? (pr ? pr.score : -1) : p ? p[sort.key] : -1;
  const rows = ws.jobs
    .map((job) => ({ job, p: ws.priorityBy[job.id], pr: priorityOf(ws.priorityBy[job.id]) }))
    .sort((x, y) => {
      const A = valueOf(x), B = valueOf(y);
      return (A > B ? 1 : A < B ? -1 : 0) * sort.dir;
    });

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));

  const scoreAll = () =>
    tasks.ai(`Scoring ${ws.jobs.length} saved jobs…`, ['Reading each job', 'Comparing with your resume', 'Weighing your career goals'], 'priority');

  const saveJob = () => {
    if (!draft.title.trim() || draft.text.trim().length < 100) {
      return tasks.fail('Add a title and the full job description (at least a few lines).');
    }
    const id = `j${Date.now()}`;
    set({
      jobs: [...ws.jobs, { id, title: draft.title.trim(), company: draft.company.trim() || 'Unknown company', location: draft.location.trim(), category: 'Other', text: draft.text }],
      ...(activeId ? null : { activeJobId: id }), // the first job becomes the target
    });
    setDraft(EMPTY_DRAFT);
    setAdding(false);
  };

  return (
    <Stack gap={16}>
      <Row gap={10} wrap>
        <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 260 }}>{PRIORITY_FORMULA}</span>
        <Button variant="outline" onClick={() => setAdding((v) => !v)}>Add job</Button>
        <Button onClick={scoreAll} disabled={!ws.jobs.length}>Score all jobs</Button>
      </Row>

      {adding && (
        <Card accent pad={20} gap={12}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <Field label="Job title"><Input value={draft.title} onChange={setField('title')} /></Field>
            <Field label="Company"><Input value={draft.company} onChange={setField('company')} /></Field>
            <Field label="Location"><Input value={draft.location} onChange={setField('location')} /></Field>
          </div>
          <Field label="Job description">
            <TextArea style={{ minHeight: 180, fontSize: 13.5, lineHeight: 1.55 }} value={draft.text} onChange={setField('text')} />
          </Field>
          <Row gap={8}>
            <Button onClick={saveJob}>Save job</Button>
            <Button variant="outline" onClick={() => setAdding(false)} style={{ fontWeight: 400 }}>Cancel</Button>
          </Row>
        </Card>
      )}

      {!ws.jobs.length && !adding && (
        <EmptyCard>
          <Stack gap={12} align="flex-start">
            <span>No saved jobs yet. Add the roles you're considering and Waypoint will rank them for you.</span>
            <Button onClick={() => setAdding(true)}>Add your first job</Button>
          </Stack>
        </EmptyCard>
      )}

      {ws.jobs.length > 0 && (
      <Card pad={0} className="table-wrap">
        <table className="tbl" style={{ minWidth: 880 }}>
          <thead>
            <tr style={{ background: '#f7f8fa' }}>
              {COLUMNS.map(([key, label, align], i) => (
                <th key={label} style={{ textAlign: align }} aria-sort={sort.key === key && i !== 7 ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
                  <button
                    onClick={() => sortBy(key)}
                    style={{ all: 'unset', cursor: 'pointer', color: sort.key === key ? '#0f1218' : '#6b7280' }}
                  >
                    {label + (sort.key === key && i !== 7 ? (sort.dir > 0 ? ' ↑' : ' ↓') : '')}
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ job, p, pr }) => {
              const tone = pr ? PRIORITY_TONE[pr.label] : pill.gray;
              const isActive = job.id === activeId;
              return (
                <tr key={job.id} style={{ borderTop: '1px solid #f1f2f5', background: isActive ? '#fafbff' : '#fff' }}>
                  <td style={{ padding: '14px 12px', maxWidth: 340 }}>
                    <div style={{ fontWeight: 600 }}>{job.title}</div>
                    <div style={{ fontSize: 12.5, color: '#5b6472' }}>{job.company} · {job.location || '—'}</div>
                    <div style={{ fontSize: 12.5, color: '#5b6472', marginTop: 6, lineHeight: 1.45 }}>{p ? p.reason : 'Not scored yet. Use "Score all jobs".'}</div>
                  </td>
                  {['resume', 'skill', 'experience', 'goal'].map((k) => (
                    <td key={k} className="mono" style={num}>{p ? p[k] : '—'}</td>
                  ))}
                  <td style={{ padding: '14px 12px' }}>{p ? p.effort : '—'}</td>
                  <td style={{ ...num, fontWeight: 650, fontSize: 15, fontFamily: 'inherit' }}>{pr ? pr.score : '—'}</td>
                  <td style={{ padding: '14px 12px' }}><Pill tone={tone}>{pr ? pr.label : 'Unscored'}</Pill></td>
                  <td style={{ padding: '14px 12px', whiteSpace: 'nowrap' }}>
                    <LinkButton onClick={() => set({ activeJobId: job.id })} style={{ fontSize: 12.5 }}>
                      {isActive ? 'Active target' : 'Set as target'}
                    </LinkButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      )}
    </Stack>
  );
}
