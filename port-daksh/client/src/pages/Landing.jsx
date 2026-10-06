import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui.jsx';
import { useAuth } from '../state/AuthContext.jsx';

const FONT_MONO = "'Geist Mono', monospace";
const eyebrow = (color) => ({ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color, marginBottom: 12 });
const wrap = { maxWidth: 1200, margin: '0 auto' };
const h2 = (size) => ({ fontSize: size, letterSpacing: size >= 40 ? '-.035em' : '-.03em', fontWeight: 620, margin: 0 });
const bodyP = { fontSize: 15.5, lineHeight: 1.6, margin: 0 };

const ENGINES = [
  { letter: 'A', color: 'var(--acc)', name: 'Resume Intelligence', modules: ['Resume–Job Match Score', 'AI Resume Tailoring', 'Bullet Optimizer', 'Red-Flag Detector', 'ATS Compatibility', 'Skill-Proof Generator'] },
  { letter: 'B', color: '#7048e8', name: 'Job Intelligence', modules: ['Job Description Decoder', 'Application Priority Engine', 'Scam Risk Detector'] },
  { letter: 'C', color: '#12805c', name: 'Skill Intelligence', modules: ['Skill Gap Detector', 'Personalized Learning Roadmap'] },
  { letter: 'D', color: '#b7791f', name: 'Interview Intelligence', modules: ['JD-Based Interview Predictor', 'Resume–Interview Consistency'] },
  { letter: 'E', color: '#d1453b', name: 'Career Intelligence', modules: ['Application Analytics & Resume Versions', 'Job Readiness & Career Score'] },
];

const WORKFLOW = ['Resume', 'Analyze', 'Match', 'Close gaps', 'Practice', 'Apply'];

const STEPS = [
  ['01', 'Create your profile', 'Target role, experience, skills and goals.'],
  ['02', 'Upload your resume', 'Get a health check, red flags and ATS readiness.'],
  ['03', 'Add target jobs', 'Decode each one, see the gaps and get a priority.'],
  ['04', 'Act and track', "Learn, practice, apply, and see what's working."],
];

const TRUST = [
  ['Transparent scores', 'Estimates with a visible formula, not verdicts on employability.'],
  ['Risk, not verdicts', 'Job safety shows the signals it found. It never declares a scam.'],
  ['Minimal data sharing', 'Each AI task receives only the data it needs.'],
  ['No guarantees', "We don't promise interviews, jobs or ATS results."],
];

const FAQ = [
  ['Will this get me interviews?', "No tool can guarantee that. Waypoint shows where your resume and a job line up, where they don't, and what to work on first."],
  ['Is the ATS score what real systems see?', "It's an AI approximation of common ATS checks: parsing, section structure and keyword coverage. Real systems vary by employer."],
  ["Can the AI add skills I don't have?", 'No. Tailoring only reorders and rewrites what you provided. Missing requirements are listed separately so you can decide what to learn.'],
  ['Which file types can I upload?', 'PDF, DOCX and TXT. You can also paste plain text.'],
];

const READINESS_BARS = [
  ['Resume', 66, 'var(--acc)'],
  ['ATS', 72, 'var(--acc)'],
  ['Skill match', 64, 'var(--acc)'],
  ['Job fit', 80, '#12805c'],
];

