# HireMind AI

AI-assisted hiring: candidates apply with a resume and take a short adaptive interview; recruiters get a
ranked shortlist with transcripts, scores and integrity signals to review.

- **Candidates** upload a PDF resume, browse jobs, and see a match score plus the specific skills a job asks
  for that their resume doesn't show. The interview is five questions that get harder or easier based on each
  answer, typed or spoken, with feedback after every one.
- **Recruiters** post, edit and close jobs, see applicants ranked by match, and open a full applicant page:
  contact email, resume, transcript with per-answer scores, voice playback, and anti-cheat signals. Shortlist
  or reject, and the candidate gets an email.

Everything the AI produces is labelled as a suggestion: the signals are review aids, not decisions.

## Stack

| Area | Choice |
|---|---|
| Backend | Node + TypeScript, Express 5, Prisma 6, PostgreSQL |
| Frontend | React 19, Vite 8, React Router 7, Zustand, Tailwind CSS |
| AI | Google Gemini (`@google/genai`): embeddings for matching, generation for interviews and reports |
| Email | Resend HTTP API (verification, password reset, application decisions) |
| Files | Local disk by default, or any S3-compatible bucket |
| Tests | Vitest + Supertest against a throwaway Postgres, with Gemini and email mocked |

`ARCHITECTURE.md` in the repo root documents the architecture in depth: request flow, security model, data
model and conventions.

## Getting started

**Prerequisites:** Node ^20.19 or ≥22.12, npm, Docker (or any PostgreSQL), and a Gemini API key.

```bash
# 1. Database (or point DATABASE_URL at your own Postgres)
docker compose up -d

# 2. Backend
cd backend
npm install
cp .env.example .env        # then fill in the values below
npx prisma migrate deploy
npm run seed                # optional demo accounts, jobs and a finished interview
npm run dev                 # http://localhost:5000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

With `npm run seed`, log in as `demo-recruiter@hiremind.test` or `demo-candidate@hiremind.test`, password
`demo-password-123`.

### Environment variables

`backend/.env`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | 32+ random characters. The server refuses to start without it |
| `GEMINI_API_KEY` | yes in production | Without it, matching and interviews fail |
| `PORT` | no | Defaults to 5000 |
| `CORS_ORIGINS` | yes in production | Comma-separated browser origins, e.g. your Vercel URL |
| `APP_URL` | yes in production | The frontend's URL, used in email links |
| `TRUST_PROXY` | behind a proxy | Number of proxy hops, so rate limits see real client IPs |
| `RESEND_API_KEY` | for real emails | Without it, emails are printed to the console in development |
| `EMAIL_FROM` | with Resend | e.g. `HireMind <noreply@yourdomain.com>`, on a domain verified in Resend |
| `STORAGE_DRIVER` | no | `local` (default) or `s3` |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | with `s3` | Bucket credentials |
| `S3_REGION`, `S3_ENDPOINT` | with `s3` | Region for AWS; endpoint for R2, Supabase or MinIO |

`frontend/.env`: `VITE_API_URL` (defaults to `http://localhost:5000/api`).

The backend validates all of this at startup and lists anything missing instead of failing later.

## Scripts

```bash
# backend
npm run dev            # watch mode
npm test               # Vitest suite (needs a test database, see below)
npm run typecheck      # source, tests and seed script
npm run build          # prisma generate && tsc → dist/
npm start              # node dist/server.js
npm run migrate:deploy # apply migrations
npm run seed           # demo data

# frontend
npm run dev
npm run lint
npm run build
```

## Tests

The suite talks to a real database and mocks Gemini and email, so it needs no API keys and costs nothing:

```bash
docker run --rm -d --name hiremind-test-db \
  -e POSTGRES_USER=hiremind -e POSTGRES_PASSWORD=hiremind_test -e POSTGRES_DB=hiremind_test \
  -p 55432:5432 postgres:16

cd backend
DATABASE_URL=postgresql://hiremind:hiremind_test@localhost:55432/hiremind_test npm test
```

It refuses to run unless the database name contains "test", and truncates tables between tests. CI
(`.github/workflows/ci.yml`) runs the same suite plus both type-checks, the frontend lint and the frontend
build on every push.

## Deployment

**Frontend (Vercel):** import the repo, set the project root to `frontend`, and set `VITE_API_URL` to the
backend's URL. `vercel.json` already rewrites all paths to `index.html` for client-side routing.

**Backend (any Docker host: Render, Railway, Fly, a VPS):**

1. Build from `backend/Dockerfile`.
2. Set the environment variables above, including `CORS_ORIGINS`, `APP_URL` and `TRUST_PROXY=1`.
3. Run `npm run migrate:deploy` as the release or pre-deploy command, so migrations apply before the new
   version serves traffic.
4. Point health checks at `GET /api/health`.
5. Uploads: either mount a persistent volume at `/app/uploads`, or set `STORAGE_DRIVER=s3` with bucket
   credentials. On hosts with an ephemeral disk, local files disappear on redeploy.

## Notes and limits

- **Gemini quota.** A free-tier key allows 5 generate calls per minute and 20 per day, and one interview uses
  11–13. Real use needs billing enabled.
- **Rate limits are per process**, held in memory. Running more than one backend instance needs a shared
  store such as Redis.
- **Resend's default sender** (`onboarding@resend.dev`) only delivers to the Resend account owner. Verify a
  domain to email candidates.
- **AI output is treated as untrusted**: replies are validated against a schema, and resume and answer text is
  fenced off in prompts so it can't issue instructions to the model.
