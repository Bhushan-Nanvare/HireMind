import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listMyApplications } from "../../api/applicationsApi";
import { listJobs } from "../../api/jobsApi";
import { inputClass } from "../../components/common/styles";
import { Badge, EmptyState, ErrorMessage, LoadingState, PageHeader } from "../../components/common/ui";
import { formatDate } from "../../utils/format";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

export default function JobsPage() {
  useDocumentTitle("Jobs");
  const jobs = useApiData(listJobs, [], "Couldn't load jobs.");
  const applications = useApiData(listMyApplications, [], "Couldn't load your applications.");
  const [query, setQuery] = useState("");

  const appliedJobIds = useMemo(
    () => new Set((applications.data ?? []).map((application) => application.jobPosting.id)),
    [applications.data]
  );

  const visibleJobs = useMemo(() => {
    const words = query.trim().toLowerCase();
    const all = jobs.data ?? [];
    if (!words) return all;
    return all.filter((job) => `${job.title} ${job.recruiter.companyName} ${job.description}`.toLowerCase().includes(words));
  }, [jobs.data, query]);

  function renderJobs() {
    if (jobs.error) return <ErrorMessage message={jobs.error} />;
    if (!jobs.data) return <LoadingState />;
    if (visibleJobs.length === 0) {
      return query ? (
        <EmptyState title="No jobs match your search" description="Try a different keyword." />
      ) : (
        <EmptyState title="No open positions right now" description="Check back soon." />
      );
    }
    return (
      <ul className="space-y-3">
        {visibleJobs.map((job) => (
          <li key={job.id}>
            <Link
              to={`/candidate/jobs/${job.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium text-slate-900">{job.title}</h2>
                  <p className="text-sm text-slate-500">
                    {job.recruiter.companyName} · Posted {formatDate(job.createdAt)}
                  </p>
                </div>
                {appliedJobIds.has(job.id) && <Badge tone="blue">Applied</Badge>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{job.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <PageHeader title="Open positions" description="Find a role, see how well your resume matches, and apply." />
      <div className="mb-5">
        <label htmlFor="job-search" className="sr-only">
          Search jobs
        </label>
        <input
          id="job-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, company or keyword"
          className={inputClass}
        />
      </div>
      {renderJobs()}
    </>
  );
}
