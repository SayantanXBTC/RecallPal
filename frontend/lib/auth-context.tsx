'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id:            string;
  email:         string;
  display_name?: string | null;
  avatar_url?:   string | null;
}

interface AuthContextValue {
  user:            AuthUser | null;
  token:           string   | null;
  loading:         boolean;
  login:           (email: string, password: string) => Promise<void>;
  signup:          (email: string, password: string) => Promise<void>;
  logout:          () => void;
  refreshToken:    () => Promise<boolean>;
  hydrateSession:  (accessToken: string, refreshToken: string, user: AuthUser, expiresIn: number) => void;
  refreshProfile:  () => Promise<void>;
  updateProfile:   (displayName: string) => Promise<void>;
  updateAvatar:    (dataUrl: string) => Promise<void>;
  removeAvatar:    () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY   = 'rp_access_token';
const REFRESH_KEY = 'rp_refresh_token';
const USER_KEY    = 'rp_user';
const EXPIRY_KEY  = 'rp_token_expiry';  // unix seconds

function loadStored(): { token: string | null; refreshToken: string | null; user: AuthUser | null; expiry: number | null } {
  if (typeof window === 'undefined') return { token: null, refreshToken: null, user: null, expiry: null };
  try {
    const token        = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    const raw          = localStorage.getItem(USER_KEY);
    const expiryRaw    = localStorage.getItem(EXPIRY_KEY);
    const user         = raw ? (JSON.parse(raw) as AuthUser) : null;
    const expiry       = expiryRaw ? parseInt(expiryRaw, 10) : null;
    return { token, refreshToken, user, expiry };
  } catch {
    return { token: null, refreshToken: null, user: null, expiry: null };
  }
}

function persist(token: string, refreshToken: string, user: AuthUser, expiresIn: number) {
  const expiry = Math.floor(Date.now() / 1000) + expiresIn;
  localStorage.setItem(TOKEN_KEY,   token);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY,    JSON.stringify(user));
  localStorage.setItem(EXPIRY_KEY,  String(expiry));
}

