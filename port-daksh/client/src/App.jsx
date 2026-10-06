import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import { GuestOnly, RequireAuth } from './components/auth/guards.jsx';
import { Button } from './components/ui.jsx';
import { applyTheme } from './lib/theme.js';
import Analytics from './pages/Analytics.jsx';
import Assistant from './pages/Assistant.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import Login from './pages/auth/Login.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import Signup from './pages/auth/Signup.jsx';
import BulletOptimizer from './pages/BulletOptimizer.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Interview from './pages/Interview.jsx';
import JobDecoder from './pages/JobDecoder.jsx';
import JobSafety from './pages/JobSafety.jsx';
import Landing from './pages/Landing.jsx';
import Onboarding from './pages/Onboarding.jsx';
import ResumeAnalyzer from './pages/ResumeAnalyzer.jsx';
import ResumeTailor from './pages/ResumeTailor.jsx';
import Roadmap from './pages/Roadmap.jsx';
import SavedJobs from './pages/SavedJobs.jsx';
import SkillGap from './pages/SkillGap.jsx';
import SkillProof from './pages/SkillProof.jsx';
import Tracker from './pages/Tracker.jsx';
import { TaskProvider } from './state/TaskContext.jsx';
import { useWorkspace } from './state/WorkspaceContext.jsx';

/** Loads the workspace before showing the app; offers a retry if the server is unreachable. */
function Gate({ children }) {
  const { ws, loadError, reload } = useWorkspace();
  if (loadError) {
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" style={{ padding: 28, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>Couldn't load your workspace</div>
          <div style={{ fontSize: 14, color: '#5b6472' }}>{loadError.message}</div>
          <div><Button onClick={reload}>Try again</Button></div>
        </div>
      </div>
    );
  }
  if (!ws) {
    return <div role="status" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#8b93a1', fontSize: 14 }}>Loading your workspace…</div>;
  }
  return children;
}

export default function App() {
  const { ws } = useWorkspace();
  useEffect(() => {
    applyTheme(ws?.prefs);
  }, [ws?.prefs]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <Gate>
              <TaskProvider>
                <AppLayout />
              </TaskProvider>
            </Gate>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="onboarding" element={<Navigate to="profile" replace />} />
        <Route path="onboarding/:step" element={<Onboarding />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="resume" element={<Navigate to="health" replace />} />
        <Route path="resume/:tab" element={<ResumeAnalyzer />} />
        <Route path="tailor" element={<ResumeTailor />} />
        <Route path="bullets" element={<BulletOptimizer />} />
        <Route path="proof" element={<SkillProof />} />
        <Route path="jobs" element={<SavedJobs />} />
        <Route path="decoder" element={<JobDecoder />} />
        <Route path="safety" element={<JobSafety />} />
        <Route path="gap" element={<SkillGap />} />
        <Route path="roadmap" element={<Roadmap />} />
        <Route path="interview" element={<Navigate to="practice" replace />} />
        <Route path="interview/:tab" element={<Interview />} />
        <Route path="tracker" element={<Tracker />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
