const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiError(response, data, fallback) {
  const error = new Error(data.detail || fallback);
  error.status = response.status;
  return error;
}

async function readJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response, data, fallback);
  return data;
}

export function isUnauthorizedError(error) {
  return error?.status === 401;
}

export function isTokenExpired(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(window.atob(payload));
    return typeof claims.exp === "number" && claims.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export async function authenticate(mode, payload) {
  const endpoint = mode === "login" ? "login" : "register";
  const response = await fetch(`${API_URL}/api/v1/auth/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response, "Authentication failed.");
}

async function authPost(endpoint, payload) {
  const response = await fetch(`${API_URL}/api/v1/auth/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return readJson(response, "Unable to complete that request.");
}

export const verifyEmail = (email, code) => authPost("verify-email", { email, code });
export const resendVerification = (email) => authPost("resend-verification", { email });
export const signInWithGoogle = (credential) => authPost("google", { credential });
export const requestPasswordReset = (email) => authPost("forgot-password", { email });
export const resetPassword = (email, code, password) => authPost("reset-password", { email, code, password });

export async function sendChatMessage(token, payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${API_URL}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await readJson(response, "Unable to send message.");
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The reply took too long. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function authorizedGet(token, path) {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return readJson(response, "Unable to load your saved data.");
}

export const getConversations = (token) => authorizedGet(token, "/api/v1/conversations");
export const getConversationMessages = (token, id) => authorizedGet(token, `/api/v1/conversations/${id}/messages`);
export const getConversationInsights = (token, id) => authorizedGet(token, `/api/v1/conversations/${id}/insights`);
export const getEmotionTrends = (token) => authorizedGet(token, "/api/v1/emotions/trends");
export async function deleteConversation(token, id) {
  const response = await fetch(`${API_URL}/api/v1/conversations/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(response, "Unable to delete conversation.");
}

async function authorizedRequest(token, path, method, payload) {
  const response = await fetch(`${API_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
  try { return await readJson(response, "Unable to save your Student Success data."); }
  catch (error) { throw error; }
}

export const getStudentOverview = (token) => authorizedGet(token, "/api/v1/student/overview");
export const saveStudentProfile = (token, payload) => authorizedRequest(token, "/api/v1/student/profile", "PUT", payload);
export const saveStudentAssessment = (token, payload) => authorizedRequest(token, "/api/v1/student/assessment", "POST", payload);
export const createRoadmap = (token) => authorizedRequest(token, "/api/v1/student/roadmap", "POST");
export const updateStudentTask = (token, id, completed) => authorizedRequest(token, `/api/v1/student/tasks/${id}`, "PATCH", { completed });
export const saveStudentCheckin = (token, payload) => authorizedRequest(token, "/api/v1/student/checkin", "POST", payload);
export const getStudentTools = (token) => authorizedGet(token, "/api/v1/student/study-tools");