function clear() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [user,        setUser]        = useState<AuthUser | null>(null);
  const [token,       setToken]       = useState<string   | null>(null);
  const [refreshTok,  setRefreshTok]  = useState<string   | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number   | null>(null);
  const [loading,     setLoading]     = useState(true);

  // Rehydrate from localStorage on mount (client only)
  useEffect(() => {
    const stored = loadStored();
    if (stored.token && stored.user) {
      setToken(stored.token);
      setUser(stored.user);
      setRefreshTok(stored.refreshToken);
      setTokenExpiry(stored.expiry);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') {
      throw new Error(data.message ?? 'Login failed.');
    }
    const authUser: AuthUser = { id: data.user.id, email: data.user.email };
    persist(data.access_token, data.refresh_token ?? '', authUser, data.expires_in ?? 3600);
    setToken(data.access_token);
    setUser(authUser);
    setRefreshTok(data.refresh_token ?? null);
    setTokenExpiry(Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600));
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const res  = await fetch('/api/auth/signup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') {
      throw new Error(data.message ?? 'Sign-up failed.');
    }
    if (data.access_token) {
      const authUser: AuthUser = { id: data.user.id, email: data.user.email };
      persist(data.access_token, data.refresh_token ?? '', authUser, data.expires_in ?? 3600);
      setToken(data.access_token);
      setUser(authUser);
      setRefreshTok(data.refresh_token ?? null);
      setTokenExpiry(Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600));
    } else {
      // Supabase requires email confirmation before a session is issued.
      throw new Error(data.message ?? 'Check your email to confirm your account.');
    }
  }, []);

  const logout = useCallback(() => {
    clear();
    setToken(null);
    setUser(null);
    router.replace('/login');
  }, [router]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const storedRefresh = localStorage.getItem('rp_refresh_token');
    if (!storedRefresh) return false;
    try {
      const res  = await fetch('/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: storedRefresh }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        // Refresh token itself is dead — wipe local state and force re-login.
        clear();
        setUser(null);
        setToken(null);
        setRefreshTok(null);
        setTokenExpiry(null);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return false;
      }
      const currentUser = user;
      if (!currentUser) return false;
      persist(data.access_token, data.refresh_token, currentUser, data.expires_in);
      setToken(data.access_token);
      setRefreshTok(data.refresh_token);
      setTokenExpiry(Math.floor(Date.now() / 1000) + data.expires_in);
      return true;
    } catch {
      return false;
    }
  }, [user]);

  // Proactive refresh: fire 5 minutes before the token expires.
  useEffect(() => {
    if (!tokenExpiry || !refreshTok) return;
    const msUntilRefresh = (tokenExpiry - 300) * 1000 - Date.now(); // 5 min early
    if (msUntilRefresh <= 0) {
      void refreshToken();
      return;
    }
    const timer = setTimeout(() => { void refreshToken(); }, msUntilRefresh);
    return () => clearTimeout(timer);
  }, [tokenExpiry, refreshTok, refreshToken]);

  const hydrateSession = useCallback((accessToken: string, refreshTokenStr: string, u: AuthUser, expiresIn: number) => {
    persist(accessToken, refreshTokenStr, u, expiresIn);
    setToken(accessToken);
    setRefreshTok(refreshTokenStr);
    setUser(u);
    setTokenExpiry(Math.floor(Date.now() / 1000) + expiresIn);
    setLoading(false);
  }, []);

  const authFetch = useCallback(async (input: RequestInfo, init: RequestInit = {}) => {
    const headers = new Headers(init.headers || {});
    const t = token || localStorage.getItem(TOKEN_KEY);
    if (t) headers.set('Authorization', `Bearer ${t}`);
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
    return fetch(input, { ...init, headers });
  }, [token]);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/me');
      if (!res.ok) return;
      const data = await res.json();
      const u = data?.user;
      if (!u?.id) return;
      const merged: AuthUser = {
        id:            u.id,
        email:         u.email,
        display_name:  u.display_name ?? null,
        avatar_url:    u.avatar_url   ?? null,
      };
      setUser(merged);
      const stored = loadStored();
      if (stored.token && stored.refreshToken && stored.expiry) {
        localStorage.setItem(USER_KEY, JSON.stringify(merged));
      }
    } catch {
      // silent — profile enrichment is best-effort
    }
  }, [authFetch]);

  const updateProfile = useCallback(async (displayName: string) => {
    const res  = await authFetch('/api/me/profile', {
      method: 'POST',
      body:   JSON.stringify({ display_name: displayName }),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Failed to update profile.');
    setUser((prev) => (prev ? { ...prev, display_name: displayName } : prev));
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        localStorage.setItem(USER_KEY, JSON.stringify({ ...parsed, display_name: displayName }));
      } catch { /* ignore */ }
    }
  }, [authFetch]);

  const updateAvatar = useCallback(async (dataUrl: string) => {
    const res  = await authFetch('/api/me/avatar', {
      method: 'POST',
      body:   JSON.stringify({ image: dataUrl }),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Failed to update avatar.');
    setUser((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : prev));
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        localStorage.setItem(USER_KEY, JSON.stringify({ ...parsed, avatar_url: data.avatar_url }));
      } catch { /* ignore */ }
    }
  }, [authFetch]);

  const removeAvatar = useCallback(async () => {
    const res  = await authFetch('/api/me/avatar', { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') throw new Error(data.message || 'Failed to remove avatar.');
    setUser((prev) => (prev ? { ...prev, avatar_url: null } : prev));
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        localStorage.setItem(USER_KEY, JSON.stringify({ ...parsed, avatar_url: null }));
      } catch { /* ignore */ }
    }
  }, [authFetch]);

  // Kick a profile refresh once we're authenticated so avatar/display_name
  // populate on first load and after OAuth callback.
  useEffect(() => {
    if (token && user) void refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, signup, logout, refreshToken, hydrateSession,
      refreshProfile, updateProfile, updateAvatar, removeAvatar,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
