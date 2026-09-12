# HireMind Architecture

## Project
HireMind AI is an AI-assisted hiring platform with two roles:
- **Candidate**: uploads PDF resumes, browses open jobs and applies. Each application gets a match score and LLM-detected skill gaps. The candidate then takes a 5-question adaptive AI interview, answering by typing or speaking, and sees feedback on every answer plus a final report.
- **Recruiter**: posts, edits, closes and deletes jobs. Views applicants ranked by match, with contact email, resume, full interview transcript (including voice recordings), scores and anti-cheat "signals". Can shortlist, reject or undo a decision; shortlisting and rejecting email the candidate.

Accounts have email verification (required before applying or posting a job) and password reset by email.

The repo holds two independent npm projects, `backend/` and `frontend/`. There is no root package.json and no workspaces, so run `npm install` in each. `README.md` is the public-facing setup and deployment guide; this file is the working reference.

## Stack
**Backend (`backend/`)**
- TypeScript with Express 5, CommonJS (`"type": "commonjs"`). `tsx watch` runs it in development; `tsc` compiles it to `dist/` for `npm start`
- Prisma 6 with PostgreSQL. The client is generated into `backend/generated/prisma` (gitignored). It lives outside `src/` so both `src/` and the compiled `dist/` code can import it from the same relative path, `../../generated/prisma`
- Auth: bcrypt hashes and HS256 JWTs (jsonwebtoken). Tokens last 7 days and carry `{ userId, role }`
- Validation: zod v4, in controllers, plus one startup check of the environment
- Security: helmet headers, a CORS allowlist, express-rate-limit (in-memory) and one central error handler
- Uploads: multer, then either local disk or an S3-compatible bucket (`shared/storage.ts`). `pdf-parse` v2 (`PDFParse` class) extracts resume text
- AI: Google Gemini through `@google/genai`. `gemini-embedding-001` handles embeddings and `gemini-3.6-flash` handles all generation, scoring and transcription. Structured replies use JSON mode, zod validation and retries
- Email: the Resend HTTP API, called with `fetch` (no SDK). Without `RESEND_API_KEY`, emails are printed to the console instead
- Tests: Vitest + Supertest against a throwaway Postgres, with Gemini and email mocked

**Frontend (`frontend/`)**
- React 19, Vite 8, TypeScript ~6.0, ESM
- react-router-dom v7 (`BrowserRouter`, route table in `src/App.tsx`)
- Zustand 5: `authStore` (persists only `{ token, role }` under localStorage key `hiremind-auth`) and `toastStore`
- A shared axios instance adds `Authorization: Bearer <token>` and signs out on 401
- Tailwind CSS v3 through PostCSS, with shared class lists in `components/common/styles.ts` and small components in `components/common/ui.tsx`; no component library
- oxlint for linting
- Deployed on Vercel. `vercel.json` rewrites every path to `index.html` for SPA routing

**Database**: hosted Postgres (currently Neon). `docker-compose.yml` provides a local Postgres 16 as an alternative.

