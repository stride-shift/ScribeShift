import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { SignInPage } from './ui/sign-in-flow-1';

export default function LoginPage() {
  const { login, signup, resetPassword, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'reset') {
        if (!email.trim()) {
          setError('Please enter your email address');
          setLoading(false);
          return;
        }
        await resetPassword(email);
        setSuccess('Password reset email sent! Check your inbox.');
      } else if (mode === 'login') {
        await login(email, password);
      } else {
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }
        await signup(email, password, fullName, companyName);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (m) => {
    setMode(m);
    setError('');
    setSuccess('');
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await signInWithGoogle();
      // Supabase redirects the browser to Google — no further code runs here on success
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  return (
    <SignInPage
      mode={mode}
      email={email}
      password={password}
      fullName={fullName}
      companyName={companyName}
      error={error}
      success={success}
      loading={loading}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onFullNameChange={setFullName}
      onCompanyNameChange={setCompanyName}
      onSubmit={handleSubmit}
      onModeChange={handleModeChange}
      onGoogleSignIn={handleGoogleSignIn}
    />
  );
}
