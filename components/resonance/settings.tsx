/* oxlint-disable next/no-html-link-for-pages -- Sign-out is a top-level browser navigation. */
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
import { ConnectionOptions } from './account';
import { exportArchive } from '@/components/karina/export-archive';
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
  const [erase, setErase] = useState(false),
    [confirmation, setConfirmation] = useState('');
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
      description={
        mode === 'sample'
          ? 'Sample collection · this device'
          : 'Your private Resonance account'
      }
      wide
    >
      <div className="settings-content">
        {mode === 'personal' && (
          <section className="account-identity">
            <h3>{store.account?.name}</h3>
            <p>
              Your music and memories are saved to this account. Sign in the
              same way on another device to pick up where you left off.
            </p>
            <div className="button-row">
              <a
                className="button"
                href="/signout-with-chatgpt?return_to=%2F"
                target="_top"
                onClick={store.signOut}
              >
                Sign out
              </a>
              <button className="text-button" onClick={store.reload}>
                Reload my room
              </button>
            </div>
            <ConnectionOptions />
          </section>
        )}

        <section>
          <h3>Keep a copy</h3>
          <p>
            {mode === 'sample'
              ? 'This sample stays on this device and never mixes with your account.'
              : 'Your room is saved automatically after each successful change. Export a portable copy of your records, memories, capsules and images whenever you want.'}
          </p>
          <div className="button-row">
            {store.undoCount > 0 && (
              <button className="button quiet" onClick={store.undo}>
                <RotateCcw size={16} /> Undo last change
              </button>
            )}
            <button
              className="button"
              onClick={() =>
                download(
                  `resonance-${mode}-${new Date().toISOString().slice(0, 10)}.json`,
                  serializeBackup(state),
                )
              }
            >
              <Download size={16} /> Export room backup
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
          {(store.legacyError || (mode === 'sample' && store.error)) && (
            <button
              className="text-link"
              onClick={async () => {
                try {
                  download(
                    'resonance-original-storage.txt',
                    localStorage.getItem(
                      `resonance:${store.legacyError ? 'personal' : mode}:v1`,
                    ) || '',
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
                  onClick={async () => {
                    if (
                      await commit(
                        restore,
                        'Backup restored successfully.',
                        true,
                      )
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
          <details>
            <summary>Advanced: ListenBrainz import</summary>
            <p>
              Import a ListenBrainz JSON file, or fetch up to 1,000 recent
              public listens when the provider adapter is configured. Nothing
              from your journal is sent to ListenBrainz.
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
                  Source: {imported.user}. {imported.skipped} invalid or
                  duplicate rows skipped. Previously imported records will not
                  be counted again.
                </p>
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={async () => {
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
                        await commit(
                          next,
                          `${n} new ListenBrainz records imported.`,
                        )
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
          </details>
        </section>
        <section>
          <h3>{mode === 'sample' ? 'Sample collection' : 'Clear your room'}</h3>
          <p>
            {mode === 'sample'
              ? 'Sample edits never affect your personal music. Reset the sample any time.'
              : 'Clear the records, memories and capsules saved in your account. Your listening archive and connections are managed separately. Download a backup first if you want to keep it.'}
          </p>
          {mode === 'sample' ? (
            <button
              className="button"
              onClick={async () => {
                if (
                  await commit(sampleState(), 'Sample collection reset.', true)
                )
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
                capsules and {state.moments.length} moments from your account?
              </p>
              <div className="button-row">
                <button
                  className="button danger"
                  onClick={async () => {
                    if (
                      await commit(
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
        {mode === 'personal' && (
          <section>
            <h3>Listening archive</h3>
            <p>
              Download your separately recorded listening history, including its
              original sources.
            </p>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await exportArchive();
                  setMessage('Listening history exported.');
                } catch {
                  setError('Export could not finish. Please try again.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Export listening history
            </button>
          </section>
        )}
        {mode === 'personal' && (
          <section>
            <h3>Delete Resonance account data</h3>
            <p>
              Remove your room, uploaded capsule images, listening archive and
              saved connections. Background updates stop. This does not delete
              your ChatGPT, Spotify or Discord accounts or replies already
              posted in Discord.
            </p>
            {!erase ? (
              <button className="button danger" onClick={() => setErase(true)}>
                Delete my Resonance data
              </button>
            ) : (
              <div className="confirm-block">
                <label>
                  Type DELETE to confirm
                  <input
                    className="account-delete-input"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <div className="button-row">
                  <button
                    className="button danger"
                    disabled={confirmation !== 'DELETE' || store.saving}
                    onClick={() => void store.eraseAccount()}
                  >
                    Permanently delete and sign out
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      setErase(false);
                      setConfirmation('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
        {(error || store.error) && (
          <p className="error-message" role="alert">
            <AlertCircle size={16} />
            {error || store.error}
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
