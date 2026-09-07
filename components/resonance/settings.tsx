'use client';
import { useState } from 'react';
import {
  Download,
  Upload,
  ArrowUpRight,
  RotateCcw,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Modal, download, dateLabel } from './shared';
import {
  EMPTY_STATE,
  validateBackup,
  serializeBackup,
  normalizeListens,
  mergeListens,
  sampleState,
} from '@/lib/resonance/domain';
import type { State, Moment } from '@/lib/resonance/domain';
import type { CollectionStore } from '@/lib/resonance/use-collection';
export function Settings({
  store,
  onClose,
}: {
  store: CollectionStore;
  onClose: () => void;
}) {
  const { state, mode, commit } = store;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [restore, setRestore] = useState<State>();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [user, setUser] = useState('');
  const [imported, setImported] = useState<{
    moments: Moment[];
    user: string;
    skipped: number;
  }>();
  const [busy, setBusy] = useState(false);
  async function backup(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (file.size > 16 * 1024 * 1024)
        throw Error('Backup is too large (maximum 16 MB).');
      setRestore(validateBackup(await file.text()));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'This backup could not be read.',
      );
    }
  }
  function stageHistory(body: unknown) {
    const b = body as {
      payload?: { listens?: unknown[]; user_id?: string };
      listens?: unknown[];
      user_id?: string;
    };
    const raw = Array.isArray(body) ? body : b?.payload?.listens || b?.listens;
    if (!Array.isArray(raw) || raw.length > 100000)
      throw Error(
        'Choose a ListenBrainz JSON response containing a listens array (maximum 100,000).',
      );
    const username =
      user.trim() || b?.payload?.user_id || b?.user_id || 'file-import';
    const moments = normalizeListens(raw, username);
    if (!moments.length)
      throw Error(
        'No valid dated listens were found. Your collection has not changed.',
      );
    setImported({
      moments,
      user: username,
      skipped: raw.length - moments.length,
    });
    setMessage('');
  }
  async function historyFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024)
        throw Error('Import must be under 16 MB.');
      stageHistory(JSON.parse(await file.text()));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read history file.');
    }
  }
  async function fetchHistory() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(
        `/api/providers?kind=history&user=${encodeURIComponent(user.trim())}`,
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw Error(body.error || 'ListenBrainz is unavailable.');
      stageHistory(body);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'You are offline. You can import a history file instead.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Your room. Your rules."
      description={`${mode === 'sample' ? 'Sample collection' : 'Personal collection'} · This browser and device`}
      wide
    >
      <div className="settings-content">
        <section>
          <h3>Keep a copy</h3>
          <p>
            Your collection lives in this browser. Clearing site data removes
            it; browser storage is not a cloud backup. Export regularly, and
            restore the file on another device.
          </p>
          <div className="button-row">
            <button
              className="button"
              onClick={() =>
                download(
                  `resonance-${mode}-${new Date().toISOString().slice(0, 10)}.json`,
                  serializeBackup(state),
                )
              }
            >
              <Download size={16} /> Export backup
            </button>
            <label className="button">
              <Upload size={16} /> Restore backup
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  void backup(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {store.error && (
            <button
              className="text-link"
              onClick={() => {
                try {
                  download(
                    'resonance-original-storage.txt',
                    localStorage.getItem(`resonance:${mode}:v1`) || '',
                    'text/plain',
                  );
                } catch {
                  setError('This browser is blocking access to stored data.');
                }
              }}
            >
              Download original storage for recovery
            </button>
          )}
          {restore && (
            <div className="confirm-block">
              <h3>Replace this {mode} collection?</h3>
              <p>
                This backup contains {restore.items.length} records,{' '}
                {restore.capsules.length} capsules and {restore.moments.length}{' '}
                moments. Export your current collection first if you want to
                keep it.
              </p>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => {
                    if (
                      commit(restore, 'Backup restored successfully.', true)
                    ) {
                      setRestore(undefined);
                      setMessage(
                        'Recovery complete. Your restored music is ready.',
                      );
                    }
                  }}
                >
                  Restore this backup
                </button>
                <button
                  className="button quiet"
                  onClick={() => setRestore(undefined)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
        <section>
          <div className="setting-switch">
            <div>
              <h3>Lower effects</h3>
              <p>
                Keep the ribbon still and remove depth and scroll animations.
              </p>
            </div>
            <Switch
              aria-label="Lower effects"
              checked={state.preferences.lowerEffects}
              onCheckedChange={(v) =>
                commit(
                  {
                    ...state,
                    preferences: { ...state.preferences, lowerEffects: v },
                  },
                  v ? 'Lower effects enabled.' : 'Motion restored.',
                )
              }
            />
          </div>
          <p>
            Reduced motion in your device settings is always respected. No sound
            effects.
          </p>
        </section>
        <section>
          <h3>Listening history</h3>
          <p>
            Import a ListenBrainz JSON file, or fetch up to 1,000 recent public
            listens when the provider adapter is configured. Nothing from your
            journal is sent to ListenBrainz.
          </p>
          <label className="field">
            ListenBrainz username{' '}
            <span className="optional">identifies the source</span>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              maxLength={64}
              placeholder="Your username"
            />
          </label>
          <div className="button-row">
            <label className="button">
              <Upload size={16} /> Import history file
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  void historyFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              className="button"
              disabled={!user.trim() || busy}
              onClick={fetchHistory}
            >
              {busy ? 'Fetching…' : 'Fetch public history'}
            </button>
            <a
              className="text-link"
              href="https://listenbrainz.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              ListenBrainz <ArrowUpRight size={14} />
            </a>
          </div>
          {imported && (
            <div className="confirm-block">
              <h3>{imported.moments.length} valid listens ready</h3>
              <p>
                Source: {imported.user}. {imported.skipped} invalid or duplicate
                rows skipped. Previously imported records will not be counted
                again.
              </p>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => {
                    const dates = imported.moments.map((m) => m.date).sort();
                    const next = mergeListens(state, imported.moments, {
                      source: 'listenbrainz',
                      user: imported.user,
                      from: dates[0],
                      to: dates.at(-1)!,
                      importedAt: new Date().toISOString(),
                    });
                    const n = next.moments.length - state.moments.length;
                    if (
                      commit(next, `${n} new ListenBrainz records imported.`)
                    ) {
                      setImported(undefined);
                      setMessage(
                        `${n} new listens added. Imported history is labelled separately in Atlas.`,
                      );
                    }
                  }}
                >
                  Import these listens
                </button>
                <button
                  className="button quiet"
                  onClick={() => setImported(undefined)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {state.historyCoverage && (
            <p className="provenance">
              Last import: {dateLabel(state.historyCoverage.importedAt)}.
              Imported date span may contain gaps.
            </p>
          )}
        </section>
        <section>
          <div className="connection-row">
            <strong>Spotify</strong>
            <span className="connection-state">Link handoff ready</span>
          </div>
          <p>
            Open saved Spotify links in Spotify. API connection, playlist export
            and in-app playback are not configured for this release.
          </p>
          <div className="connection-row">
            <strong>MusicBrainz</strong>
            <span className="connection-state">Optional metadata</span>
          </div>
          <p>
            Manual entries work immediately. Matching uses the optional
            identified server adapter. You can also search MusicBrainz and
            correct an entry yourself.
          </p>
        </section>
        <section>
          <h3>
            {mode === 'sample' ? 'Sample collection' : 'Delete local data'}
          </h3>
          <p>
            {mode === 'sample'
              ? 'Sample edits never affect your personal music. Reset the sample any time.'
              : 'Delete this personal collection from this browser. Download a backup first if you want to keep it.'}
          </p>
          {mode === 'sample' ? (
            <button
              className="button"
              onClick={() => {
                if (commit(sampleState(), 'Sample collection reset.', true))
                  setMessage(
                    'Sample restored. Your personal collection is unchanged.',
                  );
              }}
            >
              <RotateCcw size={16} /> Reset sample
            </button>
          ) : (
            <button
              className="button danger"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 size={16} /> Delete personal collection
            </button>
          )}
          {deleteConfirm && (
            <div className="confirm-block">
              <p>
                Delete all {state.items.length} records, {state.capsules.length}{' '}
                capsules and {state.moments.length} moments on this device?
              </p>
              <div className="button-row">
                <button
                  className="button danger"
                  onClick={() => {
                    if (
                      commit(
                        structuredClone(EMPTY_STATE),
                        'Personal collection deleted. Undo is available.',
                        true,
                      )
                    ) {
                      setDeleteConfirm(false);
                      setMessage('Personal collection deleted.');
                    }
                  }}
                >
                  Delete this collection
                </button>
                <button
                  className="button quiet"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
        {error && (
          <p className="error-message" role="alert">
            <AlertCircle size={16} />
            {error}
          </p>
        )}
        {message && (
          <output className="success-message">
            <Check size={16} />
            {message}
          </output>
        )}
      </div>
    </Modal>
  );
}
