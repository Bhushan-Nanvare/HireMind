import { Link } from "react-router-dom";
import { buttonPrimary, buttonSecondary } from "../components/common/styles";
import { useDocumentTitle } from "../utils/useDocumentTitle";

const FEATURES = [
  {
    title: "Resume match scores",
    body: "Every application is compared with the job description, with a match score and the specific skills that are missing.",
  },
  {
    title: "Adaptive AI interviews",
    body: "Five questions tailored to the role and the resume. Each gets harder or easier based on the last answer, typed or spoken.",
  },
  {
    title: "Signals, not verdicts",
    body: "Recruiters see tab switches, blocked pastes and AI-likeness estimates as review aids, next to the full transcript.",
  },
];

const STEPS = {
  candidates: ["Upload your resume", "Apply and see how well you match", "Take a short AI interview and get feedback on each answer"],
  recruiters: ["Post a job", "See applicants ranked by resume match", "Review transcripts and signals, then shortlist"],
};

export default function LandingPage() {
  useDocumentTitle("");

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="font-semibold text-slate-900">HireMind AI</span>
        <div className="flex items-center gap-2">
          <Link to="/login" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            Log in
          </Link>
          <Link to="/signup" className={buttonPrimary}>
            Sign up
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            AI-assisted screening for faster, fairer hiring
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            HireMind matches resumes to your job, runs a short adaptive interview, and gives you a ranked list with
            transcripts to review.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signup?role=RECRUITER" className={buttonPrimary}>
              I'm hiring
            </Link>
            <Link to="/signup?role=CANDIDATE" className={buttonSecondary}>
              I'm looking for a job
            </Link>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 sm:grid-cols-3 sm:px-6">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <h2 className="font-semibold text-slate-900">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6">
          <StepList title="For candidates" steps={STEPS.candidates} />
          <StepList title="For recruiters" steps={STEPS.recruiters} />
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">HireMind AI</footer>
    </div>
  );
}

function StepList({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-sm text-slate-600">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
