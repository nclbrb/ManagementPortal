/**
 * Frontend ↔ Backend connection settings
 *
 * Checklist when data does not load:
 *   1) Backend running: `cd backend && npm run dev` (default port 4000).
 *   2) Dev: Vite proxy sends `/api` → http://127.0.0.1:4000 (see vite.config.js).
 *   3) Socket.IO uses SOCKET_URL below (same host:4000 in dev); firewall must allow it.
 *   4) Production: set VITE_API_BASE_URL and VITE_SOCKET_URL before `npm run build`.
 *
 * Development (npm run dev in frontend):
 *   - REST:  "/api" → Vite proxies to http://127.0.0.1:4000
 *   - Socket.IO: direct to http://localhost:4000 (CORS enabled on server)
 *
 * Production build: set env before `npm run build`:
 *   VITE_API_BASE_URL=https://your-domain.com/api
 *   VITE_SOCKET_URL=https://your-domain.com
 */
const trimSlash = (s) => String(s || "").replace(/\/$/, "");
const browserHost =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

const envApi = import.meta.env.VITE_API_BASE_URL;
const envSocket = import.meta.env.VITE_SOCKET_URL;

/** Base path for REST (includes /api). No trailing slash. */
export const API =
  trimSlash(envApi) ||
  (import.meta.env.DEV ? "/api" : `http://${browserHost}:4000/api`);

/** Socket.IO server origin (no path). */
export const SOCKET_URL = trimSlash(envSocket) || `http://${browserHost}:4000`;

/** Build full API URL: apiFetch("/dashboard") → "/api/dashboard" or full URL in prod */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API}${p}`;
}

export const AUTH_STORAGE_KEY = "comelec_token";

export function getAuthHeaders() {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem(AUTH_STORAGE_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
