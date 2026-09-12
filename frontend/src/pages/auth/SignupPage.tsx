import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signup, type Role } from "../../api/authApi";
import AuthLayout from "../../components/common/AuthLayout";
import { buttonPrimary, inputClass, labelClass } from "../../components/common/styles";
import { ErrorMessage } from "../../components/common/ui";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";
import { decodeToken } from "../../utils/decodeToken";
import { errorMessage } from "../../utils/errors";
import { dashboardPathFor } from "../../utils/session";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "CANDIDATE", label: "I'm looking for a job" },
  { value: "RECRUITER", label: "I'm hiring" },
];

export default function SignupPage() {
  useDocumentTitle("Create your account");
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState<Role>(searchParams.get("role") === "RECRUITER" ? "RECRUITER" : "CANDIDATE");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const token = await signup({ email, password, role, name });
      const session = decodeToken(token);
      if (!session) throw new Error("The server returned an invalid session. Please try again.");
      setAuth(token, session.role);
      toast.success("Account created. Check your inbox for a link to confirm your email address.");
      navigate(dashboardPathFor(session.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Sign-up failed. Please try again."));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-slate-900 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorMessage message={error} />
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Account type">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={role === option.value}
              onClick={() => setRole(option.value)}
              className={`rounded-md px-2 py-2 text-sm ${
                role === option.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="name" className={labelClass}>
            {role === "CANDIDATE" ? "Full name" : "Company name"}
          </label>
          <input
            id="name"
            autoComplete={role === "CANDIDATE" ? "name" : "organization"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            maxLength={100}
            required
          />
        </div>
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
          <label htmlFor="password" className={labelClass}>
            Password
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
        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
