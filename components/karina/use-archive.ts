'use client';
import { accountHeaders, getActiveAccount } from '@/lib/account/client';
import { useCallback, useEffect, useState } from 'react';
export type ArchiveStatus = {
  signedIn: boolean;
  database: boolean;
  configured: Record<'lastfm' | 'discord' | 'spotify', boolean>;
  connected: { provider: string; name: string; updated_at: number }[];
  sources: { source: string; count: number; first: string; last: string }[];
  sync: {
    phase: string;
    page: number;
    last_success: number | null;
    error: string | null;
    next_run: number;
  } | null;
  schedulerLastSeen: number | null;
  installUrl: string | null;
};
export async function api<T>(
  url: string,
  data?: unknown,
  owner = getActiveAccount(),
): Promise<T> {
  const response = await fetch(url, {
    ...(data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
    headers: {
      ...accountHeaders(owner),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  if (owner !== getActiveAccount())
    throw Error('Your account changed. Please retry from your own account.');
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw Error(result.error || 'The archive is temporarily unavailable.');
  return result;
}
export function useArchive() {
  const [status, setStatus] = useState<ArchiveStatus | null>(null),
    [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const next = await api<ArchiveStatus>('/api/karina');
      setStatus(next);
      setError('');
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection unavailable.');
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);
  return { status, error, reload };
}
