/* oxlint-disable next/no-html-link-for-pages -- Auth redirects and history downloads require top-level navigation. */
'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '@/components/resonance/shared';
import { api, useArchive, type ArchiveStatus } from './use-archive';
import { SpotifyPlaying } from './spotify-playing';
import { exportArchive } from './export-archive';
const providerLabels = {
  lastfm: 'Listening history',
  discord: 'Discord',
  spotify: 'Spotify',
};
const commands = [
  ['/fm', 'What’s playing', 'Track, artist and provider link.'],
  ['/recent', 'Your recent tracks', 'The latest recorded listens.'],
  ['/topartists', 'Your top artists', 'Ranked artists and play counts.'],
  ['/toptracks', 'Your top tracks', 'Ranked tracks and play counts.'],
  ['/topalbums', 'Your top albums', 'Ranked albums and play counts.'],
  [
    '/artistplays',
    'An artist, over time',
    'All-time count and first recorded listen.',
  ],
  [
    '/discoveries',
    'First recorded artists',
    'Explore artist arrivals in your available history.',
  ],
  [
    '/stats',
    'Your listening, counted',
    'Recorded plays, artists, tracks and coverage.',
  ],
  [
    '/chart',
    'Your week in colour',
    'A listening chart posted into the conversation.',
  ],
  [
    '/sync',
    'Refresh your archive',
    'Queue the next page of history. Private reply.',
  ],
  ['/connect', 'Link your account', 'A private link back to Resonance.'],
];
export function Karina({ onListening }: { onListening: () => void }) {
  const { status, error, reload } = useArchive();
  const [exporting, setExporting] = useState(false);
  async function saveArchive() {
    setExporting(true);
    try {
      await exportArchive();
      setNotice('History exported.');
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        setNotice(
          'Export could not finish. Please retry; your archive is unchanged.',
        );
    } finally {
      setExporting(false);
    }
  }
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [syncing, setSyncing] = useState(false),
    [setup, setSetup] = useState(false),
    [remove, setRemove] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
  const syncRun = useRef<AbortController | null>(null);
  useEffect(() => () => syncRun.current?.abort(), []);
  useEffect(() => {
    const update = () => {
      const result = new URLSearchParams(location.search).get('connection');
      if (result) {
        setNotice(
          result === 'success'
            ? 'Your account is connected.'
            : result === 'archive-conflict'
              ? 'A different or unverified Last.fm archive is retained. Export and delete it before linking this account.'
              : result === 'cancelled'
                ? 'Connection cancelled. You can try again whenever you’re ready.'
                : result === 'account-conflict'
                  ? 'This music or Discord account is already linked to another Resonance account. Sign in to that Resonance account to manage it.'
                  : result === 'spotify-access'
                    ? 'Spotify has not enabled access for this account. Resonance currently has limited beta access.'
                    : result === 'provider-busy'
                      ? 'Spotify is busy. Wait a little and try connecting again.'
                      : result === 'expired'
                        ? 'The Spotify connection expired. Please try connecting again.'
                        : 'That connection could not complete. Please try again.',
        );
        history.replaceState(null, '', location.pathname + '?space=Karina');
      }
    };
    queueMicrotask(update);
  }, []);
  const lastfm = status?.connected.find((c) => c.provider === 'lastfm');
  async function sync() {
    if (syncRun.current) return;
    const run = new AbortController();
    syncRun.current = run;
    setSyncing(true);
    try {
      while (!run.signal.aborted) {
        const data = await api<{ message: string; complete?: boolean }>(
          '/api/karina/sync',
          {},
        );
        if (run.signal.aborted) break;
        setNotice(data.message);
        const next = await reload();
        if (
          data.complete ||
          !next?.connected.some((c) => c.provider === 'lastfm')
        )
          break;
        // Follow the server's backoff; every completed page is already durable.
        const delay = Math.max(2000, (next.sync?.next_run || 0) - Date.now());
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            run.signal.removeEventListener('abort', finish);
            resolve();
          };
          const timer = setTimeout(finish, Math.min(delay, 60000));
          if (run.signal.aborted) finish();
          else run.signal.addEventListener('abort', finish, { once: true });
        });
      }
    } catch (e) {
      if (!run.signal.aborted) setNotice((e as Error).message);
    } finally {
      if (syncRun.current === run) syncRun.current = null;
      setSyncing(false);
    }
  }
  function pauseSync() {
    syncRun.current?.abort();
    setNotice(
      'Import paused here. Saved pages are kept; any connected background scheduler can still continue.',
    );
  }
  async function disconnect() {
    if (!remove) return;
    pauseSync();
    setBusy(true);
    try {
      await api('/api/karina', { action: 'disconnect', provider: remove });
      setRemove(null);
      setNotice(
        remove === 'spotify'
          ? 'Spotify disconnected. Your saved Spotify connection details have been deleted.'
          : 'Disconnected. Previously imported history remains in your archive until you delete it.',
      );
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    if (!deleting) return;
    pauseSync();
    setBusy(true);
    try {
      await api('/api/karina', { action: 'delete', source: deleting });
      setDeleting(null);
      setNotice(
        'History deleted. Last.fm sync, if selected, has also stopped.',
      );
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [checkedAt] = useState(() => Date.now());
  const schedulerActive =
    !!status?.schedulerLastSeen &&
    checkedAt - status.schedulerLastSeen < 12 * 60000;
  return (
    <div className="karina-space">
      <section className="karina-hero" data-parallax="18">
        <div>
          <p className="eyebrow">Your music. In the conversation.</p>
          <h2>
            Meet <em>Karina.</em>
          </h2>
          <p>
            Your Resonance listening archive, in the places you talk. Share a
            track, your all-time favourites, or the shape of your week.
          </p>
          <div className="button-row">
            <button className="button primary" onClick={() => setSetup(true)}>
              Connect your music <ArrowUpRight size={16} />
            </button>
            {status?.installUrl ? (
              <a
                className="button"
                href={status.installUrl}
                target="_blank"
                rel="noreferrer"
              >
                Add to my Discord
              </a>
            ) : (
              <span className="setup-caption">
                Connect once, then use Karina in Discord.
              </span>
            )}
          </div>
          <div className="context-labels">
            <span>Direct messages</span>
            <span>Group chats</span>
            <span>Servers</span>
          </div>
        </div>
        <div className="karina-orb" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>k.</span>
        </div>
      </section>
      {(error || notice) && (
        <output className={error ? 'error-message' : 'archive-notice'}>
          {error || notice}
        </output>
      )}
      {status && !status.signedIn && (
        <div className="archive-signin">
          <ShieldCheck size={22} />
          <div>
            <strong>One private account for your archive.</strong>
            <p>Sign in, then link the services you want to use.</p>
          </div>
          <a
            className="button"
            href="/signin-with-chatgpt?return_to=/?space=Karina"
          >
            Sign in
          </a>
        </div>
      )}
      <section className="connection-section">
        <div className="section-heading">
          <h3>Your connections.</h3>
          <button className="text-button" onClick={() => void reload()}>
            Refresh <RefreshCw size={14} />
          </button>
        </div>
        <div className="connection-list">
          {(['spotify', 'discord', 'lastfm'] as const).map((p, i) => {
            const linked = status?.connected.find((c) => c.provider === p);
            const configured = status?.configured[p];
            return (
              <div className="connection-row" key={p}>
                <span className="connection-number">0{i + 1}</span>
                <div>
                  <h4>{providerLabels[p]}</h4>
                  <p>
                    {linked
                      ? `Connected as ${linked.name}`
                      : p === 'lastfm'
                        ? 'Use Last.fm’s recorded listens for your Resonance archive and statistics.'
                        : p === 'discord'
                          ? 'Link your identity, then install Karina on your account.'
                          : 'Show what you’re playing on Spotify, here and with Karina’s /fm command.'}
                  </p>
                </div>
                <span
                  className={`connection-state ${linked ? 'connected' : ''}`}
                >
                  {linked ? (
                    <>
                      <Check size={14} /> Connected
                    </>
                  ) : configured ? (
                    'Ready to connect'
                  ) : status ? (
                    'Not available yet'
                  ) : (
                    'Checking…'
                  )}
                </span>
                {linked ? (
                  <button className="text-button" onClick={() => setRemove(p)}>
                    Disconnect
                  </button>
                ) : (
                  <ConnectButton provider={p} status={status} />
                )}
              </div>
            );
          })}
        </div>
      </section>
      {status?.connected.some((c) => c.provider === 'spotify') && (
        <SpotifyPlaying onConnectionChange={reload} />
      )}
      <div className="karina-columns">
        <section className="sync-panel">
          <p className="eyebrow">The archive keeps growing</p>
          <h3>
            Past listens.
            <br />
            Next listens.
          </h3>
          <p>
            Resonance stores and calculates your listening history. Ongoing
            Spotify history currently uses Last.fm as a bridge: connect Spotify
            there once, then authorize the bridge here.
          </p>
          <dl>
            <div>
              <dt>Recorded history</dt>
              <dd>
                {status?.sources
                  .reduce((n, s) => n + s.count, 0)
                  .toLocaleString() || '0'}{' '}
                records
              </dd>
            </div>
            <div>
              <dt>Background sync</dt>
              <dd>
                {schedulerActive
                  ? 'Scheduler connected'
                  : 'Automatic updates not active'}
              </dd>
            </div>
            <div>
              <dt>Last successful page</dt>
              <dd>
                {status?.sync?.last_success
                  ? new Date(status.sync.last_success).toLocaleString('en-GB')
                  : 'Not synced yet'}
              </dd>
            </div>
            {status?.sync && (
              <div>
                <dt>Archive progress</dt>
                <dd>
                  {status.sync.phase === 'backfill'
                    ? `Backfill · page ${status.sync.page}`
                    : 'Checking new listens'}
                </dd>
              </div>
            )}
          </dl>
          {status?.sync?.error && (
            <p className="error-message">{status.sync.error}</p>
          )}
          <div className="button-row">
            <button
              className="button"
              disabled={!lastfm || busy || syncing}
              onClick={() => void sync()}
            >
              <RefreshCw size={15} />
              {syncing ? 'Importing history…' : 'Sync listening history'}
            </button>
            {syncing && (
              <button className="text-button" onClick={pauseSync}>
                Pause import
              </button>
            )}
            <button className="text-button" onClick={onListening}>
              Open listening history <ArrowUpRight size={15} />
            </button>
          </div>
          {syncing && (
            <p className="chart-note">
              Keep this page open while your history imports. You can pause and
              resume without losing saved listens.
            </p>
          )}
        </section>
        <section className="discord-preview">
          <div className="discord-message-author">
            <span className="karina-avatar">k.</span>
            <strong>Karina</strong>
            <span className="bot-tag">APP</span>
            <span>Example reply</span>
          </div>
          <div className="discord-embed">
            <small>TOP ARTISTS · PAST 7 DAYS</small>
            <h4>Your week, on repeat.</h4>
            <p>
              <b>01</b> aespa <span>42 plays</span>
            </p>
            <p>
              <b>02</b> Nujabes <span>31 plays</span>
            </p>
            <p>
              <b>03</b> Sade <span>18 plays</span>
            </p>
            <footer>Illustrative sample · Resonance archive</footer>
          </div>
          <p className="chart-note">
            Listening replies are public in the conversation where you run the
            command. Linking and account controls reply privately.
          </p>
        </section>
      </div>
      <section className="command-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Same account. Every conversation.</p>
            <h3>Just ask Karina.</h3>
          </div>
          <MessageCircle size={24} />
        </div>
        <p className="command-intro">
          Slash commands work in DMs, group DMs and eligible servers. Top lists
          and statistics support 7 days, 30 days, 90 days, a year and all
          available history.
        </p>
        <div className="command-list">
          {commands.map(([cmd, title, detail]) => (
            <div key={cmd}>
              <code>{cmd}</code>
              <strong>{title}</strong>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="archive-controls">
        <div>
          <h3>Your archive is yours.</h3>
          <p>
            Export it whenever you want. Disconnecting stops future sync;
            deleting removes the selected source.
          </p>
        </div>
        <div className="button-row">
          <button
            className="button"
            disabled={!status?.signedIn || exporting}
            onClick={() => void saveArchive()}
          >
            {exporting ? 'Exporting…' : 'Export history'}
          </button>
          {status?.sources.map((s) => (
            <button
              key={s.source}
              className="text-button"
              onClick={() => setDeleting(s.source)}
            >
              Delete {s.source} history
            </button>
          ))}
        </div>
      </div>
      {lastfm && (
        <a
          className="lastfm-attribution"
          href={`https://www.last.fm/user/${encodeURIComponent(lastfm.name)}`}
          target="_blank"
          rel="noreferrer"
        >
          Powered by AudioScrobbler · {lastfm.name} on Last.fm{' '}
          <ArrowUpRight size={14} />
        </a>
      )}
      <Modal
        open={setup}
        onClose={() => setSetup(false)}
        title="Connect your music."
        description="Your connections belong to your Resonance account. Choose what to share, and disconnect whenever you want."
        wide
      >
        <ol className="setup-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Connect Spotify</h3>
              <p>
                Approve access on Spotify’s own website. Resonance securely
                keeps your connection so Karina can check what you’re playing
                when you use /fm. We never receive your Spotify password.
              </p>
              <ConnectButton provider="spotify" status={status} />
              <p className="setup-caption">
                Spotify access is currently a limited beta. This connection
                shares current playback; it does not recover your lifetime
                history.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Link Discord</h3>
              <p>
                Connect your Discord identity to the same Resonance account,
                then add Karina to Discord. Listening commands share your
                results in the conversation where you run them.
              </p>
              <div className="button-row">
                <ConnectButton provider="discord" status={status} />
                {status?.installUrl && (
                  <a
                    className="button small"
                    href={status.installUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Add Karina to Discord
                  </a>
                )}
              </div>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Add your listening history</h3>
              <p>
                For ongoing Spotify statistics, connect Spotify in your Last.fm
                account, then link Last.fm here. Resonance builds your archive,
                charts and Karina replies from those recorded listens. No API
                keys or Last.fm Pro subscription are needed from you.
              </p>
              <div className="button-row">
                <ConnectButton provider="lastfm" status={status} />
                <a
                  className="text-button"
                  href="https://www.last.fm/settings/applications"
                  target="_blank"
                  rel="noreferrer"
                >
                  Connect Spotify in Last.fm <ArrowUpRight size={14} />
                </a>
              </div>
              <p>
                Recording starts when the bridge is connected. Earlier history
                must already exist in your bridge account or come from a
                supported import; it does not appear automatically.
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setSetup(false);
                  onListening();
                }}
              >
                Open your listening archive <ArrowUpRight size={14} />
              </button>
            </div>
          </li>
        </ol>
        <p className="connection-privacy">
          Music replies are visible in the Discord conversation where you run
          them. Account controls are private.{' '}
          <a href="/privacy" target="_blank" rel="noreferrer">
            How Resonance uses your data
          </a>
        </p>
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => !busy && setRemove(null)}
        title={`Disconnect ${remove || ''}?`}
        description={
          remove === 'spotify'
            ? 'Resonance will delete your saved Spotify identity and access tokens. Karina will stop checking your Spotify playback. You can also remove Resonance from Spotify’s account settings.'
            : 'Future access from Resonance stops. Imported history remains until you delete it. You can also revoke the app from the provider’s account settings.'
        }
      >
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void disconnect()}
        >
          Disconnect account
        </button>
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        title="Delete this listening history?"
        description="This permanently deletes the selected source from your account. Deleting Last.fm also disconnects it and stops sync. Export first if you want a copy."
      >
        <button
          className="button"
          disabled={exporting}
          onClick={() => void saveArchive()}
        >
          {exporting ? 'Exporting…' : 'Export first'}
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void erase()}
        >
          Delete history
        </button>
      </Modal>
    </div>
  );
}
function ConnectButton({
  provider,
  status,
}: {
  provider: 'spotify' | 'discord' | 'lastfm';
  status: ArchiveStatus | null;
}) {
  const label =
    provider === 'lastfm'
      ? 'Connect Last.fm'
      : `Connect ${providerLabels[provider]}`;
  if (!status)
    return (
      <button className="button small" disabled>
        Checking…
      </button>
    );
  if (status.connected.some((c) => c.provider === provider))
    return (
      <span className="connection-state connected">
        <Check size={14} /> Connected
      </span>
    );
  if (!status.configured[provider])
    return (
      <button className="button small" disabled>
        Not available yet
      </button>
    );
  if (!status.signedIn)
    return (
      <a
        className="button small"
        href="/signin-with-chatgpt?return_to=%2F%3Fspace%3DKarina"
        target="_top"
      >
        Sign in to connect
      </a>
    );
  return (
    <a
      className="button small"
      href={`/api/karina/oauth/${provider}`}
      target="_top"
    >
      {label}
    </a>
  );
}
