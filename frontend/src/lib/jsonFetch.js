import { AUTH_STORAGE_KEY, getAuthHeaders } from "../apiConfig.js";

export async function jsonFetch(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
  });
  if (r.status === 401) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    throw new Error("UNAUTHORIZED");
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
