# Waypoint — AI Career Intelligence

A Node.js (Express) API and React (Vite) client implementing the **Waypoint Career Intelligence v2** design
handoff: landing page, accounts (sign-up, login, password reset), onboarding, dashboard and 15 career tools
(resume analyzer, ATS, tailoring, bullet optimizer, skill-proof, job priority, job decoder, job safety, skill
gap, roadmap, interview predictor, consistency check, application tracker, analytics, AI assistant).

Every account has its own private workspace in **MongoDB**, starting **empty** (no sample data). Every AI call is
made by the **server** with the Google Gemini API (`gemini-2.5-flash-lite`), so the API key never reaches the
browser and each task is sent only the data it needs.

## Quick start

Requires Node.js 20+ (developed on 22).

```bash
npm install
cp server/.env.example server/.env      # then set MONGODB_URI and GEMINI_API_KEY
npm run dev                              # API on :4000, web on http://localhost:5173
```

Open the app and **create an account**. Without a Gemini key everything except the AI actions works; those show a
clear "isn't configured" message.

| Command | What it does |
| --- | --- |
| `npm run dev` | API (auto-restart) + Vite dev server with `/api` proxied |
| `npm run build` then `npm start` | Production: Express serves the built client and the API on one port (4000) |
| `npm test` | 137 tests on a real in-memory MongoDB (see *Tests* below) |

## Configuration (`server/.env`)

| Variable | Default | Notes |
| --- | --- | --- |
| `MONGODB_URI` | — | **Required.** MongoDB connection string. The server refuses to start without it. |
| `MONGODB_DB` | `waypoint_ai` | Database name. Waypoint uses only its own collections (below). |
| `GEMINI_API_KEY` | — | Required for AI features. Get one at <https://aistudio.google.com/apikey>. A leftover `your_api_key_here` counts as unset. |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Blank means the default. |
| `GEMINI_TIMEOUT_MS` | `120000` | Per request. |
| `APP_URL` | `http://localhost:5173` | Where users open the app; password-reset links point here. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | — | Email delivery for password resets. Without them the link is printed in the server console. |
| `AUTH_DEV_RESET_LINKS` | off | Local dev only: put the reset link in the API response (shown on the forgot-password page). Ignored in production. |
| `TRUST_PROXY` / `COOKIE_SECURE` | — | Set behind a reverse proxy / on HTTPS. |
| `PORT` / `HOST` | `4000` / `127.0.0.1` | By default the API listens on this machine only. |

Names are matched ignoring case, so `gemini_api_key=…`, `mongodb_uri=…` etc. in `.env` work as written. `.env` is
git-ignored — keep credentials there, never in code.

## Accounts and security

- **Sign-up / login / forgot / reset** pages at `/signup`, `/login`, `/forgot-password`, `/reset-password`. The whole
  app (`/app/*`) and every data route require a login; each user only ever reads and writes their own workspace.
- **Passwords** are hashed with scrypt (salted, memory-hard) — plain text is never stored or logged. Rules: 8–128
  characters, not a well-known password, not the email or name. Five wrong attempts lock the account for 15 minutes
  (a successful login or password reset clears it); login/signup/reset requests are also throttled per IP.
- **Sessions** are server-side (`sessions` collection). The browser only holds an unguessable random token in an
  `HttpOnly`, `SameSite=Lax` cookie, and the database stores only its SHA-256, so neither XSS nor a database leak
  yields a usable session. "Keep me logged in" = 30 days (sliding); otherwise a browser-session cookie. Sessions
  expire on their own (MongoDB TTL index) and are all revoked when the password changes.
- **Password reset**: a single-use, 1-hour token (stored hashed), delivered in the URL *fragment* so it never reaches
  a server log or `Referer` header, and removed from the address bar on arrival. Requesting a reset gives the same
  answer whether or not the email exists, and at most one email is sent per minute per account.
- **No user enumeration** on login (identical error and timing for unknown email vs wrong password).
- **CSRF**: every state-changing request must carry an `X-Requested-With` header that cross-site pages cannot set,
  on top of `SameSite` cookies. Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
  no-referrer`) are always sent; the built app is also served under a strict Content-Security-Policy.

## Architecture

```
shared/   pure logic used by both sides: analytics, priority scoring, workspace patch semantics
server/   Express API
  src/auth/      passwords (scrypt) · tokens · repo (users, sessions, reset tokens) · session cookie/guard · mailer
  src/ai/        client.js (only module that talks to Gemini) · tasks.js (prompts + parsing) · context.js
  src/routes/    auth · workspace · ai · resume (PDF/DOCX/TXT → text)
  src/store.js   MongoDB workspaces (one document per user, atomic path updates)
  src/domain/    the empty workspace every account starts with
