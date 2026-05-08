import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Global fetch interceptor for 401 handling ──────────────────────
// Wraps window.fetch so any API call returning 401 triggers a logout.
// Installed once per page load.
let fetchInstalled = false;
function installFetchInterceptor(onUnauthorized) {
  if (fetchInstalled) return;
  fetchInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    if (res.status === 401) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      // Only trigger logout for our own API calls, not external ones
      if (url.startsWith('/api/') || url.includes(window.location.host)) {
        // Don't logout on the login/signup endpoints themselves
        if (!url.includes('/api/auth/login') && !url.includes('/api/auth/signup')) {
          onUnauthorized();
        }
      }
    }
    return res;
  };
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Install the 401 interceptor once. On 401, clear session and show message.
  useEffect(() => {
    installFetchInterceptor(() => {
      console.warn('[AUTH] Session expired (401). Clearing session.');
      setSessionExpired(true);
      supabase.auth.signOut();
      setSession(null);
      setUser(null);
    });
  }, []);

  const refreshUser = async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s?.user) await fetchProfile(s.user, s.access_token);
  };

  // Fetch user profile from our users table
  const fetchProfile = async (authUser, accessToken) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // Fallback: basic user info from auth
        setUser({
          id: authUser.id,
          email: authUser.email,
          role: 'user',
          full_name: '',
        });
      }
    } catch {
      setUser({
        id: authUser.id,
        email: authUser.email,
        role: 'user',
        full_name: '',
      });
    }
  };

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user, s.access_token);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user, s.access_token);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Set the session in Supabase client
    if (data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    setUser(data.user);
    setSession(data.session);
    setSessionExpired(false);
    return data;
  };

  const signup = async (email, password, fullName, companyName) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, companyName }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Signup failed');
    }

    if (data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    setUser(data.user);
    setSession(data.session);
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  const resetPassword = async (email) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send reset email');
    return data;
  };

  const confirmPasswordReset = async (token, password) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reset password');
    return data;
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });
    if (error) throw new Error(error.message);
  };

  // Helper to get auth headers for API calls
  const getAuthHeaders = () => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  };

  const clearSessionExpired = () => setSessionExpired(false);

  const value = {
    session,
    user,
    loading,
    sessionExpired,
    clearSessionExpired,
    login,
    signup,
    logout,
    refreshUser,
    resetPassword,
    confirmPasswordReset,
    signInWithGoogle,
    getAuthHeaders,
    isAuthenticated: !!session,
    isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
    isSuperAdmin: user?.role === 'super_admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
