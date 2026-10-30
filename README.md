<div align="center">

# 🧠 HireMind AI

### AI-Assisted Hiring — From Resume to Ranked Shortlist

[![CI](https://github.com/Bhushan-Nanvare/HireMind/actions/workflows/ci.yml/badge.svg)](https://github.com/Bhushan-Nanvare/HireMind/actions)
![Node](https://img.shields.io/badge/Node-≥20.19-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-AI-4285F4?logo=googlegemini&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

Candidates apply with a resume and take a short adaptive interview.  
Recruiters get a ranked shortlist with transcripts, scores, and integrity signals to review.

**Everything the AI produces is labelled as a suggestion — the signals are review aids, not decisions.**

</div>

---

## ✨ Features

### For Candidates
- 📄 **Upload PDF resumes** and browse open job listings
- 🎯 **Match score** — see how well your resume fits each job, plus the specific skills it's missing
- 🎤 **Adaptive AI interview** — 5 questions that get harder or easier based on each answer (type or speak)
- 💡 **Instant feedback** after every answer and a summary report at the end

### For Recruiters
- 📝 **Post, edit, and close jobs** with AI-powered description embeddings
- 📊 **Ranked applicant list** sorted by resume-to-job match score
- 📋 **Full applicant view** — contact email, resume, interview transcript with per-answer scores, voice playback, and anti-cheat signals
- ✅ **Shortlist or reject** with one click — the candidate gets an email automatically

### Platform-Wide
- 🔐 **Email verification** and **password reset** flows via one-time hashed tokens
- 🛡️ **Anti-cheat proctoring** — tab switches, copy/paste attempts, typing speed analysis, and AI-likeness scoring
- 🌐 **Dual storage** — local disk or any S3-compatible bucket (AWS S3, Cloudflare R2, Supabase, MinIO)
- ⚡ **Rate limiting** on login, signup, email endpoints, and AI-heavy operations

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js · TypeScript · Express 5 · Prisma 6 · PostgreSQL |
| **Frontend** | React 19 · Vite 8 · React Router 7 · Zustand 5 · Tailwind CSS 3 |
| **AI** | Google Gemini (`@google/genai`) — embeddings for matching, generation for interviews & reports |
| **Validation** | Zod v4 (backend schemas + AI response validation) |
| **Auth** | bcrypt · HS256 JWTs (jsonwebtoken) · one-time email tokens (SHA-256 hashed) |
| **Email** | Resend HTTP API (verification, password reset, application decisions) |
| **Storage** | Local disk (default) or any S3-compatible bucket |
| **Security** | Helmet · CORS allowlist · express-rate-limit · prompt injection fencing |
| **Tests** | Vitest · Supertest · throwaway Postgres (AI & email mocked — zero cost) |
| **CI/CD** | GitHub Actions · Docker (multi-stage build) |

---

## 📁 Project Structure

```
HireMind/
├── .github/workflows/ci.yml        # Type-check, test, lint & build on every push
├── docker-compose.yml               # Local PostgreSQL 16
├── ARCHITECTURE.md                  # In-depth architecture reference
│
├── backend/
│   ├── Dockerfile                   # Multi-stage production image
│   ├── .env.example                 # All env vars documented
│   ├── prisma/
│   │   ├── schema.prisma            # Data model (source of truth)
│   │   ├── migrations/              # Versioned DB migrations
│   │   └── seed.ts                  # Demo data (2 accounts, jobs, interview)
│   ├── src/
│   │   ├── server.ts                # Entry point
│   │   ├── app.ts                   # Express app setup
│   │   ├── shared/                  # Auth, JWT, email, storage, AI, errors, rate limits
│   │   └── modules/                 # Feature modules (routes → controller → service)
│   │       ├── auth/
│   │       ├── jobs/
│   │       ├── resumes/
│   │       ├── applications/
│   │       ├── interviews/
│   │       ├── proctoring/
│   │       ├── candidates/
│   │       └── recruiters/
│   └── tests/                       # Integration tests per module
│
└── frontend/
    ├── vercel.json                  # SPA rewrite for Vercel
    └── src/
        ├── App.tsx                  # Route table with role guards
        ├── api/                     # Typed API functions per module
        ├── pages/                   # Landing, auth, candidate, recruiter, interview
        ├── components/              # Shared UI, layout, interview, recruiter
        ├── store/                   # Zustand (authStore, toastStore)
        └── utils/                   # Hooks, formatters, session helpers
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ^20.19 or ≥22.12
- **npm**
- **Docker** (or any PostgreSQL 16 instance)
- **Gemini API key** — [get one free](https://aistudio.google.com/apikey)

### 1. Clone the repository

```bash
git clone https://github.com/Bhushan-Nanvare/HireMind.git
cd HireMind
```

### 2. Start the database

```bash
docker compose up -d
```

Or point `DATABASE_URL` at your own PostgreSQL instance.

### 3. Set up the backend

```bash
cd backend
npm install
cp .env.example .env    # ← fill in the values (see Environment Variables below)
npx prisma migrate deploy
npm run seed             # optional: demo accounts, jobs & a finished interview
npm run dev              # → http://localhost:5000
```

### 4. Set up the frontend

```bash
cd frontend
npm install
npm run dev              # → http://localhost:5173
```

### 5. Try the demo

With `npm run seed`, log in with either demo account:

| Account | Email | Password |
|---|---|---|
| Recruiter | `demo-recruiter@hiremind.test` | `demo-password-123` |
| Candidate | `demo-candidate@hiremind.test` | `demo-password-123` |

Both accounts are pre-verified, with sample jobs and a completed interview ready to explore.

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ Always | PostgreSQL connection string |
| `JWT_SECRET` | ✅ Always | 32+ random chars. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GEMINI_API_KEY` | ✅ Production | Without it, matching & interviews fail |
| `PORT` | No | Defaults to `5000` |
| `CORS_ORIGINS` | ✅ Production | Comma-separated browser origins (e.g. your Vercel URL) |
| `APP_URL` | ✅ Production | Frontend's URL — used in email links |
| `TRUST_PROXY` | Behind proxy | Number of proxy hops (so rate limits see real IPs) |
| `RESEND_API_KEY` | For real emails | Without it, emails print to console in dev |
| `EMAIL_FROM` | With Resend | e.g. `HireMind <noreply@yourdomain.com>` (domain verified in Resend) |
| `STORAGE_DRIVER` | No | `local` (default) or `s3` |
| `S3_BUCKET` | With `s3` | Bucket name |
| `S3_ACCESS_KEY_ID` | With `s3` | Access key |
| `S3_SECRET_ACCESS_KEY` | With `s3` | Secret key |
| `S3_REGION` | With `s3` | Region (AWS) |
| `S3_ENDPOINT` | With `s3` | Endpoint (R2, Supabase, MinIO) |

### Frontend (`frontend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | Backend API base URL |

> The backend validates all variables at startup and lists everything that's missing — it won't fail later with a cryptic error.

---

## 📜 Available Scripts

### Backend

```bash
npm run dev              # Watch mode (tsx watch)
npm test                 # Vitest suite (needs a test database)
npm run typecheck        # Type-check source + tests + seed
npm run build            # prisma generate && tsc → dist/
npm start                # node dist/server.js (production)
npm run migrate:deploy   # Apply pending migrations
npm run seed             # Load demo data
```

### Frontend

```bash
npm run dev              # Vite dev server
npm run lint             # oxlint
npm run build            # tsc -b && vite build
npm run preview          # Preview production build
```

---

## 🧪 Testing

The test suite uses a **real PostgreSQL database** with **Gemini and email fully mocked** — no API keys needed, zero cost.

```bash
# 1. Spin up a test database
docker run --rm -d --name hiremind-test-db \
  -e POSTGRES_USER=hiremind \
  -e POSTGRES_PASSWORD=hiremind_test \
  -e POSTGRES_DB=hiremind_test \
  -p 55432:5432 postgres:16

# 2. Run the tests
cd backend
DATABASE_URL=postgresql://hiremind:hiremind_test@localhost:55432/hiremind_test npm test
```

**Safety guardrails:**
- Refuses to run unless the database name contains `test`
- Tables are truncated between tests
- Test files run sequentially (no cross-contamination)
- Rate limits are disabled during tests

### CI Pipeline

The [GitHub Actions workflow](.github/workflows/ci.yml) runs on every push and PR:

| Job | Steps |
|---|---|
| **Backend** | Install → Generate Prisma → Migrate → Type-check → Test |
| **Frontend** | Install → Lint → Build |

No secrets required — everything is mocked.

---

## 🔌 API Reference

All endpoints are under `/api`. Responses follow the envelope: `{ success: true, data }` or `{ success: false, error }`.

<details>
<summary><strong>Authentication</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/signup` | Public | Create account → returns `{ token }` |
| `POST` | `/auth/login` | Public | Login → returns `{ token }` |
| `GET` | `/auth/me` | Logged in | Current user profile |
| `POST` | `/auth/forgot-password` | Public | Send reset email |
| `POST` | `/auth/reset-password` | Public | Set new password with token |
| `POST` | `/auth/verify-email` | Public | Verify email with token |
| `POST` | `/auth/resend-verification` | Logged in | Resend verification email |

</details>

<details>
<summary><strong>Jobs</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/jobs` | Public | List open jobs |
| `GET` | `/jobs/:id` | Public | Job details |
| `POST` | `/jobs` | Recruiter (verified) | Create a job posting |
| `GET` | `/jobs/mine` | Recruiter | Own job listings with applicant counts |
| `PATCH` | `/jobs/:id` | Recruiter (owner) | Edit title/description |
| `PATCH` | `/jobs/:id/status` | Recruiter (owner) | Open or close |
| `DELETE` | `/jobs/:id` | Recruiter (owner) | Delete (only if no applicants) |

</details>

<details>
<summary><strong>Resumes</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/resumes/upload` | Candidate | Upload a PDF resume |
| `GET` | `/resumes/mine` | Candidate | List own resumes |
| `GET` | `/resumes/:id/file` | Candidate (owner) | Download resume PDF |
| `DELETE` | `/resumes/:id` | Candidate (owner) | Delete (only if unused) |

</details>

<details>
<summary><strong>Applications</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/applications` | Candidate (verified) | Apply → match score + skill gaps |
| `GET` | `/applications/mine` | Candidate | Own applications |
| `GET` | `/applications/job/:jobId` | Recruiter (owner) | Applicants for a job |
| `GET` | `/applications/:id` | Recruiter (owner) | Applicant detail + transcript |
| `GET` | `/applications/:id/resume` | Recruiter (owner) | Stream applicant's resume |
| `PATCH` | `/applications/:id/status` | Recruiter (owner) | Shortlist / Reject / Reset |

</details>

<details>
<summary><strong>Interviews</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/interviews/by-application/:id` | Candidate | Interview state (read-only) |
| `POST` | `/interviews/start` | Candidate | Start or resume interview |
| `GET` | `/interviews/:sessionId` | Candidate | Current question state |
| `POST` | `/interviews/:sessionId/answer` | Candidate | Submit typed answer |
| `POST` | `/interviews/:sessionId/answer-audio` | Candidate | Submit voice answer |
| `POST` | `/interviews/:sessionId/proctoring` | Candidate | Log proctoring event |

</details>

<details>
<summary><strong>Health</strong></summary>

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/health` | Public | `{"status":"ok"}` |

</details>

---

## 🔒 Security

| Area | Implementation |
|---|---|
| **Authentication** | bcrypt password hashing · HS256 JWT (7-day expiry) · token revocation on password change |
| **Email tokens** | 32-byte random · stored as SHA-256 hash · single-use (atomic claim) · 24h verification / 1h reset |
| **Timing safety** | Failed logins compare against a dummy hash to prevent email enumeration |
| **Rate limiting** | Per-IP: login (10/15min), signup (10/hr), email (5/hr), API (600/15min) · Per-user: AI calls (30/10min) |
| **Headers** | Helmet security headers · CORS allowlist |
| **Uploads** | Extension + MIME filter → `%PDF-` signature check → temp file cleanup on failure |
| **Prompt injection** | User text is fenced with `tagged()` under a system instruction declaring it as data, not instructions |
| **AI output** | Treated as untrusted — validated against Zod schemas before use |

---

## 🚢 Deployment

### Frontend → Vercel

1. Import the repo and set the **project root** to `frontend`
2. Set `VITE_API_URL` to the backend's URL
3. `vercel.json` already handles SPA routing

### Backend → Docker (Render / Railway / Fly / VPS)

1. **Build** from `backend/Dockerfile`
2. **Set environment variables** — especially `CORS_ORIGINS`, `APP_URL`, `TRUST_PROXY=1`
3. **Run migrations** as the release/pre-deploy step:
   ```bash
   npm run migrate:deploy
   ```
4. **Health checks** → `GET /api/health`
5. **File storage** — either:
   - Mount a persistent volume at `/app/uploads`, or
   - Set `STORAGE_DRIVER=s3` with bucket credentials

> ⚠️ Hosts with ephemeral disks lose local uploads on redeploy. Use S3 for production.

---

## 📊 Data Model

```mermaid
erDiagram
    User ||--o| Candidate : "has profile"
    User ||--o| Recruiter : "has profile"
    User ||--o{ AuthToken : "has tokens"
    Recruiter ||--o{ JobPosting : "posts"
    Candidate ||--o{ Resume : "uploads"
    Candidate ||--o{ Application : "applies"
    Application }o--|| JobPosting : "for job"
    Application }o--|| Resume : "with resume"
    Application ||--o{ SkillGap : "has gaps"
    Application ||--o| InterviewSession : "has interview"
    InterviewSession ||--o{ InterviewQuestion : "contains"
    InterviewQuestion ||--o| InterviewAnswer : "has answer"
    InterviewSession ||--o{ ProctoringEvent : "logs events"
    InterviewSession ||--o| Report : "generates"
```

---

## ⚠️ Known Limits

| Limit | Details |
|---|---|
| **Gemini free-tier quota** | ~5 generate calls/min and ~20/day. One interview uses 11–13 calls. Real use needs billing enabled. |
| **Rate limits are in-memory** | They reset on restart. Multiple instances need a shared store (e.g., Redis). |
| **Resend default sender** | `onboarding@resend.dev` only delivers to the account owner. Verify a domain for real emails. |
| **Embeddings in JS** | Cosine similarity is computed in application code, not pgvector. Sufficient for the current scale. |

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create a feature branch** — `git checkout -b feature/amazing-feature`
3. **Follow the conventions** documented in [`ARCHITECTURE.md`](ARCHITECTURE.md#conventions)
4. **Run the checks** before pushing:
   ```bash
   # Backend
   cd backend && npm run typecheck && npm test

   # Frontend
   cd frontend && npm run lint && npm run build
   ```
5. **Open a Pull Request** — CI will run automatically

---

## 📄 License

This project is licensed under the **ISC License**.

---

<div align="center">

**Built with ❤️ by [Bhushan Nanvare](https://github.com/Bhushan-Nanvare)**

</div>
