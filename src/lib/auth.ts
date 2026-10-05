export type SessionUser = {
  id: number;
  name: string;
  email: string;
  token?: string;
};

const SESSION_KEY = "heritageverse-session";
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/auth";

// Read current session from browser
export function readSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

// Save current session locally
export function writeSession(user: SessionUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

// Remove session during logout
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function signUp(
  name: string,
  email: string,
  password: string
): Promise<SessionUser> {
  const response = await fetch(`${API_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to create account.");
  }

  const user: SessionUser = data.user;
  writeSession(user);
  return user;
}

export async function signIn(
  email: string,
  password: string
): Promise<SessionUser> {
  const response = await fetch(`${API_URL}/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login failed.");
  }

  const user: SessionUser = {
    ...data.user,
    token: data.token,
  };

  writeSession(user);
  return user;
}
