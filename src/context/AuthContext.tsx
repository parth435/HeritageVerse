import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/types/auth";
import {
  clearSession,
  readSession,
  signIn as signInAccount,
  signUp as signUpAccount,
} from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readSession());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      signIn: async (email, password) => {
        setUser(await signInAccount(email, password));
      },
      signUp: async (name, email, password) => {
        setUser(await signUpAccount(name, email, password));
      },
      signOut: () => {
        clearSession();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
