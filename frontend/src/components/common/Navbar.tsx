import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { dashboardPathFor } from "../../utils/session";

const LINKS = {
  CANDIDATE: [
    { to: "/candidate/dashboard", label: "Dashboard" },
    { to: "/candidate/jobs", label: "Jobs" },
    { to: "/candidate/applications", label: "My applications" },
  ],
  RECRUITER: [{ to: "/recruiter/dashboard", label: "Job postings" }],
};

export default function Navbar() {
  const role = useAuthStore((s) => s.role);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const links = role ? LINKS[role] : [];

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link to={role ? dashboardPathFor(role) : "/"} className="font-semibold text-slate-900">
          HireMind AI
        </Link>
        <div className="flex flex-1 flex-wrap items-center gap-4">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to.endsWith("/dashboard")}
              className={({ isActive }) =>
                `text-sm ${isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-900"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <span className="hidden text-sm text-slate-500 sm:inline" title={profile.email}>
              {profile.name}
            </span>
          )}
          <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-900">
            Log out
          </button>
        </div>
      </nav>
    </header>
  );
}
