import { isAxiosError } from "axios";

/** The message to show for a failed request: the API's `error` text when there is one. */
export function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const apiError = (err.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof apiError === "string" && apiError) return apiError;
    if (!err.response) return "Can't reach the server. Check your connection and try again.";
    return fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
