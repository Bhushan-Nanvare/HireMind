import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../api/authApi";
import AuthLayout from "../../components/common/AuthLayout";
import { buttonPrimary, inputClass, labelClass } from "../../components/common/styles";
import { ErrorMessage } from "../../components/common/ui";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { decodeToken } from "../../utils/decodeToken";
import { errorMessage } from "../../utils/errors";
import { dashboardPathFor } from "../../utils/session";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

export default function ResetPasswordPage() {
  useDocumentTitle("Choose a new password");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const sessionToken = await resetPassword(token, password);
      const session = decodeToken(sessionToken);
      if (!session) throw new Error("The server returned an invalid session. Please log in.");
      setAuth(sessionToken, session.role);
      toast.success("Your password has been changed. Any other devices have been signed out.");
      navigate(dashboardPathFor(session.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the password. Please try again."));
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="This link is incomplete">
        <p className="text-sm text-slate-600">Open the link from your email again, or request a new one.</p>
        <Link to="/forgot-password" className={`${buttonPrimary} mt-4 w-full`}>
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      footer={
        <Link to="/forgot-password" className="font-medium text-slate-900 hover:underline">
          Request a new link
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorMessage message={error} />
        <div>
          <label htmlFor="password" className={labelClass}>
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            minLength={8}
            maxLength={72}
            required
          />
          <p className="mt-1 text-xs text-slate-400">At least 8 characters</p>
        </div>
        <div>
          <label htmlFor="confirm" className={labelClass}>
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            minLength={8}
            maxLength={72}
            required
          />
        </div>
        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? "Saving…" : "Change password"}
        </button>
      </form>
    </AuthLayout>
  );
}
