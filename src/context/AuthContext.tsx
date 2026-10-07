import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/types/auth";
import { ApiRequestError, authMe } from "@/lib/api";
import { clearSession, signIn as signInAccount, signUp as signUpAccount } from "@/lib/auth";
import { readAuthToken } from "@/lib/sessionToken";

type AuthContextValue = {
  user: User | null;
  isReady: boolean;
  sessionMessage: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isInvalidSession(error: unknown) {
  return error instanceof ApiRequestError && [401, 403, 404].includes(error.status);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const token = readAuthToken();

    if (!token) {
      setIsReady(true);
      return () => { active = false; };
    }

    void authMe({ signal: controller.signal })
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setSessionMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setUser(null);
        if (isInvalidSession(error)) {
          clearSession();
          setSessionMessage("Your saved session has expired or is no longer valid. Please sign in again.");
        } else {
          const detail = error instanceof Error ? ` ${error.message}` : "";
          setSessionMessage(`We could not verify your saved session.${detail}`);
        }
      })
      .finally(() => {
        if (active) setIsReady(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      sessionMessage,
      signIn: async (email, password) => {
        setSessionMessage(null);
        const signedInUser = await signInAccount(email, password);
        setUser(signedInUser);
      },
      signUp: async (name, email, password) => {
        setSessionMessage(null);
        const createdUser = await signUpAccount(name, email, password);
        setUser(createdUser);
      },
      signOut: () => {
        clearSession();
        setUser(null);
        setSessionMessage(null);
      },
    }),
    [user, isReady, sessionMessage],
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
