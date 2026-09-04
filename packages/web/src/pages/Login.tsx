import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../api/AuthContext';
import type { PublicUser } from '../api/types';

type Mode = 'login' | 'signup';
type LoginStep = 'credentials' | 'mfa';
type SignupStep = 'form' | 'mfa-offer' | 'mfa-enroll' | 'mfa-codes';

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [mode, setMode] = useState<Mode>('login');

  // --- sign in ---
  const [loginStep, setLoginStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- create account ---
  const [signupStep, setSignupStep] = useState<SignupStep>('form');
  const [suDisplayName, setSuDisplayName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirmPassword, setSuConfirmPassword] = useState('');
  const [suError, setSuError] = useState<string | null>(null);
  const [suBusy, setSuBusy] = useState(false);

  // --- MFA setup, offered right after account creation ---
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSuError(null);
  }

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<{ mfaRequired: boolean; user?: PublicUser }>('/api/auth/login', {
        email,
        password,
      });
      if (result.mfaRequired) {
        setLoginStep('mfa');
      } else {
        await refresh();
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = useRecovery ? { recoveryCode } : { code };
      await api.post('/api/auth/mfa', body);
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitSignup(e: FormEvent) {
    e.preventDefault();
    setSuError(null);
    if (suPassword.length < 8) {
      setSuError('Password must be at least 8 characters.');
      return;
    }
    if (suPassword !== suConfirmPassword) {
      setSuError('Passwords do not match.');
      return;
    }
    setSuBusy(true);
    try {
      await api.post('/api/auth/register', {
        email: suEmail,
        password: suPassword,
        displayName: suDisplayName,
      });
      // Registration doesn't start a session on its own - sign in immediately with the same credentials.
      await api.post('/api/auth/login', { email: suEmail, password: suPassword });
      await refresh();
      setSignupStep('mfa-offer');
    } catch (err) {
      setSuError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setSuBusy(false);
    }
  }

  async function startMfaEnroll() {
    setMfaError(null);
    setMfaBusy(true);
    try {
      const res = await api.post<{ qrDataUrl: string; secret: string }>('/api/auth/mfa/enroll');
      setQrDataUrl(res.qrDataUrl);
      setSecret(res.secret);
      setSignupStep('mfa-enroll');
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'Could not start two-factor setup.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfaEnroll(e: FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      const res = await api.post<{ ok: boolean; recoveryCodes: string[] }>('/api/auth/mfa/confirm', {
        code: confirmCode,
      });
      setRecoveryCodes(res.recoveryCodes);
      await refresh();
      setSignupStep('mfa-codes');
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'That code did not verify.');
    } finally {
      setMfaBusy(false);
    }
  }

  function finishSignup() {
    navigate('/', { replace: true });
  }

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div className="display" style={styles.wordmark}>
          EveryFrame
        </div>
        <div style={styles.tagline}>Capture a tab. Send it to Telegram. On schedule.</div>

        {mode === 'login' && loginStep === 'credentials' && (
          <form onSubmit={onSubmitCredentials}>
            <p className="panel-title" style={{ fontSize: 16, marginBottom: 18 }}>
              Sign in
            </p>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                required
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
              {busy ? 'Signing in…' : 'Continue'}
            </button>
            <div style={styles.switchRow}>
              New to EveryFrame?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  switchMode('signup');
                }}
              >
                Create an account
              </a>
            </div>
          </form>
        )}

        {mode === 'login' && loginStep === 'mfa' && (
          <form onSubmit={onSubmitMfa}>
            <p className="panel-title" style={{ fontSize: 16, marginBottom: 10 }}>
              Two-factor code
            </p>
            {!useRecovery ? (
              <>
                <p style={styles.mfaHint}>Enter the 6-digit code from your authenticator app.</p>
                <div className="field">
                  <label>Authentication code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="000000"
                    style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: 16 }}
                    autoFocus
                    required
                  />
                </div>
              </>
            ) : (
              <div className="field">
                <label>Recovery code</label>
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="xxxxx-xxxxx"
                  autoFocus
                  required
                />
              </div>
            )}
            {error && <div className="error-text">{error}</div>}
            <button className="btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <div style={styles.rowBetween}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setUseRecovery((v) => !v);
                  setError(null);
                }}
              >
                {useRecovery ? 'Use authenticator code instead' : 'Use a recovery code instead'}
              </a>
            </div>
            <a
              style={styles.backLink}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setLoginStep('credentials');
                setError(null);
              }}
            >
              Back
            </a>
          </form>
        )}

        {mode === 'signup' && signupStep === 'form' && (
          <form onSubmit={onSubmitSignup}>
            <p className="panel-title" style={{ fontSize: 16, marginBottom: 18 }}>
              Create your account
            </p>
            <div className="field">
              <label>Display name (optional)</label>
              <input
                type="text"
                value={suDisplayName}
                onChange={(e) => setSuDisplayName(e.target.value)}
                placeholder="Alex Rivera"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={suEmail}
                onChange={(e) => setSuEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={suPassword}
                onChange={(e) => setSuPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input
                type="password"
                value={suConfirmPassword}
                onChange={(e) => setSuConfirmPassword(e.target.value)}
                placeholder="••••••••••"
                required
              />
            </div>
            {suError && <div className="error-text">{suError}</div>}
            <button className="btn-primary" type="submit" disabled={suBusy} style={{ width: '100%', marginTop: 6 }}>
              {suBusy ? 'Creating account…' : 'Create account'}
            </button>
            <div style={styles.switchRow}>
              Already have an account?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  switchMode('login');
                }}
              >
                Sign in
              </a>
            </div>
          </form>
        )}

        {mode === 'signup' && signupStep === 'mfa-offer' && (
          <div>
            <p className="panel-title" style={{ fontSize: 16, marginBottom: 10 }}>
              Account created
            </p>
            <p style={styles.mfaHint}>
              Add two-factor authentication now for extra protection — a 6-digit code from an authenticator app
              (Google Authenticator, Microsoft Authenticator, or any similar app) on top of your password. You can
              always turn this on or off later from Settings → Security.
            </p>
            {mfaError && <div className="error-text">{mfaError}</div>}
            <button
              className="btn-primary"
              type="button"
              onClick={startMfaEnroll}
              disabled={mfaBusy}
              style={{ width: '100%', marginTop: 6 }}
            >
              {mfaBusy ? 'Starting…' : 'Set up two-factor authentication'}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={finishSignup}
              style={{ width: '100%', marginTop: 10 }}
            >
              Skip for now
            </button>
          </div>
        )}

        {mode === 'signup' && signupStep === 'mfa-enroll' && (
          <form onSubmit={confirmMfaEnroll}>
            <p className="panel-title" style={{ fontSize: 16, marginBottom: 10 }}>
              Scan to enroll
            </p>
            <p style={styles.mfaHint}>Scan this with your authenticator app, or enter the key manually.</p>
            {qrDataUrl && <img className="qr-box" src={qrDataUrl} alt="MFA enrollment QR code" />}
            <div>
              <span className="secret-key">{secret}</span>
            </div>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Confirmation code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="000000"
                autoFocus
                required
              />
            </div>
            {mfaError && <div className="error-text">{mfaError}</div>}
            <button className="btn-primary" type="submit" disabled={mfaBusy} style={{ width: '100%', marginTop: 6 }}>
              {mfaBusy ? 'Confirming…' : 'Confirm & enable'}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={finishSignup}
              style={{ width: '100%', marginTop: 10 }}
            >
              Skip for now
            </button>
          </form>
        )}

        {mode === 'signup' && signupStep === 'mfa-codes' && recoveryCodes && (
          <div>
            <p className="panel-title" style={{ fontSize: 16, marginBottom: 10 }}>
              Two-factor enabled
            </p>
            <div className="recovery-codes">
              <strong style={{ fontSize: 12.5, color: 'var(--text)' }}>
                Save these recovery codes — each works once, and this is the only time they're shown.
              </strong>
              <div className="recovery-codes-grid">
                {recoveryCodes.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
            </div>
            <button
              className="btn-primary"
              type="button"
              onClick={finishSignup}
              style={{ width: '100%', marginTop: 16 }}
            >
              Continue to EveryFrame
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    background: 'var(--surface)',
    border: '1px solid var(--border-soft)',
    borderRadius: 4,
    padding: '32px 30px 30px',
  },
  wordmark: { fontSize: 24, fontWeight: 600, letterSpacing: '0.01em', marginBottom: 6 },
  tagline: { color: 'var(--text-faint)', fontSize: 12, marginBottom: 26 },
  mfaHint: { color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, marginBottom: 20 },
  rowBetween: { marginTop: 16, fontSize: 11.5 },
  switchRow: { marginTop: 16, fontSize: 11.5, color: 'var(--text-faint)' },
  backLink: { display: 'inline-block', marginTop: 16, color: 'var(--text-faint)', fontSize: 11.5 },
};
