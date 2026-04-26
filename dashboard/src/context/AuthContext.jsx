import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_RAW = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const API = API_RAW.endsWith('/') ? API_RAW.slice(0, -1) : API_RAW;
const WS_BASE = API.replace('http', 'ws');

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('fm_token'));
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('fm_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setLoading(false);
      const err = await res.json();
      throw new Error(err.detail || 'Invalid credentials');
    }
    const data = await res.json();
    const meRes = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const me = await meRes.json();
    localStorage.setItem('fm_token', data.access_token);
    localStorage.setItem('fm_user', JSON.stringify(me));
    setToken(data.access_token);
    setUser(me);
    setLoading(false);
    return me;
  }, []);

  const register = useCallback(async (name, email, password, role) => {
    setLoading(true);
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!res.ok) {
      setLoading(false);
      const err = await res.json();
      throw new Error(err.detail || 'Registration failed');
    }
    setLoading(false);
    return await res.json();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('fm_token');
    localStorage.removeItem('fm_user');
    setToken(null);
    setUser(null);
  }, []);

  const authFetch = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) { logout(); throw new Error('Session expired'); }
    return res;
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout, authFetch, API, WS_BASE }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
