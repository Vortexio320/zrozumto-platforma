import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { configureApi, loginApi, logoutApi, authMe } from '../api/client';
import type { UserInfo } from '../types';

interface AuthContextValue {
  user: UserInfo | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);

  const logout = useCallback(async () => {
    setUser(null);
    try {
      await logoutApi();
    } catch {
      // Ignore logout API errors
    }
  }, []);

  useEffect(() => {
    configureApi({ onUnauthorized: logout });
  }, [logout]);

  useEffect(() => {
    authMe().then((me) => {
      if (me) {
        setUser({
          id: me.id,
          username: me.username,
          role: me.role as UserInfo['role'],
          full_name: me.full_name,
          school_type: me.school_type,
          class: me.class,
        });
      }
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await loginApi(username, password);
    const userInfo: UserInfo = {
      id: data.user.id,
      username: data.user.username,
      role: data.user.role as UserInfo['role'],
      full_name: data.user.full_name,
      school_type: data.user.school_type,
      class: data.user.class,
    };
    setUser(userInfo);
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
