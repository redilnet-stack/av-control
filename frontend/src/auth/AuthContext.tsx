import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type Role = 'admin' | 'operator';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

interface AuthStatusResponse {
  setupRequired: boolean;
  user: AuthUser | null;
}

interface AuthContextValue {
  loading: boolean;
  setupRequired: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<string | null>;
  completeSetup: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch('/api/auth/status');
        if (res.ok) {
          const data: AuthStatusResponse = await res.json();
          if (!cancelled) {
            setSetupRequired(data.setupRequired);
            setUser(data.user);
          }
        }
      } catch {
        /* backend not reachable — render the login screen anyway */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();

    // Detect expired sessions so the app returns to the login screen.
    const poll = window.setInterval(async () => {
      if (!userRef.current) return;
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) setUser(null);
      } catch {
        /* transient network error — keep the session */
      }
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? 'Login failed';
      setUser(data.user);
      setSetupRequired(false);
      return null;
    } catch {
      return 'Network error — could not reach the server';
    }
  }, []);

  const completeSetup = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? 'Setup failed';
      setUser(data.user);
      setSetupRequired(false);
      return null;
    } catch {
      return 'Network error — could not reach the server';
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore network errors on logout */
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ loading, setupRequired, user, login, completeSetup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