client/   React + Vite
  src/pages/     one file per screen (pages/auth/* = login, sign-up, forgot, reset)
  src/state/     auth · workspace · task providers      src/components/  shell, auth UI kit, shared UI
```

**MongoDB collections** (all in `MONGODB_DB`; Waypoint touches nothing else):

| Collection | Contents |
| --- | --- |
| `users` | name, email (unique, lower-case), password hash, login/lock counters |
| `sessions` | hashed session token → user, expiry (TTL) |
| `passwordResets` | hashed one-time reset token → user, expiry (TTL) |
| `workspaces` | one document per user (`_id` = user id): profile, resume, jobs, results, applications, chat |

**Data flow.** The server owns each workspace. The client edits it through `PATCH /api/workspace` with a small
`{ set, merge }` patch format (autosaved, debounced, retried on failure). AI endpoints read what they need from the
stored workspace, call the model, persist the result and return the same patch format, which the client applies —
so what you see is what was stored. Clients cannot write AI-derived data directly (whitelist in
`shared/src/patch.js`). A patch becomes one atomic update on the exact paths it names (`$set: { "answers.3": … }`,
`$unset` for `null`), so simultaneous edits to different entries never overwrite each other, and chat messages are
appended with `$push`. Entry ids become field paths, so only `[A-Za-z0-9_:-]` is accepted. Nothing is cached in the
process, so several server instances can share one database.

**AI pipeline.** One task = prompt (ported verbatim from the design) → model → JSON extraction (one retry on
unreadable output) → field-by-field normalisation (`ai/sanitize.js`) → patch. Over-long inputs are rejected with a
clear message rather than silently truncated. With nothing to analyse yet (no resume, no job) the tasks answer with
what to add first instead of calling the model.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Model name, whether a Gemini key is set |
| `POST /api/auth/signup` · `login` · `logout` | Account + session. `GET /api/auth/me` → `{ user }` (`null` when logged out) |
| `POST /api/auth/forgot-password` · `reset-password/check` · `reset-password` | Password recovery |
| `GET /api/workspace` · `PATCH /api/workspace` | Read / autosave the logged-in user's workspace |
| `POST /api/ai/:task` | `resume-analysis`, `ats`, `tailor`, `bullets`, `skill-proof`, `priority`, `decoder`, `safety`, `skill-gap`, `roadmap`, `interview-questions`, `answer-evaluation`, `claim-question`, `claim-evaluation`, `insights` → `{ patch }` |
| `POST /api/ai/chat` | `{ message }` → updated conversation (the user's turn is stored even if the model call fails) |
| `POST /api/resume/extract` | multipart `file` (PDF, DOCX, TXT, MD; ≤ 5 MB) → `{ text }` |

Errors are `{ error: { message, canRetry, code?, field? } }`; the UI shows `message`, offers Retry only when
`canRetry`, and attaches `field` errors to the matching form input.

## Decisions worth knowing about

- **Empty by default** — no sample data exists in the runtime code or the database. (Realistic fixtures live under
  `server/test/fixtures/`, used only by the automated tests.) Pages that need input show what to add first.
- **UI state in the URL** — screens and tabs are routes (`/app/resume/ats`, `/app/interview/consistency`,
  `/app/onboarding/job`…), so refresh and back/forward work.
- **Additions beyond the mock** — accounts; a *Preferences* control in the sidebar for the design's three
  configurable props (accent, sidebar theme, AI tone); a collapsible menu on phones; confirmation before deleting
  an application; real PDF/DOCX upload (the prototype only read `.txt`).
- Only `Waypoint Career Intelligence v2` was implemented (the older v1 file in the bundle was not).

## Verification and known limits

- Tested: 137 automated tests — accounts (lockout, session expiry, CSRF, data isolation, the full reset flow, token
  single-use and expiry), the Gemini request/error handling, every AI task with a scripted model, MongoDB behaviour
  (atomic concurrent patches, per-user isolation) — plus every screen driven in a browser, on desktop and phone
  widths, against the production build.
- **Not tested against the live Gemini API** or a real mailbox (no SMTP configured while building). The Gemini call
  shape follows the `@google/genai` type definitions; email goes through `nodemailer`. If a live request fails, the
  error shown in the app says why (invalid key, unknown model, quota, region).
- There is **no email verification at sign-up**: anyone can register any address. Password reset emails go only to
  the account's own address. Rate limits are kept in memory per server process.
- `gemini-2.5-flash-lite` is a small, fast model. If results look thin, set `GEMINI_MODEL=gemini-2.5-flash`. The
  free tier allows roughly 15 requests/minute; hitting it shows "Rate limit reached" with a Retry button.
- `pdf-parse@1.1.1` bundles an old pdf.js (image-only/scanned PDFs yield no text — the user is told to paste).
  `npm audit` reports a moderate advisory in `sprintf-js` (via `mammoth` → `argparse`); it is only reachable
  through argparse's CLI parsing, not through document content.
- One workspace document must stay under MongoDB's 16 MB limit — ample for a resume, jobs and a few hundred
  applications (chat keeps the latest 200 messages).

## Tests

`npm test` runs against a **real MongoDB** started in memory (`mongodb-memory-server`), one throwaway database
per test, so it never touches your cluster and needs no credentials. The **first run downloads the MongoDB
binary (~780 MB, once)**. To use another server instead, set `TEST_MONGODB_URI` (each test still creates and
drops its own database).
