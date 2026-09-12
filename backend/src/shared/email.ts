import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** A link into the frontend (APP_URL), for use in emails. */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
  return `${base}${path}`;
}

/**
 * Sends an email through Resend. Without RESEND_API_KEY the email is printed to the console instead, so links
 * can still be followed during local development; in production it is skipped with a warning.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("Email not sent: RESEND_API_KEY is not set", { subject: message.subject });
    } else {
      // Printed in full so development and tests can follow the verification and reset links
      console.info(
        `[email] Not sent (RESEND_API_KEY is not set)\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`
      );
    }
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "HireMind <onboarding@resend.dev>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}

/** Sends without waiting and never throws: an email failure must not fail the request that triggered it. */
export function sendEmailInBackground(message: EmailMessage): void {
  sendEmail(message).catch((err) => {
    logger.error("Email could not be sent", {
      subject: message.subject,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
