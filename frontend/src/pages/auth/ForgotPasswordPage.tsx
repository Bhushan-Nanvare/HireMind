import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../../api/authApi";
import AuthLayout from "../../components/common/AuthLayout";
import { buttonPrimary, inputClass, labelClass } from "../../components/common/styles";
import { ErrorMessage } from "../../components/common/ui";
import { errorMessage } from "../../utils/errors";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

export default function ForgotPasswordPage() {
  useDocumentTitle("Reset your password");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the email. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your account's email and we'll send you a link to choose a new password."}
      footer={
        <Link to="/login" className="font-medium text-slate-900 hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm leading-relaxed text-slate-600">
          If an account exists for <span className="font-medium text-slate-900">{email}</span>, we've sent it a link to
          reset the password. The link expires in 1 hour.
        </p>
      ) : (
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
          <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