function Logo({ size = 26, dot = 9, radius = 8 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: 'var(--acc)', display: 'grid', placeItems: 'center' }}>
      <div style={{ width: dot, height: dot, borderRadius: '50%', background: '#fff' }} />
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const authed = status === 'authed';
  // Signed-in visitors go straight to the app; everyone else starts by creating an account.
  const start = () => navigate(authed ? '/app/dashboard' : '/signup');

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', color: '#0f1218' }}>
      {/* Top bar */}
      <header style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(247,248,250,.86)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #e8eaee' }}>
        <div className="l-pad" style={{ ...wrap, padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
            <Logo />
            <span style={{ fontWeight: 650, fontSize: 17, letterSpacing: '-.02em' }}>Waypoint</span>
          </div>
          <nav className="l-nav-links" style={{ display: 'flex', gap: 28 }}>
            {[['#engines', 'Features'], ['#how', 'How it works'], ['#trust', 'Trust'], ['#faq', 'FAQ']].map(([href, label]) => (
              <a key={href} href={href} style={{ color: '#3c4452', fontSize: 14 }}>{label}</a>
            ))}
          </nav>
          <div style={{ display: 'flex', gap: 8 }}>
            {authed ? (
              <Button variant="dark" onClick={start}>Open app</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => navigate('/login')}>Log in</Button>
                <Button variant="dark" onClick={() => navigate('/signup')}>Sign up</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="l-hero l-pad" style={{ ...wrap, padding: '84px 32px 72px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 6px', borderRadius: 99, background: '#fff', border: '1px solid #e3e6eb', fontSize: 13, color: '#3c4452' }}>
            <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--acc-t)', color: 'var(--acc-i)', fontWeight: 600, fontSize: 12 }}>New</span>
            15 career tools in one workspace
          </div>
          <h1 className="l-h1">
            Your AI <span style={{ color: 'var(--acc)' }}>Career Intelligence</span> Platform
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.55, maxWidth: 540, margin: 0, color: '#4a5260', textWrap: 'pretty' }}>
            Understand your resume. Analyze every opportunity. Close your skill gaps. Prepare for interviews. Make smarter career decisions.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button size="lg" onClick={start}>Analyze My Career</Button>
            <a
              href="#engines"
              style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 22px', borderRadius: 11, background: '#fff', border: '1px solid #d8dce3', color: '#0f1218', fontSize: 15.5, fontWeight: 500, textDecoration: 'none' }}
            >
              Explore Features
            </a>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13, color: '#5b6472' }}>
            {['No fabricated experience', 'Every score explained', 'Private by default'].map((t) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#12805c' }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', padding: '20px 0 40px' }}>
          <div style={{ position: 'absolute', inset: '-30px -60px -10px 40px', borderRadius: 40, background: 'radial-gradient(closest-side,#e3e8fc,rgba(227,232,252,0))' }} />
          <div style={{ position: 'relative', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, boxShadow: '0 24px 60px rgba(16,24,40,.12),0 2px 6px rgba(16,24,40,.05)', padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6b7280' }}>Career readiness</span>
              <span style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 99, background: '#f1f3f5', color: '#4a5260' }}>Example preview</span>
            </div>
            <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
              <div style={{ width: 108, height: 108, borderRadius: '50%', background: 'conic-gradient(var(--acc) 245deg,#eceef2 0deg)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                <div style={{ width: 86, height: 86, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', fontSize: 34, fontWeight: 650, letterSpacing: '-.03em' }}>68</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {READINESS_BARS.map(([label, value, color]) => (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 26px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                    <span style={{ color: '#5b6472' }}>{label}</span>
                    <div style={{ height: 6, borderRadius: 9, background: '#eef0f3' }}>
                      <div style={{ width: `${value}%`, height: 6, borderRadius: 9, background: color }} />
                    </div>
                    <span style={{ fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: '1px solid #eef0f3', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                [1, 'Add measurable outcomes to 4 bullets', 'High impact', '#fdecea', '#a8322a'],
                [2, 'Practice PostgreSQL indexing questions', 'Medium', '#fcf3e1', '#8a5a12'],
              ].map(([n, text, impact, bg, fg]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--acc-t)', color: 'var(--acc-i)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{n}</span>
                  {text}
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, padding: '2px 8px', borderRadius: 99, background: bg, color: fg }}>{impact}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="l-float" style={{ position: 'absolute', left: -36, bottom: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 14px 34px rgba(16,24,40,.12)', padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#e6f5ee', color: '#0b6247', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>82</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Ledgerline · Backend Developer</div>
              <div style={{ fontSize: 12, color: '#0b6247' }}>Apply now</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / approach */}
      <section className="l-two l-pad" style={{ ...wrap, padding: '40px 32px 80px' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 32 }}>
          <div style={eyebrow('#a8322a')}>The problem</div>
          <h2 style={{ ...h2(30), marginBottom: 12, maxWidth: 440 }}>Job searching runs on guesswork.</h2>
          <p style={{ ...bodyP, color: '#4a5260', maxWidth: 480 }}>
            Resume checkers, keyword tools, interview banks and spreadsheets each answer one question in isolation. None of them know what the others found, so you can't tell which job to apply to, what to fix first, or whether you're ready.
          </p>
        </div>
        <div style={{ background: '#0f1218', color: '#fff', borderRadius: 18, padding: 32 }}>
          <div style={eyebrow('#9fb0f5')}>The approach</div>
          <h2 style={{ ...h2(30), marginBottom: 12, maxWidth: 440 }}>One profile, read by every tool.</h2>
          <p style={{ ...bodyP, color: '#c4cad4', maxWidth: 480 }}>
            Waypoint analyzes your resume once and reuses it everywhere: matching against jobs, predicting interview questions, testing your claims, and tracking which resume versions get responses. Every score shows how it was calculated.
          </p>
        </div>
      </section>

      {/* Engines */}
      <section id="engines" style={{ background: '#0f1218', color: '#fff' }}>
        <div className="l-pad" style={{ ...wrap, padding: '88px 32px' }}>
          <div style={eyebrow('#9fb0f5')}>5 intelligence engines · 15 modules</div>
          <h2 style={{ ...h2(40), marginBottom: 40, maxWidth: 640 }}>Everything between your resume and an offer.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {ENGINES.map((e) => (
              <div key={e.name} style={{ background: '#171c25', border: '1px solid #262d3a', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: e.color, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>{e.letter}</div>
                <div style={{ fontWeight: 600, fontSize: 17 }}>{e.name}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.9, color: '#b4bbc7' }}>
                  {e.modules.map((m) => <div key={m}>{m}</div>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 56, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13.5, color: '#c4cad4' }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7d8696', marginRight: 8 }}>Career workflow</span>
            {WORKFLOW.map((w) => (
              <span key={w} style={{ display: 'contents' }}>
                <span style={{ padding: '7px 14px', borderRadius: 99, border: '1px solid #2c3442' }}>{w}</span>
                <span style={{ color: '#5b6472' }}>→</span>
              </span>
            ))}
            <span style={{ padding: '7px 14px', borderRadius: 99, background: 'var(--acc)', color: '#fff' }}>Track</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="l-pad" style={{ ...wrap, padding: '88px 32px' }}>
        <div style={eyebrow('var(--acc)')}>How it works</div>
        <h2 style={{ ...h2(40), marginBottom: 40 }}>Four steps to a clear plan.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {STEPS.map(([n, title, text]) => (
            <div key={n} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--acc)' }}>{n}</div>
              <div style={{ fontWeight: 600, fontSize: 17 }}>{title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: '#5b6472' }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="l-trust l-pad" style={{ ...wrap, padding: '0 32px 88px' }}>
        <div>
          <div style={eyebrow('#12805c')}>Trust &amp; integrity</div>
          <h2 style={{ ...h2(40), marginBottom: 14 }}>Suggestions, never fabrications.</h2>
          <p style={{ ...bodyP, color: '#4a5260', maxWidth: 460 }}>
            The AI only reorganizes and clarifies what's already in your resume. It won't invent employers, metrics or certifications. Where a number would help, it tells you where to add a real one.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {TRUST.map(([title, text]) => (
            <div key={title} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 22 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 14, color: '#5b6472', lineHeight: 1.55 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="l-pad" style={{ maxWidth: 820, margin: '0 auto', padding: '0 32px 88px' }}>
        <h2 style={{ ...h2(32), marginBottom: 20 }}>Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #e5e7eb' }}>
          {FAQ.map(([q, a]) => (
            <details key={q} style={{ borderBottom: '1px solid #e5e7eb', padding: '18px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16, listStyle: 'none' }}>{q}</summary>
              <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.6, color: '#4a5260' }}>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA + footer */}
      <section className="l-pad" style={{ ...wrap, padding: '0 32px 64px' }}>
        <div style={{ background: 'var(--acc)', color: '#fff', borderRadius: 22, padding: 56, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ ...h2(36), maxWidth: 560 }}>See where you stand for your next role.</h2>
          <Button variant="white" size="lg" onClick={start}>Analyze My Career</Button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '28px 4px 0', fontSize: 13, color: '#8b93a1' }}>
          <span>© 2026 Waypoint</span>
          <span>AI scores are estimates based on the information you provide.</span>
        </div>
      </section>
    </div>
  );
}
