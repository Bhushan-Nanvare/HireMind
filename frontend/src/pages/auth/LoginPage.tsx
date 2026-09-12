import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../../api/authApi";
import AuthLayout from "../../components/common/AuthLayout";
import { buttonPrimary, inputClass, labelClass } from "../../components/common/styles";
import { ErrorMessage } from "../../components/common/ui";
import { useAuthStore } from "../../store/authStore";
import { decodeToken } from "../../utils/decodeToken";
import { errorMessage } from "../../utils/errors";
import { dashboardPathFor } from "../../utils/session";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

export default function LoginPage() {
  useDocumentTitle("Log in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const token = await login(email, password);
      const session = decodeToken(token);
      if (!session) throw new Error("The server returned an invalid session. Please try again.");
      setAuth(token, session.role);
      // Return to the page that sent the user to log in, if any
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? dashboardPathFor(session.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Login failed. Please try again."));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Log in"
      footer={
        <>
          New to HireMind?{" "}
          <Link to="/signup" className="font-medium text-slate-900 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorMessage message={error} />
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <Link to="/forgot-password" className="text-xs text-slate-500 hover:text-slate-900">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}
