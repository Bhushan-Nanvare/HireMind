import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { getMe } from "../../api/authApi";
import { useAuthStore } from "../../store/authStore";
import Navbar from "./Navbar";
import VerifyEmailBanner from "./VerifyEmailBanner";

/** The frame around every signed-in page: navigation, the verify-email banner, then the page. */
export default function AppLayout() {
  const token = useAuthStore((s) => s.token);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  // Load the user's name and verification status once per visit
  useEffect(() => {
    if (!token || profile) return;
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setProfile(me);
      })
      .catch(() => {
        // A 401 is handled by the API client; anything else just leaves the name out of the navbar
      });
    return () => {
      cancelled = true;
    };
  }, [token, profile, setProfile]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      {profile && !profile.emailVerified && <VerifyEmailBanner email={profile.email} />}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
