import { useState } from "react";
import { resendVerification } from "../../api/authApi";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/errors";

export default function VerifyEmailBanner({ email }: { email: string }) {
  const [sending, setSending] = useState(false);

  async function handleResend() {
    setSending(true);
    try {
      await resendVerification();
      toast.success(`We've sent a new link to ${email}.`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send the email. Please try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
        <p>Confirm your email address ({email}) to apply for jobs or post them. Check your inbox for the link.</p>
        <button onClick={handleResend} disabled={sending} className="font-medium underline underline-offset-2 disabled:opacity-50">
          {sending ? "Sending…" : "Resend the link"}
        </button>
      </div>
    </div>
  );
}
