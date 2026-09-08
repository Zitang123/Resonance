/* oxlint-disable next/no-html-link-for-pages -- Sign-in uses a top-level, dispatch-owned navigation. */
'use client';
import { useState } from 'react';
import { ArrowUpRight, AudioLines, Check, ShieldCheck } from 'lucide-react';
import { Ribbon } from './art';
import { Modal, download } from './shared';
import { serializeBackup } from '@/lib/resonance/domain';
import type { CollectionStore } from '@/lib/resonance/use-collection';
import { useArchive } from '@/components/karina/use-archive';
import { ConnectButton } from '@/components/karina/karina';

export function Welcome({ store }: { store: CollectionStore }) {
  const signedIn = !!store.account;
  return (
    <main className="account-welcome">
      <div className="account-wordmark">
        <AudioLines size={23} /> resonance
      </div>
      <div className="welcome-layout">
        <section className="welcome-copy">
          <p className="eyebrow">Your own listening room</p>
          <h1>
            Music stays.
            <br />
            <em>Make it yours.</em>
          </h1>
          <p className="welcome-intro">
            Save the songs, keep the stories, and pick up where you left off.
            One private room, wherever you sign in.
          </p>
          {!store.ready ? (
            <output>Opening your room…</output>
          ) : store.error ? (
            <div role="alert">
              <p className="error-message">{store.error}</p>
              <button className="button" onClick={store.reload}>
                Try again
              </button>
            </div>
          ) : signedIn ? (
            <>
              <p className="welcome-identity">
                Signed in as <strong>{store.account!.name}</strong>
              </p>
              <ConnectionOptions compact />
              <button
                className="button primary welcome-enter"
                onClick={() => void store.finishOnboarding()}
              >
                Enter my room <ArrowUpRight size={16} />
              </button>
              <p className="welcome-note">
                Connections are optional. You can add them any time.
              </p>
            </>
          ) : (
            <>
              <a
                className="button primary welcome-enter"
                href="/signin-with-chatgpt?return_to=%2F"
                target="_top"
              >
                Continue with ChatGPT <ArrowUpRight size={17} />
              </a>
              <p className="welcome-note">
                New here? Signing in creates your Resonance account.
              </p>
              <button
                className="text-button"
                onClick={() => store.switchMode('sample')}
              >
                Explore the sample <ArrowUpRight size={15} />
              </button>
            </>
          )}
        </section>
        <div className="welcome-art" aria-hidden="true">
          <Ribbon />
          <span>Save. Listen. Remember.</span>
        </div>
      </div>
      <footer className="welcome-footer">
        <span>
          <ShieldCheck size={15} /> Your room is private.
        </span>
        <a href="/privacy">Your data & privacy</a>
        {signedIn && (
          <a
            href="/signout-with-chatgpt?return_to=%2F"
            target="_top"
            onClick={store.signOut}
          >
            Use another account
          </a>
        )}
      </footer>
    </main>
  );
}
export function ConnectionOptions({ compact = false }: { compact?: boolean }) {
  const { status, error } = useArchive();
  return (
    <div className="account-connections">
      {error && <p className="error-message">{error}</p>}
      <div className="account-connect-row">
        <div>
          <h3>Spotify</h3>
          <p>Your now playing, here and with Karina.</p>
        </div>
        <ConnectButton provider="spotify" status={status} />
      </div>
      <div className="account-connect-row">
        <div>
          <h3>Karina on Discord</h3>
          <p>Your music, in your conversations.</p>
        </div>
        {status?.connected.some((c) => c.provider === 'discord') &&
        status.installUrl ? (
          <a
            className="button small"
            href={status.installUrl}
            target="_blank"
            rel="noreferrer"
          >
            Add Karina <ArrowUpRight size={14} />
          </a>
        ) : (
          <ConnectButton provider="discord" status={status} />
        )}
      </div>
      <p className="welcome-note">
        Spotify is currently available to approved beta listeners.
      </p>
      {!compact && (
        <details className="history-bridge">
          <summary>Add listening statistics</summary>
          <p>
            Connect your Last.fm account to bring its recorded listens into
            Resonance. Spotify playback alone doesn’t supply listening history.
          </p>
          <ConnectButton provider="lastfm" status={status} />
          <a
            className="text-button"
            href="https://www.last.fm/settings/applications"
            target="_blank"
            rel="noreferrer"
          >
            Set up Spotify scrobbling on Last.fm <ArrowUpRight size={14} />
          </a>
          <p className="welcome-note">
            Karina’s music replies are public in the conversation where you run
            them. Your room and memories stay private.
          </p>
        </details>
      )}
    </div>
  );
}
export function LegacyCollection({ store }: { store: CollectionStore }) {
  const [review, setReview] = useState(false);
  if (!store.legacy)
    return store.legacyError ? (
      <p className="error-message">{store.legacyError}</p>
    ) : null;
  const old = store.legacy;
  return (
    <>
      <div className="legacy-banner">
        <div>
          <strong>Music saved on this device</strong>
          <p>Choose whether this older collection belongs in your account.</p>
        </div>
        <button className="button small" onClick={() => setReview(true)}>
          Review
        </button>
        <button className="text-button" onClick={store.dismissLegacy}>
          Dismiss
        </button>
      </div>
      <Modal
        open={review}
        onClose={() => setReview(false)}
        title="Bring your music with you."
        description={`Only import this device collection if it belongs to you. It will be saved to ${store.account?.name}.`}
      >
        <p>
          {old.items.length} records · {old.capsules.length} capsules ·{' '}
          {old.moments.length} moments
        </p>
        <p>
          Your original device copy is kept for recovery. Existing account music
          is never replaced here.
        </p>
        {store.error && (
          <p className="error-message" role="alert">
            {store.error}
          </p>
        )}
        <div className="button-row">
          <button
            className="button primary"
            disabled={store.saving}
            onClick={async () => {
              if (await store.migrate()) setReview(false);
            }}
          >
            {store.saving ? 'Saving…' : 'Save to my account'}{' '}
            <Check size={14} />
          </button>
          <button
            className="button"
            onClick={() =>
              download('resonance-device-backup.json', serializeBackup(old))
            }
          >
            Export device copy
          </button>
        </div>
      </Modal>
    </>
  );
}
