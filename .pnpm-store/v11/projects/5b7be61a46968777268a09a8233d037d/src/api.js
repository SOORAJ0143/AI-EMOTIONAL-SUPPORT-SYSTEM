const API_URL = import.meta.env.VITE_API_URL;

function apiError(response, data, fallback) {
  const error = new Error(data.detail || fallback);
  error.status = response.status;
  return error;
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
  const data = await response.json();
  if (!response.ok) throw apiError(response, data, "Authentication failed.");
  return data;
}

async function authPost(endpoint, payload) {
  const response = await fetch(`${API_URL}/api/v1/auth/${endpoint}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw apiError(response, data, "Unable to complete that request.");
  return data;
}

export const verifyEmail = (email, code) => authPost("verify-email", { email, code });
export const resendVerification = (email) => authPost("resend-verification", { email });

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
    const data = await response.json();
    if (!response.ok) throw apiError(response, data, "Unable to send message.");
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The reply took too long. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function authorizedGet(token, path) {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw apiError(response, data, "Unable to load your saved data.");
  return data;
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
  const data = await response.json();
  if (!response.ok) throw apiError(response, data, "Unable to delete conversation.");
  return data;
}