## Folder structure
```
README.md                       # public setup + deployment guide
.github/workflows/ci.yml        # typecheck, tests, lint, build on every push
backend/
  Dockerfile, .dockerignore     # production image; migrations run as a release step
  .env.example                  # every variable, with notes
  vitest.config.mts             # test runner (.mts because the package is CommonJS)
  tsconfig.json                 # builds src/ to dist/
  tsconfig.test.json            # type-checks tests, seed and config too (bundler resolution)
  prisma/schema.prisma          # data model: source of truth
  prisma/migrations/            # every DB change goes through a migration (see Gotchas)
  prisma/seed.ts                # demo recruiter, candidate, jobs and a finished interview
  generated/prisma/             # generated Prisma client (gitignored): npx prisma generate
  dist/                         # tsc build output (gitignored)
  tests/                        # auth | jobs | resumes | applications | interviews
    globalSetup.ts              # migrates the test DB, refuses any database not named *test*
    helpers/                    # app (supertest), db (reset), factories, aiMock, emailMock
  src/server.ts                 # entry: dotenv, loadEnv(), createApp().listen()
  src/app.ts                    # createApp(): helmet, CORS, JSON body, rate limit, request log, routers, 404 + errors
  src/shared/
    env.ts                      # loadEnv(): validates the environment at startup, exits with a list
    logger.ts                   # logger + requestLogger (JSON in production)
    authMiddleware.ts           # authMiddleware (JWT + account check → req.user), requireRole(), requireVerifiedEmail
    jwt.ts                      # signToken() / verifyToken(), HS256 only
    tokens.ts                   # one-time email tokens: createOneTimeToken(), hashToken()
    email.ts                    # sendEmail() / sendEmailInBackground() via Resend, appUrl()
    emailTemplates.ts           # verification, password reset and application-status emails
    storage.ts                  # storeUpload() / openStored() / deleteStored(): local disk or S3
    files.ts                    # sendStoredFile() / removeStoredFile() on top of storage
    errors.ts                   # HttpError + badRequest / unauthorized / notFound / conflict
    errorHandler.ts             # maps any error to a status + safe message; hides unexpected errors
    rateLimits.ts               # apiLimiter, loginLimiter, signupLimiter, emailLimiter, tokenLimiter, aiLimiter
    uploads.ts                  # multer configs: resumeUpload, audioUpload
    prisma.ts                   # shared PrismaClient + isUniqueViolation()
    http.ts                     # getParam(): read a route param as a string
    embeddings.ts               # every Gemini call (despite the name)
  src/modules/<feature>/        # auth | jobs | resumes | applications | interviews
    <feature>.routes.ts         # Router + middleware chain (auth, role, verified email, rate limit, upload)
    <feature>.controller.ts     # zod parse → service call → JSON envelope (no try/catch)
    <feature>.service.ts        # Prisma queries + business logic; throws HttpError
  uploads/{resumes,audio}/      # local storage driver's files (gitignored)
frontend/
  src/main.tsx, src/App.tsx     # bootstrap + routes, grouped by role guard and AppLayout
  src/api/                      # axiosClient.ts, files.ts (getBlob) + <feature>Api.ts per backend module
  src/pages/                    # LandingPage, NotFoundPage, auth/, candidate/, recruiter/, interview/
  src/components/common/        # AppLayout, AuthLayout, AuthRoutes, Navbar, Toaster, VerifyEmailBanner, ui.tsx, styles.ts
  src/components/interview/     # VoiceRecorder
  src/components/recruiter/     # StatusActions (shortlist / reject / undo)
  src/store/                    # authStore (+ useAuthHydrated), toastStore (+ toast.success / toast.error)
  src/utils/                    # useApiData, useDocumentTitle, errors, format, session, decodeToken, openBlob, voice, signals, applicationStatus
docker-compose.yml              # local Postgres 16
```

## Architecture

### Startup
`server.ts` loads `.env`, then `loadEnv()` validates the environment and exits with every problem listed rather than failing later in a request. A variable that is present but empty counts as unset. Production additionally requires `GEMINI_API_KEY`, `CORS_ORIGINS`, `APP_URL` and a 32-character `JWT_SECRET`; `STORAGE_DRIVER=s3` requires the bucket credentials. Application code still reads `process.env` at call time.

### Backend request flow
`router → authMiddleware → requireRole(...) → [requireVerifiedEmail] → [aiLimiter] → [multer upload] → controller → service → prisma`

- **Response envelope**: every response is `{ success: true, data }` or `{ success: false, error: string }`. File endpoints stream the file instead.
- **Errors**: controllers don't catch errors. Services throw `HttpError` (via the helpers in `shared/errors.ts`); Express 5 forwards async errors to `errorHandler`, which maps them:
  - `HttpError` → its own status and message
  - `ZodError` → 400 with `field: message` text
  - `AiServiceError` → 503
  - multer file-size error → 413; other multer errors → 400
  - malformed JSON → 400; oversized body → 413
  - anything else → 500 "Something went wrong", logged with its stack
