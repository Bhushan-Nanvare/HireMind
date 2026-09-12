import { vi } from "vitest";

// A stand-in for shared/email that records messages instead of sending them. Use it with
//   vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
}

export const sentEmails: SentEmail[] = [];

export function emailMock() {
  return {
    appUrl: (path: string) => `http://localhost:5173${path}`,
    sendEmail: vi.fn(async (message: SentEmail) => {
      sentEmails.push(message);
    }),
    sendEmailInBackground: vi.fn((message: SentEmail) => {
      sentEmails.push(message);
    }),
  };
}

export function clearEmails(): void {
  sentEmails.length = 0;
}

export function lastEmailTo(to: string): SentEmail | undefined {
  return [...sentEmails].reverse().find((email) => email.to.toLowerCase() === to.toLowerCase());
}

/** The one-time token from the newest email to this address, read out of its link. */
export function tokenFromEmail(to: string, linkPath: string): string {
  const email = lastEmailTo(to);
  const match = email && new RegExp(`${linkPath}\\?token=([A-Za-z0-9_%-]+)`).exec(email.text);
  if (!match) throw new Error(`No ${linkPath} link was emailed to ${to}`);
  return decodeURIComponent(match[1]!);
}
