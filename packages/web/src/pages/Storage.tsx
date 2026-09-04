import { useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import type { ArchiveEvent, StorageSettings } from '../api/types';
import './storage.css';

function mbLabel(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}

export default function Storage() {
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [thresholdMb, setThresholdMb] = useState(5000);
  const [archivePath, setArchivePath] = useState('');
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<ArchiveEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function loadSettings() {
    const { settings } = await api.get<{ settings: StorageSettings }>('/api/storage/settings');
    setSettings(settings);
    setThresholdMb(settings.thresholdMb);
    setArchivePath(settings.archivePath ?? '');
  }

  async function loadHistory() {
    const { history } = await api.get<{ history: ArchiveEvent[] }>('/api/storage/history');
    setHistory(history);
  }

  useEffect(() => {
    loadSettings().catch(() => {});
    loadHistory().catch(() => {});
  }, []);

  async function onSaveThreshold() {
    setSaving(true);
    setSaveError(null);
    try {
      const { settings } = await api.put<{ settings: StorageSettings }>('/api/storage/settings', {
        thresholdMb: Number(thresholdMb),
        archivePath: archivePath || null,
      });
      setSettings(settings);
      setThresholdSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function onRunArchive() {
    setRunning(true);
    setRunError(null);
    try {
      await api.post('/api/storage/archive');
      await Promise.all([loadSettings(), loadHistory()]);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Archive run failed.');
    } finally {
      setRunning(false);
    }
  }

  const usedMb = settings?.usedMb ?? 0;
  const pct = thresholdMb > 0 ? Math.min(100, (usedMb / thresholdMb) * 100) : 0;

  return (
    <div className="shell">
      <header>
        <div className="wordmark display">EveryFrame</div>
        <a className="back-link" href="/">
          ← Back to capture
        </a>
      </header>

      <div className="content">
        <p className="page-title">Storage &amp; archiving</p>

        <div className="panel">
          <p className="panel-title">Current usage</p>
          <div className="usage-row">
            <div className="usage-num">{mbLabel(usedMb)}</div>
            <div className="usage-sub">of {mbLabel(thresholdMb)} threshold</div>
          </div>
          <div className="usage-bar">
            <div className={pct >= 100 ? 'usage-fill over' : 'usage-fill'} style={{ width: `${pct}%` }} />
          </div>
          <div className="row-gap">
            <div className="field">
              <label>Archive when usage exceeds (MB)</label>
              <input
                type="number"
                value={thresholdMb}
                onChange={(e) => {
                  setThresholdMb(Number(e.target.value));
                  setThresholdSaved(false);
                }}
              />
            </div>
            <button className="btn-primary" onClick={onSaveThreshold} disabled={saving}>
              Save
            </button>
            {thresholdSaved && <span className="saved-note">Saved</span>}
          </div>
          {saveError && <div className="error-text">{saveError}</div>}
        </div>

        <div className="panel">
          <p className="panel-title">Archive destination</p>
          <div className="field" style={{ maxWidth: '100%', marginBottom: 14 }}>
            <label>Local folder path</label>
            <input
              type="text"
              value={archivePath}
              onChange={(e) => {
                setArchivePath(e.target.value);
                setThresholdSaved(false);
              }}
              placeholder="/Volumes/Backup/everyframe-archive"
            />
            <div className="hint">
              Past the threshold, EveryFrame moves your oldest captures here and removes them from captures/.
            </div>
          </div>
          <div className="row-gap">
            <button className="btn-ghost" onClick={onRunArchive} disabled={running}>
              Run archive now
            </button>
            {running && (
              <div className="running-note">
                <div className="running-dot" /> Moving old captures…
              </div>
            )}
          </div>
          {runError && <div className="error-text">{runError}</div>}
        </div>

        <div className="panel">
          <p className="panel-title">Archive history</p>
          {history.length === 0 && <div className="hint">No archive runs yet.</div>}
          {history.length > 0 && (
            <div className="archive-strip">
              {history.map((row) => (
                <div className="archive-row" key={row.id}>
                  <div className="archive-date">{new Date(row.archived_at).toLocaleString()}</div>
                  <div className="archive-dest">
                    {row.file_count} files → {row.destination_path}
                  </div>
                  <div className="archive-size">{mbLabel(row.total_size_mb)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
