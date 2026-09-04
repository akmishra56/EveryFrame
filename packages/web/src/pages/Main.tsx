import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth } from '../api/AuthContext';
import { useLiveLog } from '../api/useLiveLog';
import type { CaptureStatus, CdpTarget, ConfigInput, LogEntry, PublicConfig } from '../api/types';
import { formatTimestamp, renderCaption, sanitize } from '../utils/namer';
import './main.css';

const PRESETS = [
  { secs: 30, label: '30s' },
  { secs: 60, label: '1m' },
  { secs: 300, label: '5m' },
  { secs: 900, label: '15m' },
];
const DAYS = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
];
const DEFAULT_DAYS = DAYS.map((d) => d.id);

type DisplayRow = {
  key: string;
  filename: string;
  time: string;
  status: 'sending' | 'sent' | 'failed';
  error?: string | null;
};

export default function Main() {
  const { user, logout } = useAuth();

  const [disclaimerOpen, setDisclaimerOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const [targets, setTargets] = useState<CdpTarget[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetsLoading, setTargetsLoading] = useState(true);

  const [hasConfig, setHasConfig] = useState<boolean | null>(null);

  const [selectedTabId, setSelectedTabId] = useState('');
  const [selectedTabTitle, setSelectedTabTitle] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [isCustomInterval, setIsCustomInterval] = useState(false);
  const [customSecs, setCustomSecs] = useState('');
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [activeDays, setActiveDays] = useState<string[]>(DEFAULT_DAYS);
  const [namePattern, setNamePattern] = useState('');
  const [captionLabel, setCaptionLabel] = useState('');
  const [captionTemplate, setCaptionTemplate] = useState('{label} generated at {time} on {date}');
  const [botToken, setBotToken] = useState('');
  const [botTokenMasked, setBotTokenMasked] = useState('');
  const [channelId, setChannelId] = useState('');
  const [failureAlertThreshold, setFailureAlertThreshold] = useState(3);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  const [status, setStatus] = useState<CaptureStatus>({
    running: false,
    lastCaptureAt: null,
    lastStatus: null,
    nextTickAt: null,
    paused: false,
    pauseReason: null,
  });
  const [historyRows, setHistoryRows] = useState<LogEntry[]>([]);
  const wsMessages = useLiveLog(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { targets } = await api.get<{ targets: CdpTarget[] }>('/api/cdp/targets');
        setTargets(targets);
      } catch (err) {
        setTargetsError(err instanceof ApiError ? err.message : 'Could not list browser tabs.');
      } finally {
        setTargetsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { config } = await api.get<{ config: PublicConfig }>('/api/config');
        setHasConfig(true);
        applyConfig(config);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) setHasConfig(false);
      }
    })();
    (async () => {
      try {
        const { status } = await api.get<{ status: CaptureStatus }>('/api/capture/status');
        setStatus(status);
      } catch {
        /* ignore */
      }
    })();
    (async () => {
      try {
        const { logs } = await api.get<{ logs: LogEntry[] }>('/api/logs?category=telegram_send');
        setHistoryRows(logs);
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { status } = await api.get<{ status: CaptureStatus }>('/api/capture/status');
        setStatus(status);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  function applyConfig(config: PublicConfig) {
    setSelectedTabId(config.tabTargetId);
    setSelectedTabTitle(config.tabDisplayName);
    const preset = PRESETS.some((p) => p.secs === config.intervalSeconds);
    setIsCustomInterval(!preset);
    if (preset) setIntervalSeconds(config.intervalSeconds);
    else setCustomSecs(String(config.intervalSeconds));
    setStartTime(config.startTime);
    setEndTime(config.endTime);
    setActiveDays(config.activeDays);
    setScheduleStartDate(config.scheduleStartDate ?? '');
    setScheduleEndDate(config.scheduleEndDate ?? '');
    setNamePattern(config.namePattern);
    setBotTokenMasked(config.botTokenMasked);
    setChannelId(config.channelId);
    setCaptionLabel(config.captionLabel);
    setCaptionTemplate(config.captionTemplate);
    setFailureAlertThreshold(config.failureAlertThreshold);
  }

  function pickTab(t: CdpTarget) {
    setSelectedTabId(t.targetId);
    setSelectedTabTitle(t.title);
    const slug = sanitize(t.title) || 'frame';
    setNamePattern(slug);
    setCaptionLabel(slug);
  }

  function toggleDay(day: string) {
    setActiveDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function buildConfigInput(): ConfigInput {
    return {
      tabTargetId: selectedTabId,
      tabDisplayName: selectedTabTitle,
      intervalSeconds: isCustomInterval ? Number(customSecs) : intervalSeconds,
      namePattern,
      startTime,
      endTime,
      activeDays,
      scheduleStartDate: scheduleStartDate || null,
      scheduleEndDate: scheduleEndDate || null,
      botToken: botToken || undefined,
      channelId,
      captionLabel,
      captionTemplate,
      failureAlertThreshold,
    };
  }

  async function saveConfig(): Promise<void> {
    const { config } = await api.put<{ config: PublicConfig }>('/api/config', buildConfigInput());
    setBotTokenMasked(config.botTokenMasked);
    setBotToken('');
    setHasConfig(true);
  }

  async function handlePrimaryClick() {
    setSaveError(null);
    setToggleBusy(true);
    try {
      if (status.running) {
        const { status: newStatus } = await api.post<{ status: CaptureStatus }>('/api/capture/stop');
        setStatus(newStatus);
      } else {
        await saveConfig();
        const { status: newStatus } = await api.post<{ status: CaptureStatus }>('/api/capture/start');
        setStatus(newStatus);
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setToggleBusy(false);
    }
  }

  async function handleTestSend() {
    setTestState('sending');
    setTestError(null);
    try {
      await saveConfig();
      await api.post('/api/telegram/test');
      setTestState('sent');
    } catch (err) {
      setTestState('error');
      setTestError(err instanceof ApiError ? err.message : 'Could not send test frame.');
    }
  }

  async function handleAgreeDisclaimer() {
    try {
      await api.post('/api/disclaimer/accept');
    } catch {
      /* still let them through - the modal isn't a hard server-side gate */
    } finally {
      setDisclaimerOpen(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  const previewName = sanitize(namePattern || 'frame');
  const captionPreview = renderCaption(captionTemplate || '{label}', captionLabel || 'frame', now);

  const displayRows: DisplayRow[] = useMemo(() => {
    const wsIds = new Set(wsMessages.map((m) => m.id));
    const fromWs: DisplayRow[] = wsMessages.map((m) => ({
      key: `ws-${m.id}`,
      filename: m.filename,
      time: m.capturedAt ? new Date(m.capturedAt).toLocaleTimeString('en-GB') : now.toLocaleTimeString('en-GB'),
      status: m.status,
      error: m.error,
    }));
    const fromHistory: DisplayRow[] = historyRows
      .filter((r) => !wsIds.has(Number(r.id.split(':')[1])))
      .map((r) => ({
        key: r.id,
        filename: r.filename ?? '',
        time: new Date(r.createdAt).toLocaleTimeString('en-GB'),
        status: r.summary === 'Sent' ? 'sent' : r.summary === 'Sending…' ? 'sending' : 'failed',
        error: r.detail,
      }));
    return [...fromWs, ...fromHistory].slice(0, 150);
  }, [wsMessages, historyRows, now]);

  const framesSent = displayRows.filter((r) => r.status === 'sent').length;
  const lastSent = displayRows.find((r) => r.status === 'sent')?.time ?? '—';
  const nextIn = status.running && status.nextTickAt
    ? Math.max(0, Math.round((new Date(status.nextTickAt).getTime() - now.getTime()) / 1000))
    : null;

  const showNudge = !disclaimerOpen && hasConfig === false && !nudgeDismissed;
  const userInitial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="shell">
      {disclaimerOpen && (
        <div className="modal-scrim">
          <div className="modal-panel">
            <p className="panel-title" style={{ marginBottom: 12 }}>
              Before you capture
            </p>
            <p className="modal-body">
              EveryFrame screenshots exactly what's on the tab you point it at, on a schedule, with no human check in
              the loop before each frame is sent. You're responsible for choosing a tab that doesn't expose content
              you don't have the right to capture or share — private messages, someone else's screen, paywalled or
              copyrighted material, anything regulated where you operate. If what gets captured turns out to be
              illegal or against a service's terms, that responsibility is yours, not EveryFrame's.
            </p>
            <button className="btn-primary" onClick={handleAgreeDisclaimer}>
              Agree
            </button>
          </div>
        </div>
      )}

      <header>
        <div className="brand">
          <div className="wordmark display">EveryFrame</div>
          <div className="tagline">Capture a tab. Send it to Telegram. On schedule.</div>
        </div>
        <div className="appbar-right">
          <div className="status-pill">
            <div className={status.running ? 'dot live' : status.paused ? 'dot warn' : 'dot'} />
            <span>{status.running ? 'Capturing' : status.paused ? 'Paused — needs attention' : 'Idle'}</span>
          </div>
          <div className="user-menu">
            <button className="user-trigger" onClick={() => setUserMenuOpen((v) => !v)}>
              <div className="avatar">{userInitial}</div>
              <span className="user-name">{user?.displayName ?? user?.email}</span>
            </button>
            {userMenuOpen && (
              <div className="user-dropdown" onMouseLeave={() => setUserMenuOpen(false)}>
                <a className="dropdown-item" href="/settings">
                  Profile
                </a>
                <a className="dropdown-item" href="/storage">
                  Storage
                </a>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="content">
        {status.paused && (
          <div className="nudge nudge-warn">
            <div>
              Capture paused after repeated failures: {(status.pauseReason ?? 'unknown error').replace(/\.+$/, '')}.
              Fix the issue, then press "Start capturing" below to resume.
            </div>
          </div>
        )}

        {showNudge && (
          <div className="nudge">
            <div>You haven't set up a capture schedule yet. Pick a tab, an interval, and your active days below to get started.</div>
            <button className="nudge-dismiss" onClick={() => setNudgeDismissed(true)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="layout">
          <div className="rail">
            <p className="panel-title">Configure capture</p>

            <div className="step">
              <div className="step-head">
                <div className="step-num">1</div>
                <div className="step-label">Target tab</div>
              </div>
              {targetsLoading && <div className="hint">Loading open tabs…</div>}
              {targetsError && (
                <div>
                  <div className="error-text">{targetsError}</div>
                  <div className="hint" style={{ marginTop: 6 }}>
                    Launch Chrome with <code>--remote-debugging-port=9222</code> and reload this page.
                  </div>
                </div>
              )}
              {!targetsLoading && !targetsError && targets.length === 0 && (
                <div className="hint">No open tabs found on the connected Chrome instance.</div>
              )}
              {targets.map((t) => (
                <div
                  key={t.targetId}
                  className={t.targetId === selectedTabId ? 'tab-option selected' : 'tab-option'}
                  onClick={() => pickTab(t)}
                >
                  <div className="tab-radio" />
                  <div className="tab-title">{t.title}</div>
                  <div className="tab-url">{t.url}</div>
                </div>
              ))}
              <div className="hint" style={{ marginTop: 8 }}>
                Reads tabs from Chrome's remote debugging port. Only the selected tab is captured.
              </div>
            </div>

            <div className="step">
              <div className="step-head">
                <div className="step-num">2</div>
                <div className="step-label">Capture schedule</div>
              </div>
              <div className="pill-row">
                {PRESETS.map((p) => (
                  <div
                    key={p.secs}
                    className={!isCustomInterval && intervalSeconds === p.secs ? 'pill selected' : 'pill'}
                    onClick={() => {
                      setIsCustomInterval(false);
                      setIntervalSeconds(p.secs);
                    }}
                  >
                    {p.label}
                  </div>
                ))}
                <div className={isCustomInterval ? 'pill custom selected' : 'pill custom'}>
                  <input
                    type="number"
                    placeholder="—"
                    value={customSecs}
                    onFocus={() => setIsCustomInterval(true)}
                    onChange={(e) => {
                      setIsCustomInterval(true);
                      setCustomSecs(e.target.value);
                    }}
                  />{' '}
                  s
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>Schedule dates</label>
                <div className="time-row">
                  <input type="date" value={scheduleStartDate} onChange={(e) => setScheduleStartDate(e.target.value)} />
                  <span className="to">to</span>
                  <input type="date" value={scheduleEndDate} onChange={(e) => setScheduleEndDate(e.target.value)} />
                </div>
                <div className="hint">Leave blank to run indefinitely once started.</div>
              </div>
              <div className="field">
                <label>Active window</label>
                <div className="time-row">
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  <span className="to">to</span>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Active days</label>
                <div className="pill-row">
                  {DAYS.map((d) => (
                    <div
                      key={d.id}
                      className={activeDays.includes(d.id) ? 'pill selected' : 'pill'}
                      onClick={() => toggleDay(d.id)}
                    >
                      {d.label}
                    </div>
                  ))}
                </div>
                <div className="hint">Capture runs only within the active window, on selected days.</div>
              </div>
            </div>

            <div className="step">
              <div className="step-head">
                <div className="step-num">3</div>
                <div className="step-label">File name</div>
              </div>
              <div className="field">
                <label>Name override</label>
                <input type="text" value={namePattern} onChange={(e) => setNamePattern(e.target.value)} />
                <div className="hint">Sanitized automatically — spaces and symbols become hyphens.</div>
              </div>
              <div className="preview-box">
                <span>{previewName}</span>
                <span className="dim">_</span>
                <span>{formatTimestamp(now)}</span>
                <span className="dim">.png</span>
              </div>
            </div>

            <div className="step">
              <div className="step-head">
                <div className="step-num">4</div>
                <div className="step-label">Telegram delivery</div>
              </div>
              <div className="field">
                <label>Caption label</label>
                <input type="text" value={captionLabel} onChange={(e) => setCaptionLabel(e.target.value)} />
              </div>
              <div className="field">
                <label>Caption template</label>
                <input type="text" value={captionTemplate} onChange={(e) => setCaptionTemplate(e.target.value)} />
                <div className="hint">Tokens: {'{label}'}, {'{time}'}, {'{date}'}. Sent as the caption with every frame.</div>
              </div>
              <div className="preview-box" style={{ marginBottom: 14 }}>
                {captionPreview}
              </div>
              <div className="field">
                <label>Bot token</label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={botTokenMasked || 'Enter your bot token'}
                />
              </div>
              <div className="field">
                <label>Channel ID</label>
                <input type="text" value={channelId} onChange={(e) => setChannelId(e.target.value)} />
              </div>
              <div className="field">
                <label>Alert after consecutive failures</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={failureAlertThreshold}
                  onChange={(e) => setFailureAlertThreshold(Number(e.target.value))}
                  style={{ maxWidth: 90 }}
                />
                <div className="hint">
                  After this many failed captures/sends in a row, EveryFrame stops itself and sends one Telegram
                  alert explaining why. Set to 0 to disable.
                </div>
              </div>
              <div className="test-row">
                <button className="btn-ghost" onClick={handleTestSend} disabled={testState === 'sending'}>
                  {testState === 'sending' ? 'Sending…' : 'Send test frame'}
                </button>
                <div className="conn-status">
                  <div
                    className="dot"
                    style={{
                      background:
                        testState === 'sent' ? 'var(--teal)' : testState === 'error' ? 'var(--brick)' : testState === 'sending' ? 'var(--amber)' : 'var(--text-faint)',
                    }}
                  />
                  <span style={{ color: testState === 'sent' ? 'var(--teal)' : testState === 'error' ? 'var(--brick)' : 'inherit' }}>
                    {testState === 'idle' && 'Not tested'}
                    {testState === 'sending' && 'Sending…'}
                    {testState === 'sent' && 'Test frame delivered'}
                    {testState === 'error' && (testError ?? 'Failed')}
                  </span>
                </div>
              </div>
            </div>

            {saveError && <div className="error-text" style={{ marginBottom: 8 }}>{saveError}</div>}
            <button
              className={status.running ? 'btn-primary active' : 'btn-primary'}
              style={{ width: '100%' }}
              onClick={handlePrimaryClick}
              disabled={toggleBusy || !selectedTabId}
            >
              {toggleBusy ? 'Working…' : status.running ? 'Stop capturing' : 'Start capturing'}
            </button>
          </div>

          <div className="sprockets">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} />
            ))}
          </div>

          <div className="log">
            <p className="panel-title">Capture log</p>
            <div className="stats">
              <div>
                <div className="stat-num">{framesSent}</div>
                <div className="stat-label">frames sent</div>
              </div>
              <div>
                <div className="stat-num">{nextIn !== null ? `${nextIn}s` : '—'}</div>
                <div className="stat-label">next capture</div>
              </div>
              <div>
                <div className="stat-num">{lastSent}</div>
                <div className="stat-label">last sent</div>
              </div>
            </div>
            <div className="log-area">
              {displayRows.length === 0 && (
                <div className="empty-state">
                  <div className="frame-outline" />
                  Frames will appear here once capture starts.
                </div>
              )}
              {displayRows.length > 0 && (
                <div className="log-strip">
                  {displayRows.map((row) => (
                    <div className="log-row" key={row.key}>
                      <div className="frame-thumb" />
                      <div className="log-file">{row.filename}</div>
                      <div className="log-time">{row.time}</div>
                      <div className={`chip ${row.status}`}>
                        <div className="dot" />
                        {row.status === 'sent' && 'Sent'}
                        {row.status === 'sending' && 'Sending…'}
                        {row.status === 'failed' && 'Failed'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
