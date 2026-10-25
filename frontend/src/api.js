/** Minimal API client: JSON fetch wrapper carrying the JWT from localStorage. */

const TOKEN_KEY = "arra_token";
const USER_KEY = "arra_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getPrincipal() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function storeSession(loginResponse) {
  localStorage.setItem(TOKEN_KEY, loginResponse.access_token);
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({ username: loginResponse.username, role: loginResponse.role })
  );
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch(path, { ...options, headers });
  } catch {
    const err = new Error("Cannot connect to server. Please verify backend is running on http://127.0.0.1:8000");
    err.status = 0;
    throw err;
  }

  let body = null;
  try {
    body = await resp.json();
  } catch {
    body = {};
  }
  if (!resp.ok) {
    let msg = body?.detail;
    if (!msg) {
      if (resp.status === 500) {
        msg = "Backend server error (HTTP 500). Please check backend console logs.";
      } else if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
        msg = `Backend unreachable (HTTP ${resp.status}). Ensure backend is running on http://127.0.0.1:8000.`;
      } else {
        msg = `HTTP ${resp.status}`;
      }
    }
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  return body;
}

export const api = {
  login: (username, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  submitRefund: (payload) =>
    request("/api/refund-requests", { method: "POST", body: JSON.stringify(payload) }),
  listCases: (status = "") =>
    request(`/api/cases${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  getCase: (id) => request(`/api/cases/${id}`),
  act: (id, action, comment) =>
    request(`/api/cases/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action, comment }),
    }),
  replay: (id) => request(`/api/cases/${id}/replay`, { method: "POST" }),
  metrics: () => request("/api/metrics"),
};
