type Send = (url: string, init: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

function delay(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds > 120)
    throw Error('Discord requested a longer pause. Retry registration later.');
  return Math.max(250, Math.ceil(seconds * 1000) + 100);
}

// Used by the sequential setup CLI. Keep response bodies and credentials out of logs.
export function createDiscordRequest(
  send: Send = (url, init) => fetch(url, init),
  sleep: Sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  let beforeNextRequest = 0;
  return async (url: string, init: RequestInit): Promise<Response> => {
    if (new URL(url).origin !== 'https://discord.com')
      throw Error('Discord credentials must only be sent to Discord.');
    for (let attempt = 0; attempt < 5; attempt++) {
      if (beforeNextRequest) {
        const milliseconds = beforeNextRequest;
        beforeNextRequest = 0;
        await sleep(milliseconds);
      }
      const response = await send(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      if (response.status !== 429) {
        if (
          response.ok &&
          response.headers.get('x-ratelimit-remaining') === '0'
        )
          beforeNextRequest =
            delay(response.headers.get('x-ratelimit-reset-after')) ?? 1000;
        return response;
      }
      let payload: { retry_after?: unknown } = {};
      try {
        const data: unknown = await response.json();
        if (data && typeof data === 'object') payload = data;
      } catch {
        // Headers still allow recovery when an intermediary returns non-JSON.
      }
      beforeNextRequest =
        delay(response.headers.get('retry-after')) ??
        delay(payload.retry_after) ??
        delay(response.headers.get('x-ratelimit-reset-after')) ??
        1000 * (attempt + 1);
    }
    throw Error('Discord is still rate limiting registration. Retry later.');
  };
}
