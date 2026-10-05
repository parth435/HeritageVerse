import { apiRequest } from "@/lib/api";
import { writeAuthToken } from "@/lib/sessionToken";
import type { AuthResponse, User } from "@/types/auth";

export type SessionUser = User;

const SESSION_KEY = "heritageverse-session";

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
  writeAuthToken(null);
}

export async function signUp(
  name: string,
  email: string,
  password: string
): Promise<SessionUser> {
  const data = await apiRequest<AuthResponse>("auth/signup", {
    method: "POST",
    authenticated: false,
    body: { name, email, password },
  });

  const user: SessionUser = data.user;
  writeSession(user);
  writeAuthToken(typeof data.token === "string" ? data.token : null);
  return user;
}

export async function signIn(
  email: string,
  password: string
): Promise<SessionUser> {
  const data = await apiRequest<AuthResponse>("auth/signin", {
    method: "POST",
    authenticated: false,
    body: { email, password },
  });

  const user: SessionUser = data.user;
  writeSession(user);
  writeAuthToken(typeof data.token === "string" ? data.token : null);
  return user;
}
