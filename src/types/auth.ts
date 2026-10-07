export type User = {
  id: number;
  name: string;
  email: string;
  created_at?: string;
  /** Present only after the backend adds and returns a role field. */
  role?: "admin" | "user" | string;
};

export type AuthResponse = {
  success: true;
  message: string;
  user: User;
  token: string;
};
