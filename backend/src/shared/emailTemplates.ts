import { appUrl, type EmailMessage } from "./email";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Names and job titles are user-written: keep them from breaking a subject line
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ").trim();

/** Inline-styled layout, since most email clients ignore stylesheets. */
function layout(heading: string, paragraphs: string[], action: { label: string; url: string }): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5;color:#334155">${escapeHtml(p)}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
<p style="font-weight:700;color:#0f172a;margin:0 0 24px">HireMind AI</p>
<h1 style="font-size:20px;color:#0f172a;margin:0 0 16px">${escapeHtml(heading)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#0f172a;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>
<p style="margin:0;font-size:12px;color:#64748b">If the button doesn't work, open this link: ${escapeHtml(action.url)}</p>
</div>`;
}

function message(to: string, subject: string, paragraphs: string[], action: { label: string; url: string }): EmailMessage {
  const cleanSubject = oneLine(subject);
  return {
    to,
    subject: cleanSubject,
    text: `${paragraphs.join("\n\n")}\n\n${action.label}: ${action.url}`,
    html: layout(cleanSubject, paragraphs, action),
  };
}

export function verificationEmail(to: string, name: string, token: string): EmailMessage {
  return message(
    to,
    "Confirm your email address",
    [
      `Hi ${oneLine(name)},`,
      "Please confirm your email address to finish setting up your HireMind account. This link expires in 24 hours.",
    ],
    { label: "Confirm email", url: appUrl(`/verify-email?token=${encodeURIComponent(token)}`) }
  );
}

export function passwordResetEmail(to: string, token: string): EmailMessage {
  return message(
    to,
    "Reset your password",
    [
      "Someone asked to reset the password for your HireMind account. If that was you, choose a new password with the link below. It expires in 1 hour.",
      "If you didn't ask for this, you can ignore this email and your password won't change.",
    ],
    { label: "Choose a new password", url: appUrl(`/reset-password?token=${encodeURIComponent(token)}`) }
  );
}

export function applicationStatusEmail(details: {
  to: string;
  name: string;
  jobTitle: string;
  companyName: string;
  status: "SHORTLISTED" | "REJECTED";
}): EmailMessage {
  const job = oneLine(details.jobTitle);
  const company = oneLine(details.companyName);
  const greeting = `Hi ${oneLine(details.name)},`;
  const action = { label: "View your applications", url: appUrl("/candidate/applications") };

  if (details.status === "SHORTLISTED") {
    return message(
      details.to,
      `You've been shortlisted for ${job}`,
      [greeting, `Good news: ${company} has shortlisted your application for ${job}. They may contact you about next steps.`],
      action
    );
  }
  return message(
    details.to,
    `Update on your application for ${job}`,
    [greeting, `Thank you for applying for ${job} at ${company}. They've decided not to move forward with your application this time.`],
    action
  );
}
