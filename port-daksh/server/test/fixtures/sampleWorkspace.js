// TEST FIXTURE ONLY — realistic sample data used by the automated tests (never shipped to users).
// New accounts start with an empty workspace; see src/domain/workspace.js.
import { DEFAULT_PREFS } from '@waypoint/shared';

const RESUME = `Aarav Mehta
Pune, India · aarav.mehta@email.com · github.com/aaravm

SUMMARY
Backend developer with 1 year of experience building REST APIs in Python and Django. Passionate team player who loves learning new technologies.

EXPERIENCE
Junior Software Engineer — Kitebyte Solutions, Pune (Jul 2025 – Present)
- Worked on APIs for the order management module using Django REST Framework.
- Responsible for writing unit tests.
- Helped migrate reporting queries from MySQL to PostgreSQL.
- Participated in code reviews and daily standups.

Software Engineering Intern — Kitebyte Solutions, Pune (Jan 2025 – Jun 2025)
- Built an internal admin dashboard with Django templates.
- Fixed bugs reported by QA team.

PROJECTS
Expense Splitter API — FastAPI, PostgreSQL, Docker. REST API for splitting group expenses with JWT auth.
Campus Notice Bot — Python, Telegram Bot API. Posts college notices to a Telegram channel.

EDUCATION
B.E. Computer Engineering — Savitribai Phule Pune University, 2025. CGPA 8.1

SKILLS
Python (Advanced), Django, Django REST Framework, FastAPI, PostgreSQL, MySQL, Git, Docker, Linux, HTML, CSS, Microservices, Kubernetes, Machine Learning

CERTIFICATIONS
Python for Everybody — Coursera (2023)`;

const TAILORED = `Aarav Mehta
Pune, India · aarav.mehta@email.com · github.com/aaravm

SUMMARY
Backend developer with 1 year of production experience building REST APIs in Python with Django REST Framework and PostgreSQL. Looking to build reliable data-heavy services in fintech.

EXPERIENCE
Junior Software Engineer (Backend) — Kitebyte Solutions, Pune (Jul 2025 – Present)
- Built and maintained REST API endpoints for the order management module using Django REST Framework.
- Migrated reporting queries from MySQL to PostgreSQL.
- Wrote unit tests for order management APIs.
- Reviewed teammates' pull requests as part of the team's code review process.

Software Engineering Intern — Kitebyte Solutions, Pune (Jan 2025 – Jun 2025)
- Built an internal admin dashboard with Django templates.

PROJECTS
Expense Splitter API — FastAPI, PostgreSQL, Docker. REST API for splitting group expenses with JWT authentication.
Campus Notice Bot — Python, Telegram Bot API. Posts college notices to a Telegram channel.

SKILLS
Python, Django, Django REST Framework, FastAPI, PostgreSQL, MySQL, REST API design, Git, Docker, Linux

EDUCATION
B.E. Computer Engineering — Savitribai Phule Pune University, 2025. CGPA 8.1

CERTIFICATIONS
Python for Everybody — Coursera (2023)`;

