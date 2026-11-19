import { useState } from "react";
import { Link } from "react-router-dom";
import { searchCandidatePool, type PoolCandidate } from "../../api/jobsApi";
import { buttonSecondary } from "../common/styles";
import { Badge, Card, ErrorMessage, LoadingState } from "../common/ui";
import { errorMessage } from "../../utils/errors";
import { plural } from "../../utils/format";

export default function CandidatePool({ jobId }: { jobId: string }) {
  const [results, setResults] = useState<PoolCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    setLoading(true);
    setError("");
    try {
      setResults(await searchCandidatePool(jobId));
    } catch (err) {
      setError(errorMessage(err, "Couldn't search the candidate pool."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 border-t border-slate-200 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Candidate pool</h2>
          <p className="text-sm text-slate-500">
            Everyone who has uploaded a resume, ranked against this job — including people who haven't applied.
          </p>
        </div>
        <button type="button" onClick={search} disabled={loading} className={buttonSecondary}>
          {loading ? "Searching…" : results ? "Search again" : "Search"}
        </button>
      </div>

      <div className="mt-3">
        <ErrorMessage message={error} />
      </div>

      {loading && !results && <LoadingState label="Ranking candidates…" />}

      {results && results.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No resumes have been uploaded yet.</p>
      )}

      {results && results.length > 0 && (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {plural(results.length, "candidate")}, best match first. Contact details stay hidden until someone
            applies.
          </p>
          <ul className="mt-2 space-y-3">
            {results.map((candidate) => (
              <li key={candidate.candidateId}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900">{candidate.fullName}</p>
                    <Badge tone={candidate.matchScore >= 70 ? "green" : "slate"}>{candidate.matchScore}% match</Badge>
                  </div>
                  {candidate.evidence && (
                    <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-sm italic text-slate-600">
                      {candidate.evidence}
                    </blockquote>
                  )}
                  {candidate.applicationId ? (
                    <Link
                      to={`/recruiter/applications/${candidate.applicationId}`}
                      className="mt-3 inline-block text-sm font-medium text-slate-900 underline"
                    >
                      Already applied — open their application
                    </Link>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">Hasn't applied to this job</p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
