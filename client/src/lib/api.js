const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://127.0.0.1:8080/api");

export function getToken() {
  return localStorage.getItem("ali_token");
}

export function setToken(token) {
  localStorage.setItem("ali_token", token);
}

export function clearToken() {
  localStorage.removeItem("ali_token");
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
