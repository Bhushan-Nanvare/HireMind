import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Profile, Role } from "../api/authApi";

interface AuthState {
  token: string | null;
  role: Role | null;
  /** Name and email-verification status from /auth/me. Not persisted: it's reloaded each visit. */
  profile: Profile | null;
  setAuth: (token: string, role: Role) => void;
  setProfile: (profile: Profile) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      profile: null,
      setAuth: (token, role) => set({ token, role, profile: null }),
      setProfile: (profile) => set({ profile }),
      logout: () => set({ token: null, role: null, profile: null }),
    }),
    { name: "hiremind-auth", partialize: (state) => ({ token: state.token, role: state.role }) }
  )
);

/** False until the persisted auth state has been loaded from localStorage. */
export function useAuthHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAuthStore.persist.onFinishHydration(onChange),
    () => useAuthStore.persist.hasHydrated()
  );
}
