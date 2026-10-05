export type User = {
  id: number;
  name: string;
  email: string;
  created_at?: string;
  /** Present only after the backend adds and returns a role field. */
  role?: "admin" | "user" | string;
};

export type AuthResponse = {
  success: boolean;
  message: string;
  user: User;
  /** The current API does not issue a token; this remains optional for that reason. */
  token?: string;
};