const JOBS = [
  { id: 'j1', title: 'Backend Developer (Python)', company: 'Ledgerline', location: 'Bengaluru · Hybrid', category: 'Backend', text: `Backend Developer (Python) — Ledgerline, Bengaluru (Hybrid)

Ledgerline builds reconciliation software for finance teams at mid-size companies. Our backend matches millions of bank and ledger transactions every day.

What you'll do
- Design and maintain REST APIs for the reconciliation engine
- Write tests and keep coverage healthy
- Find and fix slow PostgreSQL queries
- Join a light on-call rotation after onboarding
- Work closely with product and support on customer issues

Requirements
- 1–3 years building production backend services in Python
- Strong Django or FastAPI experience
- PostgreSQL, including query optimization and indexing
- REST API design: authentication, pagination, versioning
- Testing with pytest
- Git and code review habits

Nice to have
- Celery / Redis for background jobs
- Docker and CI/CD (GitHub Actions)
- AWS
- Payments or fintech exposure` },
  { id: 'j2', title: 'Python Developer', company: 'Pallet Labs', location: 'Remote · India', category: 'Python', text: `Python Developer — Pallet Labs (Remote, India)

Pallet Labs builds warehouse routing software for logistics companies.

Responsibilities
- Build Django services that power our routing and inventory APIs
- Own background jobs with Celery and Redis
- Deploy services on AWS (ECS, RDS)
- Improve observability with structured logging and metrics

Requirements
- 1+ years of Python in production
- Django and Django REST Framework
- Celery and Redis
- PostgreSQL
- Basic AWS

Nice to have
- Docker, Terraform
- Logistics domain experience` },
  { id: 'j3', title: 'Junior Data Scientist', company: 'Quantive', location: 'Pune · On-site', category: 'Data', text: `Junior Data Scientist — Quantive (Pune)

Quantive helps retailers forecast demand.

Requirements
- Degree in CS, statistics or related field
- Strong Python with pandas, NumPy and scikit-learn
- Experience training and evaluating regression and classification models
- SQL for analysis
- Communicating results to non-technical stakeholders

Nice to have
- Time-series forecasting
- Experience with Airflow or dbt` },
  { id: 'j4', title: 'Software Engineer I (Platform)', company: 'Brightdesk', location: 'Hyderabad · Hybrid', category: 'Platform', text: `Software Engineer I, Platform — Brightdesk (Hyderabad)

Brightdesk's platform team runs the infrastructure behind our helpdesk product.

Responsibilities
- Build internal services in Go and Python
- Operate Kubernetes clusters and CI/CD pipelines
- Improve reliability, alerting and incident response

Requirements
- 1–2 years of software engineering experience
- Go or Python
- Kubernetes and Docker in production
- Linux and networking fundamentals
- Terraform or similar infrastructure-as-code

Nice to have
- Prometheus / Grafana
- On-call experience` }
];

