import type { ApplicationStatus } from "../../api/applicationsApi";
import { buttonDanger, buttonSecondary, buttonSuccess } from "../common/styles";

/** Shortlist / reject / undo buttons for an application, hiding the one that matches its current status. */
export default function StatusActions({
  status,
  busy,
  onChange,
}: {
  status: ApplicationStatus;
  busy: boolean;
  onChange: (status: ApplicationStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "SHORTLISTED" && (
        <button onClick={() => onChange("SHORTLISTED")} disabled={busy} className={buttonSuccess}>
          Shortlist
        </button>
      )}
      {status !== "REJECTED" && (
        <button onClick={() => onChange("REJECTED")} disabled={busy} className={buttonDanger}>
          Reject
        </button>
      )}
      {status !== "APPLIED" && (
        <button onClick={() => onChange("APPLIED")} disabled={busy} className={buttonSecondary}>
          Undo decision
        </button>
      )}
    </div>
  );
}
