import axios from "axios";
import { useAuthStore } from "../store/authStore";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api" });

api.interceptors.request.use((config) => {
  // Primary: read from Zustand store (works after hydration)
  let token = useAuthStore.getState().token;

  // Fallback: read directly from localStorage in case the persist middleware
  // hasn't hydrated the store yet (e.g., on first render after a page refresh)
  if (!token) {
    try {
      const persisted = localStorage.getItem("hiremind-auth");
      if (persisted) {
        const parsed = JSON.parse(persisted);
        token = parsed?.state?.token ?? null;
      }
    } catch {
      // ignore parse errors
    }
  }

  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // An expired or invalid session: sign out and go to the login page. A wrong password on the
    // login form is also a 401, but the form shows that error itself.
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRequest) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== "/login") window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);

export default api;
