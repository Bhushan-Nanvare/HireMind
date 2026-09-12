import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getMe, resendVerification, verifyEmail } from "../../api/authApi";
import AuthLayout from "../../components/common/AuthLayout";
import { buttonPrimary, buttonSecondary } from "../../components/common/styles";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/errors";
import { dashboardPathFor, readSession } from "../../utils/session";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

type Status = "verifying" | "verified" | "failed";

export default function VerifyEmailPage() {
  useDocumentTitle("Confirm your email");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "verifying" : "failed");
  const [error, setError] = useState(token ? "" : "This link is incomplete. Open it from your email again.");
  const [resending, setResending] = useState(false);
  const session = readSession(useAuthStore((s) => s.token));
  const sentToken = useRef(false);

  useEffect(() => {
    // Links are single-use: don't let StrictMode's double effect send the token twice
    if (!token || sentToken.current) return;
    sentToken.current = true;

    const store = useAuthStore.getState();
    verifyEmail(token)
      .then(() => {
        if (store.profile) store.setProfile({ ...store.profile, emailVerified: true });
        setStatus("verified");
      })
      .catch(async (err) => {
        // Clicking an old link again fails, but the address may already be confirmed
        if (readSession(store.token)) {
          const me = await getMe().catch(() => null);
          if (me?.emailVerified) {
            store.setProfile(me);
            setStatus("verified");
            return;
          }
        }
        setError(errorMessage(err, "This link couldn't be used."));
        setStatus("failed");
      });
  }, [token]);

  async function handleResend() {
    setResending(true);
    try {
      await resendVerification();
      toast.success("We've sent you a new link.");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send the email. Please try again."));
    } finally {
      setResending(false);
    }
  }

  const continueLink = session ? (
    <Link to={dashboardPathFor(session.role)} className={`${buttonPrimary} w-full`}>
      Go to your dashboard
    </Link>
  ) : (
    <Link to="/login" className={`${buttonPrimary} w-full`}>
      Log in
    </Link>
  );

  if (status === "verifying") {
    return (
      <AuthLayout title="Confirming your email">
        <p className="text-sm text-slate-600" role="status">
          One moment…
        </p>
      </AuthLayout>
    );
  }

  if (status === "verified") {
    return (
      <AuthLayout title="Email confirmed">
        <p className="mb-5 text-sm text-slate-600">Thanks! Your email address is confirmed, so you can apply for and post jobs.</p>
        {continueLink}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="We couldn't confirm your email">
      <p className="text-sm text-red-600" role="alert">
        {error}
      </p>
      <div className="mt-5 space-y-2">
        {session ? (
          <button onClick={handleResend} disabled={resending} className={`${buttonSecondary} w-full`}>
            {resending ? "Sending…" : "Send me a new link"}
          </button>
        ) : (
          <p className="text-sm text-slate-500">Log in to request a new link.</p>
        )}
        {continueLink}
      </div>
    </AuthLayout>
  );
}
