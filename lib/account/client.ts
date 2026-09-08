let activeAccount: string | null = null;
export const setActiveAccount = (id: string | null) => {
  activeAccount = id;
};
export const getActiveAccount = () => activeAccount;
export const accountHeaders = (
  owner = activeAccount,
): Record<string, string> => (owner ? { 'x-resonance-account': owner } : {});
export async function accountRequest<T>(
  url: string,
  options: RequestInit = {},
  owner = activeAccount,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (owner) headers.set('x-resonance-account', owner);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: options.signal || AbortSignal.timeout(45000),
    headers,
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || 'Your room could not load. Please retry.'),
      { status: response.status },
    );
  return result;
}
export type Account = {
  id: string;
  name: string;
  revision: string | null;
  onboarded: boolean;
};
