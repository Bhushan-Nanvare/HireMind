import { useState, type ChangeEvent, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { getJob } from "../../api/jobsApi";
import {
  addQuestion,
  deleteQuestion,
  getBuilder,
  importQuestions,
  saveTest,
  updateQuestion,
  type BuilderData,
  type BuilderQuestion,
  type TestSettings,
} from "../../api/mcqApi";
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from "../../components/common/styles";
import { BackLink, Badge, Card, ErrorMessage, LoadingState, PageHeader } from "../../components/common/ui";
import QuestionForm from "../../components/recruiter/QuestionForm";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/errors";
import { plural } from "../../utils/format";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

const DEFAULTS: TestSettings = {
  title: "Screening assessment",
  durationMinutes: 20,
  questionCount: 10,
  passPercent: 60,
  showResult: true,
  published: false,
};

const CSV_EXAMPLE = `question,A,B,C,D,correct,topic
What does the I in ACID stand for?,Isolation,Integrity,Indexing,Idempotence,A,PostgreSQL
Which of these are built into Node.js?,http,express,crypto,lodash,A|C,Node.js`;

function SettingsForm({ jobId, data, onSaved }: { jobId: string; data: BuilderData; onSaved: () => void }) {
  const current = data.test ?? DEFAULTS;
  const [values, setValues] = useState({
    title: current.title,
    durationMinutes: String(current.durationMinutes),
    questionCount: String(current.questionCount),
    passPercent: String(current.passPercent),
    showResult: current.showResult,
    published: current.published,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues({ ...values, [key]: value });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveTest(jobId, {
        title: values.title,
        durationMinutes: Number(values.durationMinutes),
        questionCount: Number(values.questionCount),
        passPercent: Number(values.passPercent),
        showResult: values.showResult,
        published: values.published,
      });
      toast.success("Assessment saved");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the assessment."));
    } finally {
      setSaving(false);
    }
  }

  const number = (id: string, label: string, key: "durationMinutes" | "questionCount" | "passPercent", max: number) => (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={key === "passPercent" ? 0 : 1}
        max={max}
        value={values[key]}
        onChange={(event) => set(key, event.target.value)}
        className={inputClass}
        required
      />
    </div>
  );

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Settings</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="test-title" className={labelClass}>
            Title
          </label>
          <input
            id="test-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={120}
            className={inputClass}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {number("test-duration", "Time limit (minutes)", "durationMinutes", 240)}
          {number("test-count", "Questions per candidate", "questionCount", 100)}
          {number("test-pass", "Pass mark (%)", "passPercent", 100)}
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.showResult}
            onChange={(event) => set("showResult", event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>Show candidates their score when they finish</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.published}
            onChange={(event) => set("published", event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Open to candidates. Needs at least as many questions in the pool as each candidate gets; each one draws a
            different random set, in a different order.
          </span>
        </label>
        <ErrorMessage message={error} />
        <button type="submit" disabled={saving} className={buttonPrimary}>
          {saving ? "Saving…" : data.test ? "Save settings" : "Create assessment"}
        </button>
      </form>
    </Card>
  );
}

function ImportPanel({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setCsv(await file.text());
    event.target.value = "";
  }

  async function handleImport() {
    setImporting(true);
    setError("");
    try {
      const added = await importQuestions(jobId, csv);
      toast.success(`Imported ${plural(added, "question")}`);
      setCsv("");
      onAdded();
    } catch (err) {
      setError(errorMessage(err, "Couldn't import that file."));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Paste a CSV, or choose a file saved from Excel or Google Sheets. The first row is a header. <code>correct</code>{" "}
        is a letter, or several joined with <code>|</code> for “select all that apply”. Up to six options (A–F). If
        any row is wrong, nothing is imported and the rows to fix are listed.
      </p>
      <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{CSV_EXAMPLE}</pre>
      <textarea
        value={csv}
        onChange={(event) => setCsv(event.target.value)}
        rows={8}
        aria-label="Questions as CSV"
        className={`${inputClass} font-mono text-xs`}
      />
      <p className="whitespace-pre-line text-sm text-red-600" role="alert">
        {error}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleImport} disabled={importing || !csv.trim()} className={buttonPrimary}>
          {importing ? "Importing…" : "Import questions"}
        </button>
        <label className={`${buttonSecondary} cursor-pointer`}>
          Choose a file
          <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} className="sr-only" />
        </label>
      </div>
    </div>
  );
}

function QuestionRow({
  question,
  number,
  locked,
  onChanged,
}: {
  question: BuilderQuestion;
  number: number;
  locked: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this question?")) return;
    try {
      await deleteQuestion(question.id);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the question."));
    }
  }

  if (editing) {
    return (
      <Card>
        <QuestionForm
          initial={question}
          submitLabel="Save question"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateQuestion(question.id, input);
            setEditing(false);
            onChanged();
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-slate-900">
          {number}. {question.text}
        </p>
        {question.topic && <Badge>{question.topic}</Badge>}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {question.options.map((option, index) => (
          <li key={index} className={question.correct.includes(index) ? "font-medium text-green-700" : "text-slate-600"}>
            {question.correct.includes(index) ? "✓" : "○"} {option}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          {question.shown > 0
            ? `Answered correctly by ${question.correctCount} of ${question.shown} (${Math.round((question.correctCount / question.shown) * 100)}%)`
            : "Not taken yet"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={locked}
            title={locked ? "Candidates have already taken this assessment" : undefined}
            className={buttonSecondary}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={locked}
            title={locked ? "Candidates have already taken this assessment" : undefined}
            className={buttonSecondary}
          >
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function AssessmentBuilderPage() {
  const { jobId = "" } = useParams();
  const builder = useApiData(() => getBuilder(jobId), [jobId], "Couldn't load the assessment.");
  const job = useApiData(() => getJob(jobId), [jobId], "Couldn't load the job.");
  const [mode, setMode] = useState<"import" | "single">("import");
  useDocumentTitle(job.data ? `Assessment: ${job.data.title}` : "Assessment");

  const back = <BackLink to={`/recruiter/jobs/${jobId}/applicants`}>Applicants</BackLink>;
  if (builder.error) {
    return (
      <>
        {back}
        <div className="mt-4">
          <ErrorMessage message={builder.error} />
        </div>
      </>
    );
  }
  if (!builder.data) return <LoadingState label="Loading the assessment…" />;

  const { test, questions } = builder.data;
  const locked = (test?.attemptCount ?? 0) > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        back={back}
        title={job.data?.title ?? "Assessment"}
        description="Multiple-choice questions, graded automatically with no AI involved."
        actions={test && <Badge tone={test.published ? "green" : "slate"}>{test.published ? "Open to candidates" : "Draft"}</Badge>}
      />

      <SettingsForm
        key={test ? `${test.title}-${test.published}` : "new"}
        jobId={jobId}
        data={builder.data}
        onSaved={builder.reload}
      />

      {test && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">Add questions</h2>
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="How to add">
                {(["import", "single"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => setMode(option)}
                    className={`rounded px-3 py-1.5 ${mode === option ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    {option === "import" ? "Import CSV" : "One at a time"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              {mode === "import" ? (
                <ImportPanel jobId={jobId} onAdded={builder.reload} />
              ) : (
                <QuestionForm
                  submitLabel="Add question"
                  onSubmit={async (input) => {
                    await addQuestion(jobId, input);
                    toast.success("Question added");
                    builder.reload();
                  }}
                />
              )}
            </div>
          </Card>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Question pool ({questions.length})
              {questions.length > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  each candidate gets {Math.min(test.questionCount, questions.length)}
                </span>
              )}
            </h2>
            {questions.length === 0 ? (
              <p className="text-sm text-slate-500">No questions yet. Import a CSV or add one above.</p>
            ) : (
              <ol className="space-y-3">
                {questions.map((question, index) => (
                  <li key={question.id}>
                    <QuestionRow question={question} number={index + 1} locked={locked} onChanged={builder.reload} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
