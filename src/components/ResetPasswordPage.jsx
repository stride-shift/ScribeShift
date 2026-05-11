import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './AuthProvider';
import { CanvasRevealEffect } from './ui/sign-in-flow-1';

// ── Match the sign-in page: same dark canvas + spotlight, blue ring logo,
// ── animated card. Standalone page (no /reset-password route library) — the
// ── route guard in App.jsx renders this when pathname starts with that path.
export default function ResetPasswordPage() {
  const { confirmPasswordReset } = useAuth();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Spotlight cursor (matches sign-in page polish)
  const [cursor, setCursor] = useState({ x: -1000, y: -1000 });
  const [cursorVisible, setCursorVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    setToken(t);
    if (!t) setError('This reset link is missing a token. Request a new one from the sign-in page.');
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      setCursor({ x: e.clientX, y: e.clientY });
      if (!cursorVisible) setCursorVisible(true);
    };
    const onLeave = () => setCursorVisible(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [cursorVisible]);

  // Live password rule indicators
  const ruleLength = password.length >= 8;
  const ruleMatch = password.length > 0 && password === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!ruleLength) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  const goToSignIn = () => {
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  return (
    <div className="reset-page">
      {/* Animated dot canvas background — same as sign-in */}
      <div className="reset-bg">
        <CanvasRevealEffect
          animationSpeed={3}
          containerClassName="reset-canvas"
          colors={[
            [59, 130, 246],
            [96, 165, 250],
          ]}
          dotSize={6}
          reverse={success}
        />
        <div className="reset-bg-vignette" />
        <div className="reset-bg-top-fade" />
      </div>

      {/* Cursor spotlight */}
      <div
        className="reset-cursor-glow"
        style={{
          opacity: cursorVisible ? 1 : 0,
          background: `radial-gradient(circle 320px at ${cursor.x}px ${cursor.y}px, rgba(59,130,246,0.18), rgba(96,165,250,0.08) 40%, transparent 70%)`,
        }}
      />

      {/* Card */}
      <div className="reset-content">
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="reset-card"
            >
              <BrandHeader />
              <div className="reset-check-circle">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className="reset-title">Password updated</h1>
              <p className="reset-subtitle">
                Your password has been reset. Sign in to pick up where you left off.
              </p>
              <button onClick={goToSignIn} className="reset-btn-primary">
                Go to sign in
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="reset-card"
            >
              <BrandHeader />
              <h1 className="reset-title">Choose a new password</h1>
              <p className="reset-subtitle">
                Pick something at least 8 characters long. A passphrase you'll remember beats a clever short one.
              </p>

              <form onSubmit={handleSubmit} className="reset-form">
                <label className="reset-label" htmlFor="reset-new">New password</label>
                <div className="reset-input-wrap">
                  <input
                    id="reset-new"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading || !token}
                    autoFocus
                    className="reset-input"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="reset-input-toggle"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>

                <label className="reset-label" htmlFor="reset-confirm">Confirm password</label>
                <input
                  id="reset-confirm"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading || !token}
                  className="reset-input"
                  autoComplete="new-password"
                />

                {/* Live rule hints */}
                <ul className="reset-rules">
                  <Rule ok={ruleLength}>At least 8 characters</Rule>
                  <Rule ok={ruleMatch}>Passwords match</Rule>
                </ul>

                {error && <div className="reset-error">{error}</div>}

                <button
                  type="submit"
                  disabled={loading || !token || !ruleLength || !ruleMatch}
                  className="reset-btn-primary"
                >
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
                <button type="button" onClick={goToSignIn} className="reset-btn-ghost">
                  Back to sign in
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="reset-brand">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <defs>
          <linearGradient id="resetLogo" x1="0" y1="0" x2="44" y2="44">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <circle cx="22" cy="22" r="20" stroke="url(#resetLogo)" strokeWidth="2.5" />
        <circle cx="22" cy="22" r="7" fill="url(#resetLogo)" />
      </svg>
      <span className="reset-brand-name">ScribeShift</span>
    </div>
  );
}

function Rule({ ok, children }) {
  return (
    <li className={`reset-rule ${ok ? 'reset-rule--ok' : ''}`}>
      <span className="reset-rule-dot">
        {ok ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : null}
      </span>
      {children}
    </li>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.06-5.06" />
      <path d="M22.54 13.43A19.7 19.7 0 0 0 23 12s-4-8-11-8a10.94 10.94 0 0 0-2.07.2" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4" /><line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
