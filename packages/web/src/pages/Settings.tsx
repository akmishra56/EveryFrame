import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth } from '../api/AuthContext';
import type { LogCategory, LogEntry, PublicUser } from '../api/types';
import './settings.css';

type Tab = 'profile' | 'security' | 'logs';

const LOG_FILTERS: { id: LogCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'telegram_send', label: 'Telegram sends' },
  { id: 'schedule_change', label: 'Schedule changes' },
];

export default function Settings() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="shell">
      <header>
        <div className="wordmark display">EveryFrame</div>
        <a className="back-link" href="/">
          ← Back to capture
        </a>
      </header>
      <div className="content">
        <p className="page-title">Settings</p>
        <div className="settings-layout">
          <div className="tab-nav">
            <button className={tab === 'profile' ? 'tab-item selected' : 'tab-item'} onClick={() => setTab('profile')}>
              Profile
            </button>
            <button className={tab === 'security' ? 'tab-item selected' : 'tab-item'} onClick={() => setTab('security')}>
              Security
            </button>
            <button className={tab === 'logs' ? 'tab-item selected' : 'tab-item'} onClick={() => setTab('logs')}>
              Logs
            </button>
          </div>

          {tab === 'profile' && user && <ProfilePanel user={user} onSaved={refresh} />}
          {tab === 'security' && user && <SecurityPanel user={user} onMfaChanged={refresh} />}
          {tab === 'logs' && <LogsPanel />}
        </div>
      </div>
    </div>
  );
}

function ProfilePanel({ user, onSaved }: { user: PublicUser; onSaved: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put('/api/auth/profile', { displayName });
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <p className="panel-title">Profile</p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={user.email} disabled />
          <div className="hint">Contact an admin to change your login email.</div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="save-row">
          <button className="btn-primary" type="submit" disabled={busy}>
            Save changes
          </button>
          {saved && <span className="saved-note">Saved</span>}
        </div>
      </form>
    </div>
  );
}

function SecurityPanel({ user, onMfaChanged }: { user: PublicUser; onMfaChanged: () => Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      setPasswordSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not update password.');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function startEnroll() {
    setMfaError(null);
    setMfaBusy(true);
    try {
      const res = await api.post<{ qrDataUrl: string; secret: string }>('/api/auth/mfa/enroll');
      setQrDataUrl(res.qrDataUrl);
      setSecret(res.secret);
      setMfaEnrolling(true);
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'Could not start enrollment.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      const res = await api.post<{ ok: boolean; recoveryCodes: string[] }>('/api/auth/mfa/confirm', {
        code: confirmCode,
      });
      setRecoveryCodes(res.recoveryCodes);
      setMfaEnrolling(false);
      setConfirmCode('');
      await onMfaChanged();
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'That code did not verify.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function disableMfa(e: FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      await api.post('/api/auth/mfa/disable', { password: disablePassword });
      setDisablePassword('');
      setShowDisableConfirm(false);
      setRecoveryCodes(null);
      await onMfaChanged();
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'Could not disable MFA.');
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className="panel">
      <p className="panel-title">Password</p>
      <form onSubmit={onSubmitPassword}>
        <div className="field">
          <label>Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setPasswordSaved(false);
            }}
          />
        </div>
        <div className="field">
          <label>New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordSaved(false);
            }}
          />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setPasswordSaved(false);
            }}
          />
        </div>
        {passwordError && <div className="error-text">{passwordError}</div>}
        <div className="save-row">
          <button className="btn-primary" type="submit" disabled={passwordBusy}>
            Update password
          </button>
          {passwordSaved && <span className="saved-note">Updated</span>}
        </div>
      </form>

      <div className="divider" />

      <p className="panel-title">Two-factor authentication</p>
      <div className="switch-row">
        <div>
          <div className="switch-label">Require a code from an authenticator app at login</div>
          <div className="switch-sub">Recommended — protects this account even if your password leaks.</div>
        </div>
        <div
          className={user.mfaEnabled ? 'switch on' : mfaEnrolling ? 'switch on' : 'switch'}
          onClick={() => {
            if (user.mfaEnabled) {
              setShowDisableConfirm((v) => !v);
            } else if (mfaEnrolling) {
              setMfaEnrolling(false);
            } else {
              startEnroll();
            }
          }}
        >
          <div className="switch-knob" />
        </div>
      </div>

      {mfaError && <div className="error-text">{mfaError}</div>}

      {mfaEnrolling && !user.mfaEnabled && (
        <div className="mfa-setup">
          <div className="hint" style={{ marginBottom: 12 }}>
            Scan this with your authenticator app, or enter the key manually.
          </div>
          {qrDataUrl && <img className="qr-box" src={qrDataUrl} alt="MFA enrollment QR code" />}
          <div>
            <span className="secret-key">{secret}</span>
          </div>
          <form onSubmit={confirmEnroll}>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Confirmation code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="000000"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={mfaBusy}>
              Confirm &amp; enable
            </button>
          </form>
        </div>
      )}

      {user.mfaEnabled && !showDisableConfirm && (
        <div className="badge-on">
          <div className="dot" /> Enabled
        </div>
      )}

      {user.mfaEnabled && showDisableConfirm && (
        <form onSubmit={disableMfa} className="mfa-setup">
          <div className="field" style={{ maxWidth: 300 }}>
            <label>Re-enter your password to disable MFA</label>
            <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
          </div>
          <button className="btn-ghost" type="submit" disabled={mfaBusy}>
            Disable two-factor authentication
          </button>
        </form>
      )}

      {recoveryCodes && (
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
      )}
    </div>
  );
}

function LogsPanel() {
  const [filter, setFilter] = useState<LogCategory | 'all'>('all');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const query = filter === 'all' ? '' : `?category=${filter}`;
    api
      .get<{ logs: LogEntry[] }>(`/api/logs${query}`)
      .then((res) => setLogs(res.logs))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load logs.'))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="panel">
      <p className="panel-title">Logs</p>
      <div className="pill-row" style={{ marginBottom: 18 }}>
        {LOG_FILTERS.map((f) => (
          <div key={f.id} className={filter === f.id ? 'pill selected' : 'pill'} onClick={() => setFilter(f.id)}>
            {f.label}
          </div>
        ))}
      </div>
      {loading && <div className="hint">Loading…</div>}
      {error && <div className="error-text">{error}</div>}
      {!loading && !error && logs.length === 0 && <div className="hint">Nothing here yet.</div>}
      {!loading && logs.length > 0 && (
        <div className="log-strip">
          {logs.map((row) => (
            <div className="log-row" key={row.id}>
              <div className="log-time">{new Date(row.createdAt).toLocaleString()}</div>
              <div className="log-summary">
                {row.summary}
                {row.filename && <span className="filename">{row.filename}</span>}
              </div>
              <div className={`chip ${row.category === 'telegram_send' ? (row.summary === 'Sent' ? 'sent' : row.summary === 'Sending…' ? 'sending' : 'failed') : row.category}`}>
                <div className="dot" />
                {row.category === 'error' && 'Error'}
                {row.category === 'schedule_change' && 'Schedule'}
                {row.category === 'telegram_send' && row.summary}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