/** A fully populated workspace (resume, jobs, results, applications) for tests. */
export function sampleWorkspace() {
  return {
    version: 3,
    profile: { name: 'Aarav Mehta', role: 'Python Backend Developer', level: 'Junior', years: '1', location: 'Pune, India', skills: 'Python, Django, REST APIs, PostgreSQL, Git', goals: 'Move into a backend role at a product company within 3 months, ideally fintech or B2B SaaS.' },
    activeResumeId: 'master',
    madeFrom: {},
    jobs: JOBS.map(j => ({ ...j })),
    activeJobId: 'j1',
    src: { analysis: 'demo', ats: 'demo', questions: 'demo', decoder: 'demo', gap: 'demo', roadmap: 'demo', proof: 'demo', tailor: 'demo', bullets: 'demo', safety: 'demo', priority: 'demo', apps: 'demo' },
    analysisBy: { master: {
      summary: 'A solid foundation for a junior backend role: Python and Django experience is recent and real. Most bullets describe duties rather than results, and several listed skills have no supporting evidence.',
      scores: { overall: 66, ats: 74, skills: 71, content: 58, achievements: 34, proof: 52 },
      strengths: ['Recent production experience with Python, Django and DRF', 'MySQL → PostgreSQL migration maps to common backend requirements', 'Two personal projects on a modern stack (FastAPI, Docker)'],
      redFlags: [
        { severity: 'critical', title: 'Skills listed without any evidence', quote: 'Microservices, Kubernetes, Machine Learning', problem: 'These appear only in the skills list. No role or project mentions them.', why: 'Interviewers probe listed skills. Unsupported ones invite questions you may not be able to answer.', fix: 'Remove them, or move them to a "Currently learning" line until you have work to point to.' },
        { severity: 'critical', title: 'No measurable outcomes anywhere', quote: 'Worked on APIs for the order management module', problem: 'None of the six experience bullets include a number, scale or result.', why: 'Recruiters use outcomes to judge scope. Without them, a year of work reads like a list of tasks.', fix: 'Add real figures you know: number of endpoints, requests per day, test coverage, query time before and after.' },
        { severity: 'warning', title: 'Weak, passive verbs', quote: 'Responsible for writing unit tests', problem: '"Responsible for", "Helped", "Participated in" hide what you did yourself.', why: 'Ownership is a key signal for junior candidates.', fix: 'Lead with what you did: "Wrote unit tests for…", "Migrated reporting queries…".' },
        { severity: 'warning', title: 'Generic summary', quote: 'Passionate team player who loves learning new technologies.', problem: 'This sentence could describe any candidate.', why: 'The summary is the most-read section. Generic phrases spend that attention.', fix: 'Name your stack and the kind of systems you want to build.' },
        { severity: 'warning', title: '"Advanced" Python self-rating', quote: 'Python (Advanced)', problem: 'One year of professional experience paired with an advanced rating.', why: 'Self-ratings set a bar the interview will test against.', fix: 'Drop the rating and let your projects show depth.' },
        { severity: 'improvement', title: 'Projects lack scope', quote: 'Expense Splitter API — FastAPI, PostgreSQL, Docker.', problem: 'No detail on features, testing or deployment.', why: 'Projects are your main proof for skills not used at work.', fix: 'Add what it handles, how it is tested, and a repository link.' },
        { severity: 'improvement', title: 'Low-signal intern bullet', quote: 'Fixed bugs reported by QA team.', problem: 'Describes routine work without context.', why: 'Takes space that could show something specific.', fix: 'Describe one notable fix, or merge it into another bullet.' }
      ],
      skillLevels: [{ skill: 'Python', level: 'strong' }, { skill: 'Django', level: 'strong' }, { skill: 'Django REST Framework', level: 'strong' }, { skill: 'PostgreSQL', level: 'intermediate' }, { skill: 'FastAPI', level: 'intermediate' }, { skill: 'Git', level: 'intermediate' }, { skill: 'Docker', level: 'weak' }, { skill: 'Microservices', level: 'weak' }, { skill: 'Kubernetes', level: 'weak' }, { skill: 'Machine Learning', level: 'weak' }],
      claims: [
        { claim: 'Python (Advanced)', evidence: '1 year of Django work and two projects', risk: 'Medium' },
        { claim: 'Microservices', evidence: 'None found', risk: 'High' },
        { claim: 'Helped migrate reporting queries from MySQL to PostgreSQL', evidence: 'Experience bullet at Kitebyte', risk: 'Low' },
        { claim: 'Docker', evidence: 'Listed on the Expense Splitter API project', risk: 'Medium' }
      ],
      actions: [
        { title: 'Add measurable outcomes to your Kitebyte bullets', why: 'Achievement strength is your lowest component (34).', action: 'Rewrite four bullets with a real number each: endpoints, volume, coverage or speed.', impact: 'High', module: 'Bullet Optimizer' },
        { title: 'Remove or substantiate Kubernetes, Microservices, ML', why: 'Unsupported claims carry high credibility risk in interviews.', action: 'Drop them, or link a project that uses them.', impact: 'High', module: 'Skill-Proof' },
        { title: 'Practice PostgreSQL query-optimization questions', why: 'Indexing and query tuning are required in your target JD; your resume shows only a migration.', action: 'Answer the predicted PostgreSQL questions and review EXPLAIN ANALYZE output.', impact: 'Medium', module: 'Interview Predictor' },
        { title: 'Add pytest and CI to Expense Splitter API', why: 'pytest and CI/CD are listed in the JD and missing from your resume.', action: 'Add a test suite and a GitHub Actions workflow, then mention both.', impact: 'Medium', module: 'Learning Roadmap' }
      ]
    } },
    atsBy: { j1: {
      score: 72, keywordCoverage: 64, jobFit: 80,
      titleAlignment: '"Junior Software Engineer" is close to "Backend Developer" but doesn\'t contain the word backend.',
      summary: 'Your resume parses cleanly and covers the core stack. Coverage drops on testing, query optimization and infrastructure keywords.',
      matched: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'REST API', 'Git', 'Code review', 'Docker'],
      missing: ['pytest', 'Query optimization', 'Indexing', 'Pagination', 'Celery', 'Redis', 'CI/CD', 'AWS'],
      checks: [
        { label: 'Standard section headings', status: 'pass', note: 'Summary, Experience, Projects, Education and Skills are all recognisable.' },
        { label: 'Single-column plain text', status: 'pass', note: 'No tables or columns that commonly break parsers.' },
        { label: 'Contact details', status: 'pass', note: 'Email and location are on the first lines.' },
        { label: 'Job title alignment', status: 'risk', note: 'No title contains "Backend". Consider "Junior Software Engineer (Backend)" if accurate.' },
        { label: 'Required keyword coverage', status: 'risk', note: '"unit tests" may not match a search for "pytest".' },
        { label: 'Date formatting', status: 'pass', note: 'Consistent month–year ranges.' }
      ] } },
    decoderBy: { j1: {
      summary: 'A backend role on a transaction-matching engine. You would build and tune Python APIs that process large volumes of financial data.',
      reallyWants: 'Someone who can write correct, well-tested Python services and make PostgreSQL fast on big tables. Reliability matters more than breadth: money data has to be exact.',
      mustHave: ['Python in production (1–3 yrs)', 'Django or FastAPI', 'PostgreSQL query optimization and indexing', 'REST API design (auth, pagination, versioning)', 'pytest', 'Git and code review'],
      niceToHave: ['Celery / Redis', 'Docker and GitHub Actions', 'AWS', 'Payments or fintech'],
      responsibilities: ['Design and maintain reconciliation APIs', 'Write and maintain tests', 'Diagnose slow queries', 'Light on-call after onboarding', 'Work with product and support'],
      experience: '1–3 years of professional backend work. Internships likely count partially.',
      seniority: 'Junior to early mid-level',
      interviewFocus: ['SQL performance and indexing', 'API design trade-offs', 'Testing approach', 'Handling money values correctly'],
      hiddenSignals: ['"Millions of transactions every day" implies performance questions on large tables.', '"Light on-call" means production ownership from early on.', '"Work with support" suggests debugging real customer issues.'],
      suitability: 'Good fit on stack and seniority. The main gaps are evidence of query optimization and pytest, both learnable within a few weeks.'
    } },
    gapBy: { j1: {
      have: [
        { skill: 'Python', priority: 'Must Have', evidence: '1–3 years building production backend services in Python', note: 'Professional use at Kitebyte.' },
        { skill: 'Django / DRF', priority: 'Must Have', evidence: 'Strong Django or FastAPI experience', note: 'Order management APIs.' },
        { skill: 'Git & code review', priority: 'Important', evidence: 'Git and code review habits', note: 'Listed in experience.' },
        { skill: 'Docker', priority: 'Nice to Have', evidence: 'Docker and CI/CD (GitHub Actions)', note: 'Used in one project.' }
      ],
      missing: [
        { skill: 'pytest', priority: 'Must Have', evidence: 'Testing with pytest', note: 'Resume says "unit tests" without a framework.' },
        { skill: 'Celery / Redis', priority: 'Nice to Have', evidence: 'Celery / Redis for background jobs', note: 'Not mentioned.' },
        { skill: 'CI/CD', priority: 'Nice to Have', evidence: 'Docker and CI/CD (GitHub Actions)', note: 'Not mentioned.' },
        { skill: 'AWS', priority: 'Nice to Have', evidence: 'AWS', note: 'Not mentioned.' }
      ],
      strengthen: [
        { skill: 'PostgreSQL optimization', priority: 'Must Have', evidence: 'PostgreSQL, including query optimization and indexing', note: 'Migration work shown, tuning not shown.' },
        { skill: 'REST API design', priority: 'Must Have', evidence: 'REST API design: authentication, pagination, versioning', note: 'APIs built, but no design detail.' },
        { skill: 'FastAPI', priority: 'Important', evidence: 'Strong Django or FastAPI experience', note: 'One personal project.' }
      ]
    } },
    roadmap: { jobId: 'j1', phases: [
      { key: '7', label: '7-day', tasks: [
        { topic: 'pytest fundamentals', why: 'Required by the JD and absent from your resume.', difficulty: 'Easy', hours: 6, objective: 'Write fixtures, parametrized tests and API tests with pytest.', practice: 'Convert 10 existing unit tests to pytest style.', project: 'Add a pytest suite to Expense Splitter API.', questions: ['How do pytest fixtures differ from setUp?', 'How would you test an endpoint that calls an external API?'], done: true },
        { topic: 'Reading EXPLAIN ANALYZE', why: 'Query tuning is a must-have and a likely interview focus.', difficulty: 'Medium', hours: 5, objective: 'Read a query plan and spot sequential scans and bad estimates.', practice: 'Profile three slow queries on a 1M-row sample table.', project: 'Write a short note comparing plans before and after an index.', questions: ['What is the difference between a seq scan and an index scan?'], done: false }
      ] },
      { key: '30', label: '30-day', tasks: [
        { topic: 'Indexing strategies', why: 'Directly tested for data-heavy backends.', difficulty: 'Medium', hours: 12, objective: 'Choose between B-tree, composite and partial indexes.', practice: 'Index a transactions table for three access patterns.', project: 'Benchmark a reconciliation query with and without indexes.', questions: ['When would an index slow things down?'], done: false },
        { topic: 'API pagination and versioning', why: 'Named in the JD under REST API design.', difficulty: 'Medium', hours: 8, objective: 'Implement cursor pagination and a versioning scheme in DRF.', practice: 'Add cursor pagination to an existing endpoint.', project: 'Version the Expense Splitter API (v1 → v2).', questions: ['Offset or cursor pagination for millions of rows?'], done: false }
      ] },
      { key: '60', label: '60-day', tasks: [
        { topic: 'Celery and Redis', why: 'Nice-to-have here, required at Pallet Labs.', difficulty: 'Medium', hours: 14, objective: 'Run background jobs with retries and idempotency.', practice: 'Move a slow report into a Celery task.', project: 'Nightly settlement job for Expense Splitter.', questions: ['How do you make a task safe to retry?'], done: false },
        { topic: 'GitHub Actions CI', why: 'CI/CD is listed and easy to evidence.', difficulty: 'Easy', hours: 4, objective: 'Run lint and tests on every pull request.', practice: 'Add a workflow with caching.', project: 'Add a status badge to your project README.', questions: ['What would you run in CI vs. pre-commit?'], done: false }
      ] },
      { key: '90', label: '90-day', tasks: [
        { topic: 'Money values and reconciliation', why: 'Core to Ledgerline\'s domain.', difficulty: 'Hard', hours: 10, objective: 'Handle decimals, rounding and audit trails correctly.', practice: 'Model money with Decimal and NUMERIC.', project: 'Build a small two-source transaction matcher.', questions: ['Why never store money as float?'], done: false },
        { topic: 'AWS basics for backend', why: 'Nice-to-have across two of your saved jobs.', difficulty: 'Medium', hours: 12, objective: 'Deploy a containerised API with a managed database.', practice: 'Deploy Expense Splitter to a free-tier environment.', project: 'Document the deployment in the README.', questions: ['How would you manage secrets in production?'], done: false }
      ] }
    ] },
    proofBy: { j1: [
      { skill: 'Python', status: 'Proven', evidence: 'Professional Django work at Kitebyte; two projects.', gap: 'Depth isn\'t shown; "Advanced" rating is unsupported.', proof: 'Link a repository with non-trivial Python (typing, tests, packaging).', idea: '' },
      { skill: 'Django REST Framework', status: 'Proven', evidence: 'Order management APIs.', gap: 'No scale or design detail.', proof: 'Add the number of endpoints and one design decision to the bullet.', idea: '' },
      { skill: 'PostgreSQL', status: 'Partial', evidence: 'MySQL → PostgreSQL migration.', gap: 'No evidence of query tuning or indexing.', proof: 'A before/after benchmark of an optimized query.', idea: 'Reconciliation query benchmark on 1M generated rows, with EXPLAIN plans in the README.' },
      { skill: 'pytest', status: 'Unproven', evidence: 'None. "Unit tests" without a framework.', gap: 'Required skill with no evidence.', proof: 'A pytest suite with coverage report in a public repo.', idea: 'Add pytest + coverage to Expense Splitter API and show the badge.' },
      { skill: 'Docker', status: 'Partial', evidence: 'Listed on Expense Splitter API.', gap: 'No detail on how it was used.', proof: 'A Dockerfile and compose file in the repo.', idea: '' },
      { skill: 'Microservices', status: 'Unproven', evidence: 'None found.', gap: 'Listed but unsupported.', proof: 'Remove from resume until you have a project.', idea: 'Split Expense Splitter notifications into a separate service with a queue.' }
    ] },
    tailorBy: { j1: { text: TAILORED, changes: [
      { section: 'Summary', change: 'Replaced the generic sentence with your actual stack and target domain.', reason: 'The JD emphasises Python, PostgreSQL and fintech.' },
      { section: 'Experience', change: 'Added "(Backend)" to your title.', reason: 'Improves title alignment. Remove it if it doesn\'t reflect your role.' },
      { section: 'Experience', change: 'Rewrote passive bullets with direct verbs and moved the PostgreSQL migration up.', reason: 'PostgreSQL is a must-have.' },
      { section: 'Skills', change: 'Removed Microservices, Kubernetes, Machine Learning, HTML, CSS and the "Advanced" rating.', reason: 'Unsupported or irrelevant to this role.' }
    ], notIncluded: ['pytest', 'Query optimization', 'Celery / Redis', 'AWS'] } },
    resumes: [
      { id: 'master', name: 'Master resume', note: 'Original upload', created: '2026-07-02', text: RESUME },
      { id: 'v1', name: 'v1 · Backend roles', note: 'Backend emphasis', created: '2026-08-05', text: RESUME },
      { id: 'v2', name: 'v2 · Python roles', note: 'Python generalist', created: '2026-08-11', text: RESUME },
      { id: 'v3', name: 'v3 · AI/ML roles', note: 'ML coursework emphasis', created: '2026-08-15', text: RESUME },
      { id: 'v4', name: 'v4 · Ledgerline', note: 'Tailored for Ledgerline', created: '2026-09-27', text: TAILORED }
    ],
    bulletInput: 'Worked on APIs.',
    bullets: { variants: [
      { style: 'ATS-focused', text: 'Developed REST APIs for the order management module using Python, Django and Django REST Framework.', note: 'Adds the stack keywords that appear in your resume.' },
      { style: 'Achievement-focused', text: 'Built REST APIs for order management in Django REST Framework, used by [number] internal teams to process [number] orders/day.', note: 'Fill the brackets only with real figures.' },
      { style: 'Technical', text: 'Designed and implemented Django REST Framework endpoints with serializers, permissions and PostgreSQL-backed querysets for order management.', note: 'Only keep details you actually worked on.' },
      { style: 'Concise', text: 'Built order management REST APIs in Django REST Framework.', note: 'Good for a dense resume.' }
    ], metricPrompts: ['How many endpoints did you build or maintain?', 'Roughly how many requests or orders per day?', 'Did response time or error rate change because of your work?'] },
    safetyInput: `Hi Aarav, I'm Rohit from TalentBridge HR. You have been shortlisted for Backend Developer at a top MNC. Salary ₹28 LPA, work from home. No interview needed, just a quick onboarding test. To confirm your seat please pay ₹2,500 refundable registration fee and send Aadhaar + PAN copies on this WhatsApp number today, slots are closing in 2 hours. Reply on +91 9XXXX XXXXX. Regards, Rohit (HR) talentbridge.hr.jobs@gmail.com`,
    safety: { level: 'High risk indicators', summary: 'This message has several signals that commonly appear in recruitment fraud. It does not name the employer, asks for money, and asks for identity documents before any interview.', signals: [
      { signal: 'Payment request', severity: 'High', quote: 'pay ₹2,500 refundable registration fee', explain: 'Legitimate employers don\'t charge candidates to apply or onboard.' },
      { signal: 'Request for sensitive documents', severity: 'High', quote: 'send Aadhaar + PAN copies on this WhatsApp number', explain: 'ID documents are usually collected only after an offer, through official HR systems.' },
      { signal: 'Artificial urgency', severity: 'Medium', quote: 'slots are closing in 2 hours', explain: 'Pressure to act quickly discourages verification.' },
      { signal: 'Unusual hiring process', severity: 'Medium', quote: 'No interview needed', explain: 'Hiring without an interview is rare for a developer role.' },
      { signal: 'Unrealistic compensation', severity: 'Medium', quote: 'Salary ₹28 LPA', explain: 'Well above the typical range for 1 year of experience.' },
      { signal: 'Unverifiable company details', severity: 'Medium', quote: 'a top MNC … talentbridge.hr.jobs@gmail.com', explain: 'No employer named, and a free email domain instead of a company domain.' }
    ], positives: [], nextSteps: ['Don\'t pay or send documents.', 'Ask for the employer\'s name and a company email address.', 'Check the role on the company\'s official careers page.', 'Report the number on the platform where you were contacted.'] },
    priorityBy: {
      j1: { resume: 82, skill: 76, experience: 85, goal: 90, effort: 'Low', reason: 'Strong stack overlap and fintech matches your goal. Gaps (pytest, indexing) are quick to close.' },
      j2: { resume: 78, skill: 70, experience: 80, goal: 75, effort: 'Medium', reason: 'Good Django fit. Celery, Redis and AWS are required and not on your resume yet.' },
      j3: { resume: 54, skill: 42, experience: 50, goal: 40, effort: 'High', reason: 'Requires ML modelling experience your resume doesn\'t show, and it moves away from your backend goal.' },
      j4: { resume: 61, skill: 52, experience: 70, goal: 65, effort: 'High', reason: 'Python counts, but Kubernetes, Go and Terraform are core requirements with no evidence.' }
    },
    questions: [
      { category: 'Technical', question: 'A reconciliation query on a 50M-row transactions table has become slow. How would you investigate and fix it?', difficulty: 'Hard', why: 'The JD lists query optimization and indexing as requirements.', expect: ['Reading EXPLAIN ANALYZE output', 'Choosing composite or partial indexes', 'Trade-offs on write performance'], followups: ['When would an index make things worse?', 'How would you test the fix safely?'] },
      { category: 'Technical', question: 'How would you design pagination for an API that returns millions of transactions?', difficulty: 'Medium', why: 'Pagination is named under REST API design.', expect: ['Offset vs cursor pagination', 'Stable ordering', 'Performance at deep pages'], followups: ['How do you handle rows inserted mid-scroll?'] },
      { category: 'Resume', question: 'You list Python as Advanced. What is something in Python you understand that most junior developers don\'t?', difficulty: 'Medium', why: 'Self-rated skills are commonly tested directly.', expect: ['Generators, context managers or the GIL', 'A concrete example from your own code'], followups: ['When have you used that in production?'] },
      { category: 'Project', question: 'Walk me through how JWT authentication works in your Expense Splitter API.', difficulty: 'Medium', why: 'It is your clearest independent project and touches auth, a JD requirement.', expect: ['Token issue and verification flow', 'Expiry and refresh', 'Where secrets live'], followups: ['How would you revoke a token?'] },
      { category: 'Resume', question: 'What did the MySQL to PostgreSQL migration involve, and what went wrong?', difficulty: 'Medium', why: 'It is the most relevant experience bullet for this role.', expect: ['Scope and your part in it', 'Data type or query differences', 'How you verified results'], followups: ['What would you do differently?'] },
      { category: 'Behavioral', question: 'Tell me about a time a bug you shipped reached production.', difficulty: 'Easy', why: 'The role includes an on-call rotation.', expect: ['Situation and impact', 'How you found and fixed it', 'What changed afterwards'], followups: ['How did you communicate it?'] },
      { category: 'HR', question: 'Why are you looking to move from Kitebyte after a year?', difficulty: 'Easy', why: 'Short tenures are usually asked about.', expect: ['Positive framing', 'Link to this role\'s domain'], followups: ['What are you looking for in your next team?'] },
      { category: 'Role-specific', question: 'Two systems disagree on a transaction amount by one cent. How would you approach reconciling them?', difficulty: 'Hard', why: 'Reconciliation is the core of Ledgerline\'s product.', expect: ['Decimal vs float handling', 'Rounding rules', 'Audit trail'], followups: ['How would you store money values in PostgreSQL?'] }
    ],
    answers: {}, evals: {}, claimTests: {},
    apps: [
      A('a1', 'Ledgerline', 'Backend Developer (Python)', 'Backend', 'v4', 82, [['Applied', '2026-09-28'], ['Screening', '2026-10-02']], { recruiter: 'Priya Nair', salary: '₹9–12 LPA', interview: '2026-10-09', notes: [{ date: '2026-10-02', text: 'Recruiter call went well. Technical round next week, focus on SQL.' }] }),
      A('a2', 'Pallet Labs', 'Python Developer', 'Python', 'v2', 78, [['Applied', '2026-09-30']]),
      A('a3', 'Northwind Pay', 'Backend Engineer', 'Backend', 'v1', 84, [['Applied', '2026-09-05'], ['Screening', '2026-09-10'], ['Interview', '2026-09-17']], { recruiter: 'Kabir Shah', interview: '2026-10-08' }),
      A('a4', 'Kitepost', 'Junior Backend Developer', 'Backend', 'v1', 80, [['Applied', '2026-08-28'], ['Screening', '2026-09-02'], ['Interview', '2026-09-08'], ['Technical Round', '2026-09-15']]),
      A('a5', 'Orbitly', 'Django Developer', 'Backend', 'v1', 76, [['Applied', '2026-08-20'], ['Screening', '2026-08-26'], ['Rejected', '2026-09-04']]),
      A('a6', 'Quantive', 'Junior Data Scientist', 'Data', 'v3', 54, [['Applied', '2026-08-18'], ['Rejected', '2026-08-29']]),
      A('a7', 'Medley Health', 'ML Engineer Intern', 'Data', 'v3', 49, [['Applied', '2026-08-16'], ['Rejected', '2026-08-30']]),
      A('a8', 'Brightdesk', 'Software Engineer I (Platform)', 'Platform', 'v2', 61, [['Applied', '2026-09-12']]),
      A('a9', 'Tallyho', 'Python Developer', 'Python', 'v2', 72, [['Applied', '2026-09-01'], ['Screening', '2026-09-08'], ['Rejected', '2026-09-20']]),
      A('a10', 'Cobalt Ledger', 'Backend Developer', 'Backend', 'v1', 86, [['Applied', '2026-08-10'], ['Screening', '2026-08-14'], ['Interview', '2026-08-21'], ['Technical Round', '2026-08-28'], ['HR Round', '2026-09-04'], ['Offer', '2026-09-11']], { salary: '₹8.5 LPA offered', notes: [{ date: '2026-09-11', text: 'Offer received. Deadline to respond 15 Oct.' }] }),
      A('a11', 'Sprig', 'Python Backend Intern', 'Python', 'v2', 70, [['Applied', '2026-08-12'], ['Withdrawn', '2026-08-30']]),
      A('a12', 'Datahive', 'Data Analyst', 'Data', 'v3', 58, [['Applied', '2026-09-03']]),
      A('a13', 'Fernway', 'Backend Developer', 'Backend', '', 74, [['Saved', '2026-10-03']])
    ],
    chat: [],
    insights: null,
    prefs: { ...DEFAULT_PREFS },
  };
}

function A(id, company, role, category, version, match, events, extra) {
  extra = extra || {};
  return { id, company, role, category, version, match, url: '', recruiter: extra.recruiter || '', salary: extra.salary || '', interview: extra.interview || '', status: events[events.length - 1][0], applied: (events.find(e => e[0] === 'Applied') || [])[1] || '', events: events.map(([status, date]) => ({ status, date })), notes: extra.notes || [] };
}
