/* oxlint-disable next/no-html-link-for-pages -- OAuth must use top-level navigation without router prefetch. */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import Image from 'next/image';

type Playback = {
  title: string;
  artist: string;
  url?: string;
  playing: boolean;
  source: string;
};
export function SpotifyPlaying({
  onConnectionChange,
}: {
  onConnectionChange: () => Promise<void>;
}) {
  const [playing, setPlaying] = useState<Playback | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reconnect, setReconnect] = useState(false);
  const [checked, setChecked] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/karina/spotify', {
        cache: 'no-store',
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      const data = (await response.json()) as {
        connected?: boolean;
        playing?: Playback | null;
        error?: string;
        reconnect?: boolean;
      };
      if (controller.signal.aborted) return;
      setReconnect(!!data.reconnect);
      if (!response.ok)
        throw Error(
          data.error || 'Spotify could not be reached. Please try again.',
        );
      if (!data.connected) {
        setPlaying(null);
        await onConnectionChange();
        return;
      }
      setPlaying(data.playing || null);
      setChecked(true);
    } catch (e) {
      if (!controller.signal.aborted) {
        setPlaying(null);
        setError(
          e instanceof Error ? e.message : 'Spotify could not be reached.',
        );
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [onConnectionChange]);
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void refresh();
    });
    return () => {
      mounted = false;
      pending.current?.abort();
    };
  }, [refresh]);
  return (
    <section className="spotify-playing" aria-label="Your Spotify playback">
      <div>
        <a
          className="spotify-attribution"
          href={playing?.url || 'https://open.spotify.com/'}
          target="_blank"
          rel="noreferrer"
        >
          <Image
            src="/brands/spotify-white.svg"
            alt="Spotify"
            width="92"
            height="25"
            unoptimized
          />
        </a>
        <h3>
          {busy
            ? 'Checking Spotify…'
            : error
              ? 'Playback unavailable'
              : playing?.title || 'Nothing reported as playing'}
        </h3>
        <p aria-live="polite">
          {error ||
            (playing
              ? `${playing.artist} · ${playing.playing ? 'Playing now' : 'Paused'}`
              : checked
                ? 'Play something on Spotify, then refresh. Karina checks the same connection when you use /fm.'
                : 'Your current playback appears here.')}
        </p>
        {playing?.url && !busy && (
          <a
            className="text-button"
            href={playing.url}
            target="_blank"
            rel="noreferrer"
          >
            Open in Spotify <ArrowUpRight size={14} />
          </a>
        )}
        {reconnect && (
          <a
            className="text-button"
            href="/api/karina/oauth/spotify"
            target="_top"
          >
            Reconnect Spotify <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      <button
        className="button small"
        disabled={busy}
        onClick={() => void refresh()}
      >
        <RefreshCw size={14} />
        {busy ? 'Checking…' : 'Refresh playback'}
      </button>
    </section>
  );
}
