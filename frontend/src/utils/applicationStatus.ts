import type { ApplicationStatus } from "../api/applicationsApi";

/** Asks before a status change that emails the candidate. Returns false if the recruiter cancels. */
export function confirmStatusChange(name: string, status: ApplicationStatus): boolean {
  if (status === "APPLIED") return true;
  const action = status === "SHORTLISTED" ? "Shortlist" : "Reject";
  return window.confirm(`${action} ${name}? They'll get an email about this decision.`);
}

export function statusChangeMessage(name: string, status: ApplicationStatus): string {
  if (status === "SHORTLISTED") return `${name} shortlisted. We've emailed them.`;
  if (status === "REJECTED") return `${name} marked as rejected. We've emailed them.`;
  return `${name} moved back to applied.`;
}
