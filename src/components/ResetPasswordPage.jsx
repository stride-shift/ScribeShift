import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

export default function ResetPasswordPage() {
  const { confirmPasswordReset } = useAuth();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    setToken(t);
    if (!t) setError('This reset link is missing a token. Request a new one from the sign-in page.');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const goToSignIn = () => {
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0b1020',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#121830',
        border: '1px solid #1f2a44',
        borderRadius: 16,
        padding: 32,
        color: '#e2e8f0',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <img src="/scribeshift-logo.png" alt="ScribeShift" width="32" height="32" style={{ borderRadius: 6 }} />
          <span style={{ fontSize: 18, fontWeight: 600 }}>ScribeShift</span>
        </div>

        {success ? (
          <>
            <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Password updated</h1>
            <p style={{ color: '#94a3b8', margin: '0 0 24px', fontSize: 14 }}>
              Your password has been reset. You can now sign in with your new password.
            </p>
            <button onClick={goToSignIn} style={btnPrimary}>Go to sign in</button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Choose a new password</h1>
            <p style={{ color: '#94a3b8', margin: '0 0 20px', fontSize: 14 }}>
              Pick something at least 8 characters long.
            </p>
            <form onSubmit={handleSubmit}>
              <label style={label}>New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading || !token}
                autoFocus
                style={input}
              />
              <label style={label}>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                disabled={loading || !token}
                style={input}
              />
              {error && (
                <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>
              )}
              <button type="submit" disabled={loading || !token} style={{ ...btnPrimary, opacity: loading || !token ? 0.6 : 1 }}>
                {loading ? 'Resetting…' : 'Reset password'}
              </button>
              <button type="button" onClick={goToSignIn} style={btnGhost}>
                Back to sign in
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const label = { display: 'block', fontSize: 13, color: '#94a3b8', margin: '0 0 6px' };
const input = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  background: '#0b1020',
  border: '1px solid #1f2a44',
  borderRadius: 10,
  color: '#e2e8f0',
  fontSize: 14,
  marginBottom: 14,
  outline: 'none',
};
const btnPrimary = {
  width: '100%',
  padding: '12px 16px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  marginBottom: 10,
};
const btnGhost = {
  width: '100%',
  padding: '10px 16px',
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #1f2a44',
  borderRadius: 10,
  fontSize: 13,
  cursor: 'pointer',
};
