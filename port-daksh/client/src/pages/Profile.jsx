import { CAREER_LEVELS } from '@waypoint/shared';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input, Select, TextArea } from '../components/ui.jsx';
import { useWorkspace } from '../state/WorkspaceContext.jsx';

export default function Profile() {
  const navigate = useNavigate();
  const { ws, set } = useWorkspace();
  const { profile } = ws;
  const setProfile = (key) => (e) => set({ profile: { ...profile, [key]: e.target.value } });

  return (
    <Card pad={26} gap={18} style={{ maxWidth: 920 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>Your profile</div>
        <div style={{ fontSize: 13.5, color: '#5b6472' }}>Used as context for every analysis. Only what a task needs is sent to the model.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
        <Field label="Name"><Input value={profile.name} onChange={setProfile('name')} /></Field>
        <Field label="Target role"><Input value={profile.role} onChange={setProfile('role')} /></Field>
        <Field label="Career level">
          <Select value={profile.level} onChange={setProfile('level')}>
            {CAREER_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Years of experience"><Input value={profile.years} onChange={setProfile('years')} /></Field>
        <Field label="Location"><Input value={profile.location} onChange={setProfile('location')} /></Field>
        <Field label="Key skills"><Input value={profile.skills} onChange={setProfile('skills')} /></Field>
      </div>
      <Field label="Career goals">
        <TextArea style={{ minHeight: 80 }} value={profile.goals} onChange={setProfile('goals')} />
      </Field>
      <div><Button size="md" onClick={() => navigate('/app/resumes')}>Continue to resumes</Button></div>
    </Card>
  );
}
