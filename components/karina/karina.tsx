/* oxlint-disable next/no-html-link-for-pages -- Auth redirects and history downloads require top-level navigation. */
'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '@/components/resonance/shared';
import { api, useArchive } from './use-archive';
import { exportArchive } from './export-archive';
const providerLabels = {
  lastfm: 'History bridge',
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
    [setup, setSetup] = useState(false),
    [remove, setRemove] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
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
                : 'That connection could not complete. Check setup and try again.',
        );
        history.replaceState(null, '', location.pathname + '?space=Karina');
      }
    };
    queueMicrotask(update);
  }, []);
  const lastfm = status?.connected.find((c) => c.provider === 'lastfm');
  async function sync() {
    setBusy(true);
    try {
      const data = await api<{ message: string }>('/api/karina/sync', {});
      setNotice(data.message);
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!remove) return;
    setBusy(true);
    try {
      await api('/api/karina', { action: 'disconnect', provider: remove });
      setRemove(null);
      setNotice(
        'Disconnected. Previously imported history remains in your archive until you delete it.',
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
              Set up Karina <ArrowUpRight size={16} />
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
                No developer accounts yet? Start here.
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
      {!status?.signedIn && (
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
            Check setup <RefreshCw size={14} />
          </button>
        </div>
        <div className="connection-list">
          {(['lastfm', 'discord', 'spotify'] as const).map((p, i) => {
            const linked = status?.connected.find((c) => c.provider === p),
              configured = status?.configured[p];
            return (
              <div className="connection-row" key={p}>
                <span className="connection-number">0{i + 1}</span>
                <div>
                  <h4>
                    {providerLabels[p]}{' '}
                    {p === 'spotify' && <small>optional</small>}
                  </h4>
                  <p>
                    {linked
                      ? `Connected as ${linked.name}`
                      : p === 'lastfm'
                        ? 'Last.fm supplies recorded listens. Resonance builds your archive and statistics.'
                        : p === 'discord'
                          ? 'Link your identity, then install Karina on your account.'
                          : 'Optional direct current-playing display. Full history currently uses the bridge.'}
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
                  ) : (
                    'Setup needed'
                  )}
                </span>
                {linked ? (
                  <button className="text-button" onClick={() => setRemove(p)}>
                    Disconnect
                  </button>
                ) : configured && status?.signedIn ? (
                  <a className="button small" href={`/api/karina/oauth/${p}`}>
                    Connect
                  </a>
                ) : (
                  <button
                    className="button small"
                    onClick={() => setSetup(true)}
                  >
                    Set up
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
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
                  : 'Scheduler setup needed'}
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
              disabled={!lastfm || busy}
              onClick={() => void sync()}
            >
              <RefreshCw size={15} />
              {busy ? 'Updating…' : 'Sync next page'}
            </button>
            <button className="text-button" onClick={onListening}>
              Open listening history <ArrowUpRight size={15} />
            </button>
          </div>
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
        title="A home for Karina."
        description="Connect Karina to Discord first. Add a listening source when you’re ready to share your music."
        wide
      >
        <ol className="setup-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Create your Discord application</h3>
              <p>
                Choose the name Karina. In Installation, enable{' '}
                <b>User Install</b> with <b>applications.commands</b>. Your
                account install works in DMs, group chats and eligible servers.
              </p>
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noreferrer"
              >
                Open Discord Developer Portal <ArrowUpRight size={14} />
              </a>
              <p>In OAuth2, add this exact redirect:</p>
              <CopyLine value={status?.callbacks.discord || ''} />
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Bring Spotify listening into Resonance</h3>
              <p>
                Direct Spotify access cannot currently power the full archive
                and statistics under its documented API access and usage rules.
                Use Last.fm as a history bridge: create its API account, set
                this callback, then connect Spotify in Last.fm Applications.
                Your archive, charts and commands are built by Resonance.
              </p>
              <CopyLine value={status?.callbacks.lastfm || ''} />
              <div className="button-row">
                <a
                  href="https://www.last.fm/api/account/create"
                  target="_blank"
                  rel="noreferrer"
                >
                  Create Last.fm API account ↗
                </a>
                <a
                  href="https://www.last.fm/settings/applications"
                  target="_blank"
                  rel="noreferrer"
                >
                  Last.fm applications ↗
                </a>
              </div>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Store keys securely</h3>
              <p>
                Set the website address and Discord application ID, public key,
                client secret and Karina encryption key in the host’s settings.
                Add listening-provider and scheduler keys when you enable those
                connections. Never put secrets into chat or browser code.
              </p>
              <p>
                Enable Last.fm after reviewing its API conditions for this
                instance. Optional Spotify display needs its own app and access
                review.
              </p>
              <a
                href="https://github.com/Zitang123/Resonance/blob/main/docs/KARINA_SETUP.md"
                target="_blank"
                rel="noreferrer"
              >
                Open the exact setup guide ↗
              </a>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>Let Discord reach Karina</h3>
              <p>
                For this public website, set Discord’s Interactions Endpoint URL
                to the address below. Resonance checks Discord’s signature on
                every command. Save it after the Discord keys are configured,
                then register the included global commands.
              </p>
              <CopyLine value={status?.interactionsUrl || ''} />
              <p>
                The optional relay adds scheduled history updates while you’re
                away. It is also needed if you make the whole website private.
              </p>
              <p>
                Sign in to Resonance to link your own listening account.
                Installing Karina in Discord is a separate step; it does not
                connect your listening history automatically.
              </p>
            </div>
          </li>
        </ol>
        <div className="setup-readiness">
          <strong>Current readiness</strong>
          <span>{status?.database ? '✓' : '○'} History database</span>
          <span>
            {status?.configured.discord ? '✓' : '○'} Discord credentials
          </span>
          <span>
            {status?.configured.lastfm ? '✓' : '○'} Last.fm credentials
          </span>
          <span>{schedulerActive ? '✓' : '○'} Background scheduler</span>
        </div>
        <button className="button primary" onClick={() => void reload()}>
          Check setup again
        </button>
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => !busy && setRemove(null)}
        title={`Disconnect ${remove || ''}?`}
        description="Future access from Resonance stops. Imported history remains until you delete it. You can also revoke the app from the provider’s account settings."
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
function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-line">
      <code>{value || 'Loading callback…'}</code>
      <button
        className="icon-button"
        aria-label="Copy callback URL"
        onClick={() =>
          void navigator.clipboard.writeText(value).then(() => setCopied(true))
        }
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}
