import { removeJobPatch } from '@waypoint/shared';
import { useState } from 'react';
import { useTasks } from '../state/TaskContext.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';
import { Button, Card, Field, Input, Row, TextArea } from './ui.jsx';

const EMPTY_DRAFT = { title: '', company: '', location: '', text: '' };

/** Title, company, location and description of a job. Calls `onChange(key, value)`. */
export function JobFields({ job, onChange, minHeight = 180 }) {
  const field = (key) => (e) => onChange(key, e.target.value);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <Field label="Job title"><Input value={job.title} onChange={field('title')} placeholder="e.g. Backend Developer" /></Field>
        <Field label="Company"><Input value={job.company} onChange={field('company')} placeholder="e.g. Acme" /></Field>
        <Field label="Location"><Input value={job.location || ''} onChange={field('location')} /></Field>
      </div>
      <Field label="Job description">
        <TextArea style={{ minHeight, fontSize: 13.5, lineHeight: 1.55 }} placeholder="Paste the full job description here" value={job.text} onChange={field('text')} />
      </Field>
    </>
  );
}

/** Card for adding a job. `activate` makes it the target even when there already is one. `onDone` closes the card. */
export function AddJobCard({ activate = false, onDone }) {
  const { ws, set } = useWorkspace();
  const tasks = useTasks();
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const saveJob = () => {
    if (!draft.title.trim() || draft.text.trim().length < 100) {
      return tasks.fail('Add a title and the full job description (at least a few lines).');
    }
    const id = `j${Date.now()}`;
    set({
      jobs: [...ws.jobs, { id, title: draft.title.trim(), company: draft.company.trim() || 'Unknown company', location: draft.location.trim(), category: 'Other', text: draft.text }],
      ...(activate || !ws.jobs.length ? { activeJobId: id } : null), // the first job becomes the target
    });
    return onDone();
  };

  return (
    <Card accent pad={20} gap={12}>
      <JobFields job={draft} onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))} />
      <Row gap={8}>
        <Button onClick={saveJob}>Save job</Button>
        <Button variant="outline" onClick={onDone} style={{ fontWeight: 400 }}>Cancel</Button>
      </Row>
    </Card>
  );
}

/** Change or delete a saved job in place (autosaved, like every other edit). */
export function useJobEditing() {
  const { ws, set, save } = useWorkspace();
  return {
    update: (id, key, value) => set({ jobs: ws.jobs.map((j) => (j.id === id ? { ...j, [key]: value } : j)) }),
    /** Asks first; resolves to whether the job was deleted. */
    remove: (job) => {
      if (!window.confirm(`Delete "${job.title}" and everything analyzed for it? This can't be undone.`)) return false;
      save(removeJobPatch(ws, job.id));
      return true;
    },
  };
}
