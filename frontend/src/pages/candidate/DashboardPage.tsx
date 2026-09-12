import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { listMyApplications } from "../../api/applicationsApi";
import { deleteResume, fetchResumeFile, listMyResumes, uploadResume, type ResumeSummary } from "../../api/resumeApi";
import { buttonDanger, buttonSecondary } from "../../components/common/styles";
import { Card, EmptyState, ErrorMessage, LoadingState, PageHeader } from "../../components/common/ui";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/errors";
import { formatDate, plural } from "../../utils/format";
import { openInNewTab } from "../../utils/openBlob";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

const shortcutClass = "block rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm";

export default function CandidateDashboardPage() {
  useDocumentTitle("Dashboard");
  const profile = useAuthStore((s) => s.profile);
  const resumes = useApiData(listMyResumes, [], "Couldn't load your resumes.");
  const applications = useApiData(listMyApplications, [], "Couldn't load your applications.");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const firstName = profile?.name.split(" ")[0];
  const unfinishedInterviews = (applications.data ?? []).filter((a) => a.interviewSession?.status !== "COMPLETED").length;

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError("");
    try {
      await uploadResume(file);
      toast.success(`${file.name} uploaded.`);
      resumes.reload();
    } catch (err) {
      setUploadError(errorMessage(err, "Upload failed. Please try again."));
    } finally {
      setUploading(false);
    }
  }

  function handleView(resume: ResumeSummary) {
    openInNewTab(() => fetchResumeFile(resume.id), resume.fileName).catch((err) =>
      toast.error(errorMessage(err, "Couldn't open the resume."))
    );
  }

  async function handleDelete(resume: ResumeSummary) {
    if (!window.confirm(`Delete ${resume.fileName}? This can't be undone.`)) return;
    setDeletingId(resume.id);
    try {
      await deleteResume(resume.id);
      resumes.setData((prev) => prev && prev.filter((r) => r.id !== resume.id));
      toast.success(`${resume.fileName} deleted.`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the resume."));
    } finally {
      setDeletingId(null);
    }
  }

  function renderResumes() {
    if (resumes.error) return <ErrorMessage message={resumes.error} />;
    if (!resumes.data) return <LoadingState />;
    if (resumes.data.length === 0) {
      return <EmptyState title="No resumes yet" description="Upload one above to start applying for jobs." />;
    }
    return (
      <ul className="space-y-3">
        {resumes.data.map((resume) => {
          const inUse = resume.applicationCount > 0;
          return (
            <li key={resume.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{resume.fileName}</p>
                    <p className="text-xs text-slate-500">
                      Uploaded {formatDate(resume.createdAt)}
                      {inUse && ` · Used in ${plural(resume.applicationCount, "application")}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleView(resume)} className={buttonSecondary}>
                      View
                    </button>
                    <button
                      onClick={() => handleDelete(resume)}
                      disabled={deletingId === resume.id || inUse}
                      title={inUse ? "Resumes used in an application can't be deleted" : undefined}
                      className={buttonDanger}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {resume.preview && <p className="mt-3 line-clamp-2 text-sm text-slate-500">{resume.preview}</p>}
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
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description="Upload a resume, apply for jobs and complete your AI interviews."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Link to="/candidate/jobs" className={shortcutClass}>
          <p className="font-medium text-slate-900">Browse open jobs →</p>
          <p className="mt-1 text-sm text-slate-500">See how well your resume matches before you apply.</p>
        </Link>
        <Link to="/candidate/applications" className={shortcutClass}>
          <p className="font-medium text-slate-900">My applications →</p>
          <p className="mt-1 text-sm text-slate-500">
            {applications.data
              ? `${plural(applications.data.length, "application")}${
                  unfinishedInterviews > 0 ? ` · ${plural(unfinishedInterviews, "interview")} to finish` : ""
                }`
              : "Track your applications and interviews."}
          </p>
        </Link>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Your resumes</h2>
      <label className="mb-3 block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-slate-400 focus-within:border-slate-500">
        <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handleUpload} disabled={uploading} />
        <p className="text-sm font-medium text-slate-700">
          {uploading ? "Uploading and reading your resume…" : "Upload a PDF resume"}
        </p>
        <p className="mt-1 text-xs text-slate-400">Text-based PDF, up to 5 MB</p>
      </label>
      <div className="mb-4">
        <ErrorMessage message={uploadError} />
      </div>

      {renderResumes()}
    </>
  );
}