- **Status codes**:
  - 401: missing, invalid or revoked token (e.g. issued before a password reset), or a failed login
  - 403: wrong role, or email not verified for an action that requires it
  - 404: not found *or not yours* (ownership failures don't reveal that a record exists)
  - 409: duplicates and invalid state (already applied, job closed, interview not active, deleting a job with applicants or a resume in use)
  - 429: rate limited
  - 503: Gemini unavailable
- **Ownership checks**: services first map `userId` (from the JWT) to the `Candidate` or `Recruiter` profile, then compare foreign keys and throw `notFound("... doesn't belong to you")`.
- **Route params**: read them with `getParam(req, "id")`, because Express 5 types params as `string | string[] | undefined`.
- **Lean responses**: services `select` only what pages use.
  - Never return `embedding`, full resume text, stored file references (`fileUrl`, `audioUrl`) or internal user IDs.
  - Anti-cheat signals (proctoring events, `aiLikelihoodScore`) are for recruiters only; the candidate's `GET /interviews/:sessionId` omits them.
- **Logging**: `requestLogger` writes one line per request (method, path, status, duration, user). `logger` writes JSON in production, plain text in development, and only errors during tests.
- **Frontend side**: `src/api/*` functions return `res.data.data`, and pages show errors with `errorMessage(err, fallback)`.

### File storage
`shared/storage.ts` keeps uploads either on local disk (default) or in any S3-compatible bucket (AWS S3, Cloudflare R2, Supabase Storage, MinIO) when `STORAGE_DRIVER=s3`.
- `storeUpload(localPath, { folder, contentType, fileName })` takes what multer wrote and returns the reference to store: `s3:<key>` for a bucket, or the local path. References without the prefix are local, so rows written before S3 was configured keep working.
- `openStored(ref)` streams it back and throws 404 "This file is no longer available" when it's gone; `deleteStored(ref)` removes it.
- `sendStoredFile(res, ref, ...)` in `shared/files.ts` adds the headers, including a `Content-Disposition` with the original file name.
- Local references are always checked to resolve inside `uploads/`.

### Security
- **JWT and sessions**:
  - `JWT_SECRET` is required, with no fallback: the server exits at startup without it. Tokens are HS256 only, verification pins the algorithm, and the secret is never logged.
  - `authMiddleware` also loads the user on every request. It rejects tokens for deleted users, and tokens issued before `User.passwordChangedAt`, so a password reset signs out every existing session.
- **Accounts**:
  - Emails are stored lowercase and matched case-insensitively, because older accounts may contain capitals.
  - Passwords are 8–72 characters.
  - A failed login still compares against a dummy hash, so response timing doesn't reveal which emails exist. Forgot-password gives the same answer whether or not the account exists.
- **Email tokens** (`AuthToken`): random 32-byte tokens, stored only as SHA-256 hashes. They are single-use, claimed with a conditional update so two requests can't both use one. Verification links last 24 hours and reset links 1 hour; issuing a new one deletes the user's unused tokens of that type.
- **Rate limits** (`shared/rateLimits.ts`, in-memory, per process, skipped while `NODE_ENV=test`):
  - `apiLimiter`: 600 requests per 15 min per IP, on everything except `/api/health`
  - `loginLimiter`: 10 failed logins per 15 min per IP
  - `signupLimiter`: 10 sign-ups per hour per IP
  - `emailLimiter`: 5 per hour per IP, on forgot-password and resend-verification
  - `tokenLimiter`: 20 per 15 min per IP, on reset-password and verify-email
  - `aiLimiter`: 30 requests per 10 min per user, on endpoints that call Gemini (resume upload, job create/edit, apply, interview start/answer/answer-audio)
- **CORS and headers**: only origins in `CORS_ORIGINS` can call the API from a browser (defaults to the local Vite servers). `helmet` sets security headers.
- **Uploads**: the multer filter checks the extension or MIME type, the service checks for the `%PDF-` file signature, and controllers delete the temp file whenever the request fails.
- **Prompt injection**: user-written text (resumes, job descriptions, answers) enters prompts only through `tagged()` in `embeddings.ts`, under a system instruction saying tagged text is data, not instructions.

### API (all under `/api`)
| Endpoint | Access | Purpose |
|---|---|---|
| `POST /auth/signup`, `POST /auth/login` | public (rate limited) | Return `{ token }`. Signup's `name` becomes Candidate.fullName or Recruiter.companyName, and a verification email is sent |
| `GET /auth/me` | logged in | `{ email, role, name, emailVerified }` |
| `POST /auth/forgot-password`, `POST /auth/reset-password` | public (rate limited) | Email a reset link / set a new password with `{ token, password }`, returning a fresh `{ token }` |
| `POST /auth/verify-email`, `POST /auth/resend-verification` | public / logged in | Verify with `{ token }` / email a new verification link |
| `GET /jobs`, `GET /jobs/:id` | public | Open jobs / one job (any status), with company name |
| `POST /jobs`, `GET /jobs/mine` | RECRUITER (posting needs a verified email) | Create a job / list own jobs with `applicantCount` |
| `PATCH /jobs/:id`, `PATCH /jobs/:id/status`, `DELETE /jobs/:id` | RECRUITER (owner) | Edit title/description (re-embeds) / set `OPEN` or `CLOSED` / delete (only with no applicants) |
| `POST /resumes/upload` (field `resume`), `GET /resumes/mine` | CANDIDATE | Upload a PDF / list own resumes as `{ id, fileName, createdAt, preview, applicationCount }` |
| `GET /resumes/:id/file`, `DELETE /resumes/:id` | CANDIDATE (owner) | Stream the PDF / delete (only if unused by any application) |
| `POST /applications`, `GET /applications/mine` | CANDIDATE (applying needs a verified email) | Apply (match score + skill gaps) / list own applications |
| `GET /applications/job/:jobId` | RECRUITER (owner) | `{ job, applicants }`, each applicant with contact email and signals |
| `GET /applications/:id`, `GET /applications/:id/resume`, `GET /applications/:id/answers/:answerId/audio` | RECRUITER (owner) | Applicant detail with transcript / stream the resume / stream a voice answer |
| `PATCH /applications/:id/status` | RECRUITER (owner) | Set `APPLIED`, `SHORTLISTED` or `REJECTED`; the last two email the candidate |
| `GET /interviews/by-application/:applicationId` | CANDIDATE | `{ jobTitle, companyName, interview }`, where `interview` is null until started. Read-only, never calls Gemini |
| `POST /interviews/start`, `GET /interviews/:sessionId`, `POST /interviews/:sessionId/answer`, `POST /interviews/:sessionId/answer-audio` (fields `questionId`, `audio`), `POST /interviews/:sessionId/proctoring` | CANDIDATE | Interview flow. `start` also resumes an interview that already exists |
| `GET /health` | public | Health check (not rate limited, not logged) |

### Core flows
- **Apply** (`applications.service.ts` → `applyToJob`):
  1. Embeddings are created when a resume is uploaded and when a job is posted or its text edited. `applyToJob` backfills any that are missing (e.g. the job was posted while Gemini was down) or that differ in size.
  2. The embeddings and `generateSkillGaps` run in parallel, **before** anything is written.
  3. `matchScore = round(clamp(cosineSimilarity, 0, 1) × 100)`. Similarity is computed in JS; there is no pgvector.
  4. The application and its `SkillGap` rows are saved in one nested create.
- **Jobs and resumes**:
  - Closed jobs disappear from `GET /jobs` but their details stay viewable; applying to one returns 409.
  - Editing a job's text re-embeds it, but existing applicants keep the score they applied with.
  - Jobs with applicants and resumes used in an application can't be deleted, so application history stays intact.
- **Interview** (`interviews.service.ts`, `TOTAL_QUESTIONS = 5`):
  - **State**: `startInterview` and `submitAnswer` both return an `InterviewState`: `{ session, question, totalQuestions, done, report }`. `question: null` with `done: false` means the next step failed to generate; the client retries by calling `/interviews/start` again.
  - **Start or resume**: `startInterview` generates the first `medium` question before creating the session. If a session already exists, it calls `advanceSession` instead.
  - **`advanceSession`**: returns the open question. Otherwise it generates the next question, or the final report once 5 answers exist. This also recovers sessions where an earlier request saved an answer and then failed.
  - **Each answer**:
    - `evaluateAnswer` (0–10 plus feedback, both stored) and `analyzeAnswerAuthenticity` (0–100, answers of 30+ characters only) run **before** the answer is saved.
    - A typing-speed check logs a `SUSPICIOUS_TYPING_SPEED` event when an answer over 50 characters was typed faster than 8 characters per second.
    - Voice answers are uploaded to `/answer-audio`, transcribed by Gemini and then scored like typed answers. The recording and its MIME type are kept for the recruiter, and they skip the typing-speed check.
  - **Next difficulty**: score ≥7 gives `hard`, ≤4 gives `easy`, anything else stays `medium`.
  - **After the 5th answer**: the `Report` and the `COMPLETED` status are saved in one nested update.
- **Proctoring** (`frontend/src/pages/interview/InterviewPage.tsx`) logs three events while a question is on screen:
  - `TAB_SWITCH` on `visibilitychange`
  - `COPY_PASTE` on document copy or paste
  - `PASTE_BLOCKED_IN_ANSWER` when a paste into the answer box is blocked

  The API accepts only these three from clients; `SUSPICIOUS_TYPING_SPEED` is created server-side. Candidates agree to this on a pre-interview screen. Recruiters see counts and average AI-likeness (`utils/signals.ts`), labelled as signals for review, not conclusions.
- **Email** (`shared/email.ts`, `shared/emailTemplates.ts`):
  - Sign-up and resend-verification send a verification link; forgot-password sends a reset link; shortlisting or rejecting sends the candidate a status email (moving back to `APPLIED` doesn't).
  - All of these use `sendEmailInBackground`, so a failed email never fails the request. Links point at `APP_URL`.
- **Gemini calls** (`shared/embeddings.ts`):
  - `generateJson` asks for JSON mode with a JSON Schema built from zod (`z.toJSONSchema`), then validates the reply with the same schema.
  - `withRetries` makes up to 3 attempts. It retries 5xx errors, network errors and invalid output with exponential backoff. For 429s it waits the `retryDelay` Gemini returns, but gives up if that's over 20s or if the daily quota is exhausted. Other 4xx errors (bad key, unknown model) fail immediately.
  - Final failures throw `AiServiceError`, whose message is safe to show users.
  - `analyzeAnswerAuthenticity` returns `null` instead of throwing.

### Data model (`backend/prisma/schema.prisma`)
- **User** (`role`, `emailVerifiedAt`, `passwordChangedAt`) has one **Candidate** or one **Recruiter**, and **AuthToken**[] (one-time email tokens)
  - Recruiter → **JobPosting**[]
  - Candidate → **Resume**[] (with original `fileName`) and **Application**[]
- **Application** (unique on `candidateId` + `jobId`) → **SkillGap**[] and one **InterviewSession**
- **InterviewSession** → **InterviewQuestion**[] (unique on `sessionId` + `orderIndex`; each with one **InterviewAnswer** holding `score`, `feedback`, `aiLikelihoodScore` and optional `audioUrl` / `audioMimeType`), **ProctoringEvent**[] and one **Report**
- **Resume** and **JobPosting** store embeddings as `Float[]` columns
- JobPosting, Resume, Application and InterviewAnswer have `createdAt`; JobPosting and Application also have `updatedAt`
- **Delete rules**: every relation cascades, so deleting a `User` removes their profile, jobs, resumes, applications and interviews. The product rules (a job with applicants, or a resume used in an application, can't be deleted) are enforced in the services, not the database.
- **Indexes**: foreign-key columns are indexed (Postgres doesn't do it automatically), plus `JobPosting(status, createdAt)` for the public job list.

**Enums** (statuses the app controls are database enums, so an invalid value can't be written):
- `Role`: `CANDIDATE` | `RECRUITER`
- `AuthTokenType`: `EMAIL_VERIFICATION` | `PASSWORD_RESET`
- `JobStatus`: `OPEN` | `CLOSED`
- `ApplicationStatus`: `APPLIED` | `SHORTLISTED` | `REJECTED`
- `InterviewStatus`: `PENDING` | `IN_PROGRESS` | `COMPLETED`
- `ProctoringEventType`: `TAB_SWITCH` | `COPY_PASTE` | `PASTE_BLOCKED_IN_ANSWER` | `SUSPICIOUS_TYPING_SPEED`

Values the model produces stay strings, since Gemini could return something new: `InterviewQuestion.difficulty` (`easy` | `medium` | `hard`) and `SkillGap.importance` (`high` | `medium` | `low`).

### Frontend
- **Routes** (`App.tsx`):
  - Public: `/` (landing), `/login`, `/signup` (`?role=RECRUITER` preselects) and `/forgot-password` are `GuestOnly`, which sends signed-in users to their dashboard. `/reset-password` and `/verify-email` (email links) work whether or not you're signed in. Anything else shows `NotFoundPage`.
  - Candidate (`RequireAuth role="CANDIDATE"`): `/candidate/dashboard`, `/candidate/jobs`, `/candidate/jobs/:jobId`, `/candidate/applications`, `/candidate/interview/:applicationId`.
  - Recruiter (`RequireAuth role="RECRUITER"`): `/recruiter/dashboard`, `/recruiter/jobs/:jobId/applicants`, `/recruiter/applications/:applicationId`.
  - Signed-out users go to `/login` and come back afterwards (via `location.state.from`). Guards are UX only: the backend enforces auth and roles on every request.
- **AppLayout** wraps every signed-in page: it loads `/auth/me` into `authStore.profile`, and renders the navbar and, until the email is verified, `VerifyEmailBanner`.
- **Session**: the role comes from the JWT payload (`readSession` also checks expiry and clears expired tokens). `useAuthHydrated()` waits for the persisted store. The axios response interceptor signs out and redirects to `/login` on any 401 except a failed login.
- **Page pattern**:
  - Load data with `useApiData(load, deps)`, which returns `{ data, error, loading, reload, setData }`, and render `LoadingState` / `ErrorMessage` / `EmptyState` from `ui.tsx`.
  - Apply local changes with `setData`.
  - Report outcomes with `toast.success` / `toast.error`, and set the tab title with `useDocumentTitle`.
- **Protected files**: resumes and recordings need the token, so they're fetched as blobs with `getBlob`. `openInNewTab` shows a PDF (the tab is opened during the click so popup blockers allow it); recordings play from a blob URL.
- **Interview page states**: intro and consent (no session yet) → question (type, or speak with `VoiceRecorder`, which uses MediaRecorder with WebM/Ogg/MP4 depending on the browser) → "next step pending" retry → completed, with the report and the candidate's own transcript.
- **Unused files**: `src/App.css` and `src/assets/*` are leftovers from the Vite template.

## Running locally
**Prerequisites**: Node ^20.19 or ≥22.12 (required by Vite 8), npm, Postgres (Docker or hosted) and a Gemini API key.

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`; both list every variable with notes. The required ones are `DATABASE_URL`, `JWT_SECRET` and `GEMINI_API_KEY`, plus `VITE_API_URL` on the frontend.

```bash
# optional local DB (repo root)
docker compose up -d

# backend
cd backend
npm install
npx prisma generate        # required after install and after any schema change
npx prisma migrate deploy  # apply migrations to the DB in DATABASE_URL
npm run seed               # optional demo accounts, jobs and a finished interview
npm run dev                # tsx watch src/server.ts → http://localhost:5000
npm test                   # vitest (needs a test database, see below)
npm run typecheck          # src, then tests + seed + config
npm run build              # prisma generate && tsc → dist/
npm start                  # node dist/server.js

# frontend (separate terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
npm run build              # tsc -b && vite build
npm run lint               # oxlint
```

`npm run seed` creates `demo-recruiter@hiremind.test` and `demo-candidate@hiremind.test`, password `demo-password-123`, both verified, with one finished interview and one still to take. It refuses to run with `NODE_ENV=production` unless passed `--force`.

**Health check**: `GET http://localhost:5000/api/health` returns `{"status":"ok"}`.

## Testing and type-checking
- **Backend tests**: `npm test` runs Vitest + Supertest against a real Postgres, with Gemini and email mocked, so they need no keys and cost nothing.
  ```bash
  docker run --rm -d --name hiremind-test-db -e POSTGRES_USER=hiremind -e POSTGRES_PASSWORD=hiremind_test -e POSTGRES_DB=hiremind_test -p 55432:5432 postgres:16
  cd backend && DATABASE_URL=postgresql://hiremind:hiremind_test@localhost:55432/hiremind_test npm test
  ```
  - `tests/globalSetup.ts` applies migrations and refuses any database whose name doesn't contain "test". `resetDatabase()` truncates between tests, and files run one at a time.
  - Mock the AI and email modules with the helpers, which is what keeps the suite free and deterministic:
    ```ts
    vi.mock("../src/shared/embeddings", async () => (await import("./helpers/aiMock")).embeddingsMock());
    vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());
    ```
  - `helpers/factories.ts` creates users (verified by default), jobs, resumes and applications; `helpers/emailMock.ts` exposes `tokenFromEmail()` so verification and reset flows can be tested end to end.
  - Rate limits are skipped while `NODE_ENV=test`, which vitest sets.
- **Type-checking**: `npm run typecheck` runs twice, because the build only covers `src/`: once with `tsconfig.json` (CommonJS, what ships) and once with `tsconfig.test.json` (bundler resolution, covering `tests/`, `prisma/seed.ts` and the vitest config).
- **Frontend**: `npm run build` type-checks with `tsc -b`; keep `npm run lint` free of warnings.
- **CI** (`.github/workflows/ci.yml`): backend job runs a Postgres service, `prisma migrate deploy`, both type-checks and the tests; frontend job runs lint and build. No secrets required.
- **Dependencies**: `npm audit --omit=dev` is clean on the frontend. The backend's only remaining advisory is `deepmerge-ts` inside the Prisma CLI, which can only be fixed by downgrading Prisma.

## Gotchas
- **Migrations only, never `db push`.**
  - Change the schema with `npx prisma migrate dev --name <change>` locally, and apply it with `npx prisma migrate deploy` everywhere else.
  - **Read every generated migration before committing it.** Prisma's diff turns a column type change (e.g. text → enum) into `DROP COLUMN` + `ADD COLUMN`, which silently wipes that column. `20260912090000_phase4_enums_indexes_cascades` is hand-written to convert in place with `ALTER COLUMN ... TYPE ... USING`, after normalising unexpected values.
  - `20260910090000_sync_schema_and_unique_question_order` captured columns that earlier `db push` usage had added, using `IF NOT EXISTS`.
  - `20260911100017_phase3_features` marks every account that existed at the time as email-verified.
- **After editing `schema.prisma`**, run `npx prisma generate`. Otherwise the client in `generated/prisma` is stale.
- **`shared/embeddings.ts` is misnamed.** It holds every Gemini call: embeddings, skill gaps, question generation, answer scoring, AI-likeness, the report and audio transcription. Put new LLM calls there, using `generateJson` / `withRetries`, and pass user-written text through `tagged()`.
- **Gemini free-tier quota.** A free-tier key allows 5 `gemini-3.6-flash` generate calls per minute and **20 per day** per project (observed 2026-09-10; embeddings have a separate quota).
  - One application makes 1 generate call; one full interview makes about 11–13, plus one per voice answer for transcription.
  - So the free tier covers roughly one interview a day. Real use needs a paid tier.
  - Tests mock Gemini; anything that really calls it must be paced.
- **Resend sender**:
  - The default `onboarding@resend.dev` sender only delivers to the Resend account owner's own address.
  - To email real users, verify a domain in Resend and set `EMAIL_FROM` to an address on it.
  - Without `RESEND_API_KEY`, development prints the email (links included) and production skips it with a warning.
- **Env loading order**:
  - `server.ts` runs `dotenv.config({ override: true })`, so values in `.env` override real environment variables.
  - Read env vars at call time, never in module-level constants (see `createApp()` in `app.ts`, `getJwtSecret` in `jwt.ts`, `getClient` in `embeddings.ts`, `appUrl` in `email.ts` and the storage driver in `storage.ts`).
- **Uploads**:
  - With the default local driver, start the backend from `backend/`: multer's paths (`uploads/resumes/`, `uploads/audio/`) are relative to the working directory.
  - Hosts with an ephemeral disk lose those files on redeploy, and the API then returns 404 "This file is no longer available". Use `STORAGE_DRIVER=s3`, or mount a volume at `/app/uploads`.
- **Deploying the backend** (see README for the full walkthrough): build `backend/Dockerfile`, set `CORS_ORIGINS`, `APP_URL` and `TRUST_PROXY`, and run `npm run migrate:deploy` as the release step.
- **Rate limits are in memory.** They reset when the server restarts, and multiple backend instances would need a shared store (e.g. Redis).
- **`backend/skills-lock.json`** is a lockfile for Prisma agent skills, not a runtime dependency.

## Conventions
- **New backend feature**: add `src/modules/<name>/` with the routes/controller/service trio, mount it in `createApp()` in `app.ts` as `/api/<name>`, and add a `tests/<name>.test.ts`.
- **Layering**:
  - zod validation lives in controllers. Controllers don't use try/catch, except to delete an uploaded temp file before rethrowing.
  - Prisma calls live only in services.
  - Services throw `badRequest` / `unauthorized` / `notFound` / `conflict`; never put internal details in those messages.
- **AI before writes**: call Gemini before saving anything, and save related rows with one nested create or update. A failed AI call must never leave partial records behind. Use `isUniqueViolation(err)` to handle duplicate or concurrent requests.
- **Protected routes**:
  - Use `authMiddleware, requireRole(...)`. Add `requireVerifiedEmail` for actions that depend on a reachable email, and `aiLimiter` if the handler calls Gemini.
  - Cast the request to `AuthRequest` to read `req.user!.userId`, and read route params with `getParam`.
- **Responses**: `select` only the fields the page uses. Serve uploads through `sendStoredFile`, never by exposing their reference.
- **Uploads**: save them with `storeUpload` and delete them with `removeStoredFile`, so both storage drivers keep working.
- **Emails**: add a template to `emailTemplates.ts` (user-written text goes through `oneLine` / `escapeHtml`) and send it with `sendEmailInBackground`.
- **Logging**: use `logger.info` / `warn` / `error` with a message and fields, not `console.*` (the one exception is the development email printout, which is meant to be read as text).
- **Frontend API calls**: add one typed function per endpoint in `src/api/<feature>Api.ts`, built on the shared `api` instance (`getBlob` for protected files).
- **Frontend pages**:
  - Put new pages inside the matching `RequireAuth` + `AppLayout` group in `App.tsx`.
  - Load data with `useApiData`, build from `ui.tsx` components and `styles.ts` classes, and give feedback with `toast`.
  - Keep non-component helpers in `utils/`, so component files only export components.
- **Git**: the default branch is `master` and the remote is named `HireMind`, not `origin`.
