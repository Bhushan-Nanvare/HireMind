import { useEffect, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthHydrated, useAuthStore } from "../../store/authStore";
import { dashboardPathFor, readSession, type Role } from "../../utils/session";

/** The signed-in user's role (null when signed out or the token expired), once auth state has loaded. */
function useSessionRole(): { ready: boolean; role: Role | null } {
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const session = readSession(token);

  // Clear a stored token that has expired
  useEffect(() => {
    if (hydrated && token && !session) logout();
  }, [hydrated, token, session, logout]);

  return { ready: hydrated, role: session?.role ?? null };
}

/** Renders the nested routes only for a signed-in user with `role`; everyone else is redirected. */
export function RequireAuth({ role }: { role: Role }) {
  const { ready, role: userRole } = useSessionRole();
  const location = useLocation();

  if (!ready) return null;
  if (!userRole) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (userRole !== role) return <Navigate to={dashboardPathFor(userRole)} replace />;
  return <Outlet />;
}

/** Landing, login and sign-up pages: signed-in users go straight on to where they were headed, or their dashboard. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { ready, role } = useSessionRole();
  const from = (useLocation().state as { from?: string } | null)?.from;

  if (!ready) return null;
  if (role) return <Navigate to={from ?? dashboardPathFor(role)} replace />;
  return <>{children}</>;
}
