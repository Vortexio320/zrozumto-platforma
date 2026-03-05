import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { configureApi, loginApi } from '../api/client';
import type { UserInfo } from '../types';

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('access_token'),
  );
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = sessionStorage.getItem('user_info');
    return saved ? JSON.parse(saved) : null;
  });

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('user_info');
  }, []);

  useEffect(() => {
    configureApi({
      getToken: () => token,
      onUnauthorized: logout,
    });
  }, [token, logout]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await loginApi(username, password);
    const userInfo: UserInfo = {
      id: data.user.id,
      username: data.user.username,
      role: data.user.role as UserInfo['role'],
      full_name: data.user.full_name,
    };
    const newToken = data.access_token;
    setToken(newToken);
    setUser(userInfo);
    sessionStorage.setItem('access_token', newToken);
    sessionStorage.setItem('user_info', JSON.stringify(userInfo));
    // Configure API immediately so DashboardView's first fetch has the token (avoids effect race)
    configureApi({
      getToken: () => newToken,
      onUnauthorized: logout,
    });
  }, [logout]);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
