import { useNavigate } from 'react-router-dom';
import { Button } from './ui.jsx';

/** Shown by tools that compare the resume with a job when the user hasn't saved any job yet. */
export default function NoJob({ tool = 'This tool' }) {
  const navigate = useNavigate();
  return (
    <div className="card card--dashed" style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>Add a target job first</div>
      <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 520, lineHeight: 1.55 }}>
        {tool} compares your resume with a specific job. Paste a job description to get started — you can add more jobs any time.
      </div>
      <Button onClick={() => navigate('/app/jobs?add=1')}>Add a job</Button>
    </div>
  );
}
