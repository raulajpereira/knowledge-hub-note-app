import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // A non-super-admin credential is valid for the *product*, not this app —
  // reject it here, centrally, rather than trusting every call site to check
  // .role before treating the session as good. Applies just as much to a
  // token restored from localStorage (role can change after it was issued)
  // as to a fresh login.
  const rejectIfNotSuperAdmin = (user) => {
    if (user.role !== 'super_admin') {
      setToken(null);
      throw new Error('backoffice.notSuperAdmin');
    }
    return user;
  };

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.me();
      setUser(rejectIfNotSuperAdmin(user));
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = async (email, password) => {
    const res = await api.login({ email, password });
    if (res.requires2fa) return res;
    setToken(res.token);
    setUser(rejectIfNotSuperAdmin(res.user));
    return res.user;
  };

  const completeLogin2fa = async ({ pendingToken, code, backupCode }) => {
    const { token, user } = await api.login2faVerify({ pendingToken, code, backupCode });
    setToken(token);
    setUser(rejectIfNotSuperAdmin(user));
    return user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, completeLogin2fa, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
