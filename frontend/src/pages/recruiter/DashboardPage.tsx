import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createJob, deleteJob, listMyJobs, setJobStatus, updateJob, type OwnJob } from "../../api/jobsApi";
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass, labelClass } from "../../components/common/styles";
import { Card, EmptyState, ErrorMessage, JobStatusBadge, LoadingState, PageHeader } from "../../components/common/ui";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/errors";
import { formatDate, plural } from "../../utils/format";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

function JobForm({
  initialTitle = "",
  initialDescription = "",
  submitLabel,
  savingLabel,
  onSubmit,
  onCancel,
}: {
  initialTitle?: string;
  initialDescription?: string;
  submitLabel: string;
  savingLabel: string;
  onSubmit: (title: string, description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit(title.trim(), description.trim());
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the job. Please try again."));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="job-title" className={labelClass}>
          Job title
        </label>
        <input
          id="job-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          maxLength={200}
          required
        />
      </div>
      <div>
        <label htmlFor="job-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="job-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          maxLength={10000}
          className={inputClass}
          placeholder="Responsibilities, required skills and experience. Candidates' resumes are matched against this."
          required
        />
      </div>
      <ErrorMessage message={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={buttonPrimary}>
          {saving ? savingLabel : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={buttonSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function RecruiterDashboardPage() {
  useDocumentTitle("Job postings");
  const jobs = useApiData(listMyJobs, [], "Couldn't load your job postings.");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function replaceJob(updated: OwnJob) {
    jobs.setData((prev) => prev && prev.map((job) => (job.id === updated.id ? updated : job)));
  }

  async function handleCreate(title: string, description: string) {
    const created = await createJob(title, description);
    jobs.setData((prev) => [created, ...(prev ?? [])]);
    setCreating(false);
    toast.success(`"${created.title}" is live.`);
  }

  async function handleUpdate(job: OwnJob, title: string, description: string) {
    replaceJob(await updateJob(job.id, title, description));
    setEditingId(null);
    toast.success("Job updated.");
  }

  async function handleToggleStatus(job: OwnJob) {
    const closing = job.status === "OPEN";
    setBusyId(job.id);
    try {
      replaceJob(await setJobStatus(job.id, closing ? "CLOSED" : "OPEN"));
      toast.success(closing ? `"${job.title}" is closed to new applications.` : `"${job.title}" is open again.`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the job."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(job: OwnJob) {
    if (!window.confirm(`Delete "${job.title}"? This can't be undone.`)) return;
    setBusyId(job.id);
    try {
      await deleteJob(job.id);
      jobs.setData((prev) => prev && prev.filter((j) => j.id !== job.id));
      toast.success(`"${job.title}" deleted.`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the job."));
    } finally {
      setBusyId(null);
    }
  }

  function renderJobs() {
    if (jobs.error) return <ErrorMessage message={jobs.error} />;
    if (!jobs.data) return <LoadingState />;
    if (jobs.data.length === 0 && !creating) {
      return (
        <EmptyState
          title="No job postings yet"
          description="Post your first job to start receiving applications."
          action={
            <button onClick={() => setCreating(true)} className={buttonPrimary}>
              Post a job
            </button>
          }
        />
      );
    }
    return (
      <ul className="space-y-4">
        {jobs.data.map((job) => {
          const hasApplicants = job.applicantCount > 0;
          return (
            <li key={job.id}>
              <Card>
                {editingId === job.id ? (
                  <JobForm
                    initialTitle={job.title}
                    initialDescription={job.description}
                    submitLabel="Save changes"
                    savingLabel="Saving…"
                    onSubmit={(title, description) => handleUpdate(job, title, description)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-medium text-slate-900">{job.title}</h2>
                          <JobStatusBadge status={job.status} />
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          Posted {formatDate(job.createdAt)} · {plural(job.applicantCount, "applicant")}
                        </p>
                      </div>
                      <Link to={`/recruiter/jobs/${job.id}/applicants`} className={buttonPrimary}>
                        View applicants
                      </Link>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">{job.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button onClick={() => setEditingId(job.id)} className={buttonSecondary}>
                        Edit
                      </button>
                      <button onClick={() => handleToggleStatus(job)} disabled={busyId === job.id} className={buttonSecondary}>
                        {job.status === "OPEN" ? "Close job" : "Reopen job"}
                      </button>
                      <button
                        onClick={() => handleDelete(job)}
                        disabled={busyId === job.id || hasApplicants}
                        title={hasApplicants ? "Jobs with applicants can't be deleted. Close the job instead." : undefined}
                        className={buttonDanger}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <PageHeader
        title="Job postings"
        description="Post jobs, review applicants and keep listings up to date."
        actions={
          !creating && (
            <button onClick={() => setCreating(true)} className={buttonPrimary}>
              Post a job
            </button>
          )
        }
      />

      {creating && (
        <Card className="mb-6">
          <h2 className="mb-4 font-semibold text-slate-900">New job posting</h2>
          <JobForm
            submitLabel="Post job"
            savingLabel="Posting…"
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      {renderJobs()}
    </>
  );
}
