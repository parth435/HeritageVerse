import { ApiRequestError, authSignin, authSignup } from "@/lib/api";
import { writeAuthToken } from "@/lib/sessionToken";
import type { AuthResponse, User } from "@/types/auth";

function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "name" in value &&
    typeof value.name === "string" &&
    "email" in value &&
    typeof value.email === "string"
  );
}

function acceptAuthenticatedResponse(response: AuthResponse): User {
  if (response.success !== true || !isUser(response.user) || typeof response.token !== "string" || !response.token.trim()) {
    throw new ApiRequestError(
      "The server did not return a valid authenticated session.",
      502,
      null,
    );
  }

  writeAuthToken(response.token);
  return response.user;
}

export function clearSession() {
  writeAuthToken(null);
}

export async function signUp(name: string, email: string, password: string): Promise<User> {
  const response = await authSignup({ name: name.trim(), email: email.trim(), password });
  return acceptAuthenticatedResponse(response);
}

export async function signIn(email: string, password: string): Promise<User> {
  const response = await authSignin({ email: email.trim(), password });
  return acceptAuthenticatedResponse(response);
}
