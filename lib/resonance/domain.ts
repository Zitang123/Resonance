import type {
  MusicItem,
  ProviderLink,
  State,
  StorageLike,
  TonightOptions,
  TonightPick,
  Moment,
  HistoryCoverage,
} from './types.ts';
export type * from './types.ts';

export const EMPTY_STATE: State = {
  version: 1,
  items: [],
  capsules: [],
  moments: [],
  preferences: { lowerEffects: false },
};
export const STORAGE_KEYS = {
  personal: 'resonance:personal:v1',
  sample: 'resonance:sample:v1',
} as const;
const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
const MAX_ITEMS = 20_000;
const MAX_MOMENTS = 100_000;
export function id(): string {
  return crypto.randomUUID();
}
const clone = <T>(value: T): T => structuredClone(value);

/** Local calendar day: avoids moving evening saves into tomorrow in UTC. */
export function localDay(value: string | Date = new Date()): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function safeProviderLink(input: string): ProviderLink {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter a complete music link beginning with https://.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error(
      'Music links must use secure HTTPS without sign-in details.',
    );
  const host = url.hostname.toLowerCase();
  let provider: ProviderLink['provider'];
  if (
    host === 'open.spotify.com' &&
    /^\/(?:intl-[a-z]{2}\/)?(?:track|album)\/[a-zA-Z0-9]{22}\/?$/.test(
      url.pathname,
    )
  )
    provider = 'Spotify';
  else if (
    host === 'music.apple.com' &&
    /^\/(?:[a-z]{2}\/)?(?:album|song)\/(?:[^/]+\/)?[1-9]\d{0,19}\/?$/.test(
      url.pathname,
    ) &&
    (!url.searchParams.has('i') ||
      (url.searchParams.getAll('i').length === 1 &&
        /^[1-9]\d{0,19}$/.test(url.searchParams.get('i') || '')))
  )
    provider = 'Apple Music';
  else if (
    (['youtube.com', 'www.youtube.com', 'music.youtube.com'].includes(host) &&
      ((url.pathname === '/watch' &&
        url.searchParams.getAll('v').length === 1 &&
        /^[\w-]{11}$/.test(url.searchParams.get('v') || '')) ||
        /^\/(?:shorts|live)\/[\w-]{11}\/?$/.test(url.pathname))) ||
    (host === 'youtu.be' && /^\/[\w-]{11}\/?$/.test(url.pathname))
  )
    provider = 'YouTube';
  else if (
    (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) &&
    /^\/(?:album|track)\/[^/]+\/?$/.test(url.pathname)
  )
    provider = 'Bandcamp';
  else
    throw new Error(
      'Use a Spotify, Apple Music, YouTube or Bandcamp track or album link.',
    );
  url.hash = '';
  for (const key of Array.from(url.searchParams.keys())) {
    if (
      !(provider === 'YouTube' && ['v', 't'].includes(key)) &&
      !(provider === 'Apple Music' && key === 'i')
    )
      url.searchParams.delete(key);
  }
  return { provider, url: url.toString() };
}

export function normalizedText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
function normalizedTitle(title: string): string {
  return normalizedText(
    title.replace(
      /\s*(?:[[(]\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?\s*[\])]|[-–—]\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?)\s*$/i,
      '',
    ),
  );
}
export function findDuplicates(
  items: MusicItem[],
  candidate: Pick<MusicItem, 'title' | 'artist' | 'type'> & {
    links?: ProviderLink[];
  },
): MusicItem[] {
  const title = normalizedTitle(candidate.title),
    artist = normalizedText(candidate.artist);
  const links = new Set(
    (candidate.links || [])
      .map((link) => {
        try {
          return safeProviderLink(link.url).url;
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
  return items.filter(
    (item) =>
      item.type === candidate.type &&
      ((normalizedTitle(item.title) === title &&
        normalizedText(item.artist) === artist) ||
        item.links.some((link) => {
          try {
            return links.has(safeProviderLink(link.url).url);
          } catch {
            return false;
          }
        })),
  );
}
export function searchItems(items: MusicItem[], query: string): MusicItem[] {
  const tokens = normalizedText(query).split(' ').filter(Boolean);
  if (!tokens.length) return items;
  return items.filter((item) => {
    const haystack = normalizedText(
      [
        item.title,
        item.artist,
        item.recommendedBy,
        item.note,
        ...item.tags,
      ].join(' '),
    );
    return tokens.every((token) => haystack.includes(token));
  });
}
function joinNotes(a: string, b?: string): string {
  return !b || a === b ? a : !a ? b : `${a}\n\n${b}`;
}
export function mergeItem(
  existing: MusicItem,
  incoming: Partial<MusicItem>,
): MusicItem {
  // Duplicate merge adds context. Optional blanks from an add form must not erase
  // a deliberate reminder or a verified metadata match already on the item.
  const definedIncoming = Object.fromEntries(
    Object.entries(incoming).filter(
      ([key, value]) =>
        value !== undefined &&
        !['revisitDate', 'metadata', 'triedAt'].includes(key),
    ),
  ) as Partial<MusicItem>;
  const links = new Map(
    existing.links.map((link) => {
      const safe = safeProviderLink(link.url);
      return [safe.url, safe];
    }),
  );
  for (const link of incoming.links || []) {
    const safe = safeProviderLink(link.url);
    links.set(safe.url, safe);
  }
  const tags = new Map(existing.tags.map((tag) => [normalizedText(tag), tag]));
  for (const tag of incoming.tags || [])
    if (normalizedText(tag)) tags.set(normalizedText(tag), tag.trim());
  const triedAt =
    existing.triedAt && incoming.triedAt
      ? Date.parse(existing.triedAt) <= Date.parse(incoming.triedAt)
        ? existing.triedAt
        : incoming.triedAt
      : existing.triedAt || incoming.triedAt;
  const revisitDate = incoming.revisitDate?.trim() || existing.revisitDate;
  const incomingVerified =
    incoming.metadata?.source === 'musicbrainz' &&
    !!incoming.metadata.id?.trim();
  const existingVerified =
    existing.metadata?.source === 'musicbrainz' &&
    !!existing.metadata.id?.trim();
  const metadata = incomingVerified
    ? incoming.metadata
    : existingVerified
      ? existing.metadata
      : incoming.metadata || existing.metadata;
  return {
    ...existing,
    ...definedIncoming,
    id: existing.id,
    savedAt:
      incoming.savedAt &&
      Date.parse(incoming.savedAt) < Date.parse(existing.savedAt)
        ? incoming.savedAt
        : existing.savedAt,
    ...(triedAt ? { triedAt } : {}),
    ...(revisitDate ? { revisitDate } : {}),
    ...(metadata ? { metadata } : {}),
    links: [...links.values()],
    tags: [...tags.values()],
    note: joinNotes(existing.note, incoming.note),
    recommendedBy: joinNotes(existing.recommendedBy, incoming.recommendedBy),
    status:
      incoming.status === 'saved' && existing.status !== 'saved'
        ? existing.status
        : incoming.status || existing.status,
  };
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function selectTonight(
  state: State,
  options: TonightOptions,
): TonightPick[] {
  const date = localDay(options.date || new Date()),
    excluded = new Set(options.excludedIds || []),
    pins = new Set(options.pinnedIds || []);
  // A memory, external link click or unlinked import does not establish a listen.
  const lastLogged = new Map<string, number>();
  for (const moment of state.moments) {
    if (
      moment.itemId &&
      moment.source === 'manual' &&
      ['session', 'revisit'].includes(moment.kind) &&
      localDay(moment.date) <= date
    ) {
      lastLogged.set(
        moment.itemId,
        Math.max(
          lastLogged.get(moment.itemId) ?? -Infinity,
          Date.parse(moment.date),
        ),
      );
    }
  }
  const eligible = state.items.filter(
    (item) =>
      !excluded.has(item.id) &&
      item.status !== 'archived' &&
      (!options.tag ||
        item.tags.some(
          (tag) => normalizedText(tag) === normalizedText(options.tag!),
        )) &&
      (pins.has(item.id) ||
        options.mode === 'mix' ||
        (options.mode === 'familiar'
          ? item.status === 'tried' || item.status === 'keep'
          : item.status === 'saved')),
  );
  const due = (item: MusicItem): boolean =>
    !!item.revisitDate && item.revisitDate <= date;
  const ranked = [...eligible].sort((a, b) => {
    const priority =
      Number(pins.has(b.id)) - Number(pins.has(a.id)) ||
      Number(due(b)) - Number(due(a));
    if (priority) return priority;
    if (due(a) && due(b) && a.revisitDate !== b.revisitDate)
      return a.revisitDate!.localeCompare(b.revisitDate!);
    if ((a.status === 'saved') !== (b.status === 'saved'))
      return a.status === 'saved' ? -1 : 1;
    if (a.status === 'saved' && b.status === 'saved') {
      const waiting = Date.parse(a.savedAt) - Date.parse(b.savedAt);
      if (waiting) return waiting;
    } else {
      const aLast = lastLogged.get(a.id),
        bLast = lastLogged.get(b.id);
      if (aLast !== bLast)
        return aLast === undefined
          ? -1
          : bLast === undefined
            ? 1
            : aLast - bLast;
      const keeper = Number(b.status === 'keep') - Number(a.status === 'keep');
      if (keeper) return keeper;
    }
    return (
      hash(`${date}:${a.id}`) - hash(`${date}:${b.id}`) ||
      a.id.localeCompare(b.id)
    );
  });
  let selected = ranked;
  if (options.mode === 'mix') {
    const priority = ranked.filter((item) => pins.has(item.id) || due(item));
    const rest = ranked.filter((item) => !pins.has(item.id) && !due(item));
    const fresh = rest.filter((item) => item.status === 'saved'),
      familiar = rest.filter((item) => item.status !== 'saved');
    selected = [...priority];
    for (let i = 0; i < Math.max(fresh.length, familiar.length); i++) {
      if (fresh[i]) selected.push(fresh[i]);
      if (familiar[i]) selected.push(familiar[i]);
    }
  }
  return selected
    .slice(0, Math.max(0, Math.min(options.limit ?? 5, 100)))
    .map((item) => {
      const last = lastLogged.get(item.id),
        familiar = item.status === 'keep' ? 'Keeper' : 'Familiar pick';
      const reason = pins.has(item.id)
        ? 'You pinned this for tonight'
        : due(item)
          ? `Your reminder was due ${item.revisitDate}`
          : item.status === 'saved'
            ? `Waiting since ${localDay(item.savedAt)}${item.recommendedBy ? ` · from ${item.recommendedBy}` : ''}`
            : last === undefined
              ? `${familiar} · no session or revisit logged yet`
              : `${familiar} · last logged ${localDay(new Date(last))}`;
      return { item, reason };
    });
}

/** Counts recorded actions, never inferred listening time or invented playback. */
export function stats(
  state: State,
  from?: string,
  to?: string,
): {
  saved: number;
  tried: number;
  revisits: number;
  sessions: number;
  imported: number;
  memories: number;
} {
  const within = (date: string) =>
    (!from || localDay(date) >= localDay(from)) &&
    (!to || localDay(date) <= localDay(to));
  const moments = state.moments.filter((moment) => within(moment.date));
  return {
    saved: state.items.filter((item) => within(item.savedAt)).length,
    tried: state.items.filter((item) =>
      item.triedAt
        ? within(item.triedAt)
        : !from && !to && ['tried', 'keep'].includes(item.status),
    ).length,
    revisits: moments.filter((moment) => moment.kind === 'revisit').length,
    sessions: moments.filter((moment) => moment.kind === 'session').length,
    imported: moments.filter((moment) => moment.kind === 'imported').length,
    memories: moments.filter((moment) => moment.kind === 'memory').length,
  };
}

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
};
function string(
  value: unknown,
  path: string,
  max = 2000,
  required = false,
): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim()) ||
    /* eslint-disable-next-line no-control-regex -- Reject prohibited control characters in imported data. */
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
  )
    throw new Error(`${path} is missing or invalid.`);
  return value;
}
function enumValue<T extends string>(
  value: unknown,
  options: readonly T[],
  path: string,
): T {
  if (!options.includes(value as T))
    throw new Error(`${path} is not supported.`);
  return value as T;
}
function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${path} must be a list with at most ${max} entries.`);
  return value;
}
function timestamp(value: unknown, path: string): string {
  const result = string(value, path, 40, true);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      result,
    ) ||
    Number.isNaN(Date.parse(result))
  )
    throw new Error(`${path} must be a valid date and time.`);
  day(result.slice(0, 10), path);
  return new Date(result).toISOString();
}
function day(value: unknown, path: string): string {
  const result = string(value, path, 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(Date.parse(`${result}T00:00:00Z`)) ||
    new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result
  )
    throw new Error(`${path} must be a valid calendar date.`);
  return result;
}
function optionalString(
  value: unknown,
  path: string,
  max = 2000,
): string | undefined {
  return value === undefined ? undefined : string(value, path, max);
}
function uniqueIds(values: { id: string }[], path: string): void {
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value.id)) throw new Error(`${path} contains duplicate IDs.`);
    ids.add(value.id);
  }
}
function validateImage(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const result = string(value, 'Capsule image', 4 * 1024 * 1024, true);
  if (
    /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(result)
  )
    return result;
  try {
    const url = new URL(result);
    if (url.protocol === 'https:' && !url.username && !url.password)
      return result;
  } catch {
    /* handled below */
  }
  throw new Error(
    'Capsule image must be a supported image or secure HTTPS URL.',
  );
}
function validateState(value: unknown): State {
  const raw = object(value, 'Backup');
  if (raw.version !== 1)
    throw new Error(
      'This backup version is not supported. Your current collection has not changed.',
    );
  const items: MusicItem[] = array(raw.items, 'Items', MAX_ITEMS).map(
    (value, i) => {
      const item = object(value, `Item ${i + 1}`);
      const links = array(item.links, 'Music links', 20).map((value) => {
        const link = object(value, 'Music link'),
          safe = safeProviderLink(string(link.url, 'Music URL', 3000, true));
        if (link.provider !== safe.provider)
          throw new Error('Music link provider does not match its URL.');
        return safe;
      });
      const result: MusicItem = {
        id: string(item.id, 'Item ID', 200, true),
        title: string(item.title, 'Title', 500, true),
        artist: string(item.artist, 'Artist', 500, true),
        type: enumValue(item.type, ['track', 'album'], 'Item type'),
        links,
        savedAt: timestamp(item.savedAt, 'Saved date'),
        recommendedBy: string(item.recommendedBy, 'Recommender', 1000),
        note: string(item.note, 'Note', 20_000),
        tags: array(item.tags, 'Tags', 50).map((tag) =>
          string(tag, 'Tag', 100, true),
        ),
        status: enumValue(
          item.status,
          ['saved', 'tried', 'keep', 'archived'],
          'Item status',
        ),
      };
      if (item.revisitDate !== undefined)
        result.revisitDate = day(item.revisitDate, 'Revisit date');
      if (item.triedAt !== undefined)
        result.triedAt = timestamp(item.triedAt, 'First tried date');
      if (item.metadata !== undefined) {
        const metadata = object(item.metadata, 'Metadata');
        result.metadata = {
          source: enumValue(
            metadata.source,
            ['manual', 'musicbrainz'],
            'Metadata source',
          ),
          ...(metadata.id !== undefined
            ? { id: string(metadata.id, 'Metadata ID', 200, true) }
            : {}),
        };
      }
      return result;
    },
  );
  const capsules: State['capsules'] = array(raw.capsules, 'Capsules', 2000).map(
    (value) => {
      const capsule = object(value, 'Capsule');
      return {
        id: string(capsule.id, 'Capsule ID', 200, true),
        title: string(capsule.title, 'Capsule title', 500, true),
        description: string(capsule.description, 'Capsule description', 20_000),
        theme: enumValue(
          capsule.theme,
          ['copper', 'blue', 'sage', 'plum'],
          'Capsule theme',
        ),
        itemIds: array(capsule.itemIds, 'Capsule items', MAX_ITEMS).map(
          (value) => string(value, 'Capsule item ID', 200, true),
        ),
        createdAt: timestamp(capsule.createdAt, 'Capsule date'),
        ...(capsule.image !== undefined
          ? { image: validateImage(capsule.image) }
          : {}),
      };
    },
  );
  const moments: Moment[] = array(raw.moments, 'Moments', MAX_MOMENTS).map(
    (value) => {
      const moment = object(value, 'Moment');
      const result: Moment = {
        id: string(moment.id, 'Moment ID', 200, true),
        date: timestamp(moment.date, 'Moment date'),
        note: string(moment.note, 'Moment note', 20_000),
        kind: enumValue(
          moment.kind,
          ['memory', 'session', 'revisit', 'imported'],
          'Moment kind',
        ),
        source: enumValue(
          moment.source,
          ['manual', 'listenbrainz'],
          'Moment source',
        ),
      };
      for (const key of [
        'itemId',
        'capsuleId',
        'externalId',
        'title',
        'artist',
      ] as const) {
        const val = optionalString(
          moment[key],
          `Moment ${key}`,
          key === 'externalId' ? 2000 : 500,
        );
        if (val !== undefined) result[key] = val;
      }
      if ((result.kind === 'imported') !== (result.source === 'listenbrainz'))
        throw new Error(
          'ListenBrainz moments must have imported kind; manual moments must have manual source.',
        );
      if (
        result.kind === 'imported' &&
        (!result.externalId || !result.title || !result.artist)
      )
        throw new Error(
          'Imported moments need a source, external ID, title and artist.',
        );
      return result;
    },
  );
  uniqueIds(items, 'Items');
  uniqueIds(capsules, 'Capsules');
  uniqueIds(moments, 'Moments');
  const externalIds = new Set<string>();
  for (const moment of moments)
    if (moment.source === 'listenbrainz') {
      if (externalIds.has(moment.externalId!))
        throw new Error('Imported moments contain duplicate external IDs.');
      externalIds.add(moment.externalId!);
    }
  const itemIds = new Set(items.map((item) => item.id)),
    capsuleIds = new Set(capsules.map((capsule) => capsule.id));
  for (const capsule of capsules)
    if (
      capsule.itemIds.some((id) => !itemIds.has(id)) ||
      new Set(capsule.itemIds).size !== capsule.itemIds.length
    )
      throw new Error(
        'A capsule contains missing or repeated music references.',
      );
  for (const moment of moments)
    if (
      (moment.itemId && !itemIds.has(moment.itemId)) ||
      (moment.capsuleId && !capsuleIds.has(moment.capsuleId))
    )
      throw new Error(
        'A moment references missing music or a missing capsule.',
      );
  const preferences = object(raw.preferences, 'Preferences');
  if (typeof preferences.lowerEffects !== 'boolean')
    throw new Error('Lower effects preference must be true or false.');
  const result: State = {
    version: 1,
    items,
    capsules,
    moments,
    preferences: { lowerEffects: preferences.lowerEffects },
  };
  if (raw.historyCoverage !== undefined) {
    const coverage = object(raw.historyCoverage, 'History coverage');
    result.historyCoverage = {
      source: enumValue(coverage.source, ['listenbrainz'], 'History source'),
      user: string(coverage.user, 'History username', 200, true),
      from: timestamp(coverage.from, 'History start'),
      to: timestamp(coverage.to, 'History end'),
      importedAt: timestamp(coverage.importedAt, 'History import date'),
    };
    if (
      Date.parse(result.historyCoverage.from) >
      Date.parse(result.historyCoverage.to)
    )
      throw new Error('History coverage starts after it ends.');
  }
  return result;
}
export function validateBackup(text: string): State {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES
  )
    throw new Error(
      'Backup is too large. Choose a Resonance JSON backup under 16 MB.',
    );
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      'This file is not valid JSON. Your current collection has not changed.',
    );
  }
  return validateState(value);
}
export function serializeBackup(state: State): string {
  const result = JSON.stringify(validateState(state), null, 2);
  if (new TextEncoder().encode(result).byteLength > MAX_BACKUP_BYTES)
    throw new Error('Backup exceeds the 16 MB limit.');
  return result;
}
export function readStorage(
  mode: 'personal' | 'sample',
  storage: StorageLike,
): { state: State; error?: string } {
  try {
    const raw = storage.getItem(STORAGE_KEYS[mode]);
    return {
      state:
        raw === null
          ? mode === 'sample'
            ? sampleState()
            : clone(EMPTY_STATE)
          : validateBackup(raw),
    };
  } catch (error) {
    return {
      state: clone(EMPTY_STATE),
      error: `Could not load ${mode} data. The stored copy is untouched. ${error instanceof Error ? error.message : 'Storage is unavailable.'}`,
    };
  }
}
export function writeStorage(
  mode: 'personal' | 'sample',
  state: State,
  storage: StorageLike,
): void {
  const previous = storage.getItem(STORAGE_KEYS[mode]);
  if (previous !== null) {
    try {
      validateBackup(previous);
    } catch {
      throw new Error(
        'The stored collection is unreadable and has been preserved. Export or clear it explicitly before saving new changes.',
      );
    }
  }
  try {
    storage.setItem(STORAGE_KEYS[mode], serializeBackup(state));
  } catch (error) {
    throw new Error(
      `Your change could not be saved. ${error instanceof Error ? error.message : 'Browser storage is unavailable or full.'}`,
    );
  }
}

/** Only public ListenBrainz listen objects are interpreted; all other fields are discarded. */
export function normalizeListens(
  raw: unknown[],
  sourceUser = 'import',
): Moment[] {
  if (!Array.isArray(raw) || raw.length > MAX_MOMENTS)
    throw new Error(
      'Listen history must be a list with at most 100,000 records.',
    );
  const userKey = encodeURIComponent(
    string(sourceUser, 'History username', 200, true).trim().toLowerCase(),
  );
  const result = new Map<string, Moment>();
  for (const value of raw) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const listen = value as Record<string, unknown>,
      metadata = listen.track_metadata as Record<string, unknown> | undefined;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      typeof metadata.track_name !== 'string' ||
      typeof metadata.artist_name !== 'string' ||
      typeof listen.listened_at !== 'number' ||
      !Number.isFinite(listen.listened_at)
    )
      continue;
    const title = metadata.track_name.trim().slice(0, 500),
      artist = metadata.artist_name.trim().slice(0, 500);
    if (
      !title ||
      !artist ||
      listen.listened_at < 0 ||
      listen.listened_at > 253402300799
    )
      continue;
    const date = new Date(listen.listened_at * 1000).toISOString();
    const externalId = `${userKey}:${Math.floor(listen.listened_at)}:${normalizedText(artist)}:${normalizedText(title)}`;
    result.set(externalId, {
      id: `lb-${hash(externalId).toString(36)}-${hash(Array.from(externalId).reverse().join('')).toString(36)}`,
      date,
      note: '',
      kind: 'imported',
      source: 'listenbrainz',
      externalId,
      title,
      artist,
    });
  }
  return [...result.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
}
export function mergeListens(
  state: State,
  moments: Moment[],
  coverage: HistoryCoverage,
): State {
  const keys = new Set(
    state.moments
      .filter((moment) => moment.source === 'listenbrainz')
      .map((moment) => moment.externalId || moment.id),
  );
  const next = [...state.moments];
  for (const moment of moments) {
    const key = moment.externalId || moment.id;
    if (keys.has(key)) continue;
    keys.add(key);
    next.push(moment);
  }
  const previous = state.historyCoverage;
  const historyCoverage =
    previous && previous.user === coverage.user
      ? {
          ...coverage,
          from:
            Date.parse(previous.from) < Date.parse(coverage.from)
              ? previous.from
              : coverage.from,
          to:
            Date.parse(previous.to) > Date.parse(coverage.to)
              ? previous.to
              : coverage.to,
        }
      : coverage;
  return validateState({ ...state, moments: next, historyCoverage });
}

export function sampleState(now: Date | string = new Date()): State {
  const base = new Date(now),
    ago = (days: number, hour = 19): string => {
      const date = new Date(base);
      date.setDate(date.getDate() - days);
      date.setHours(hour, 30, 0, 0);
      return date.toISOString();
    };
  const rows: [
    string,
    string,
    'track' | 'album',
    string[],
    MusicItem['status'],
    string,
    string,
  ][] = [
    [
      'Space 1.8',
      'Nala Sinephro',
      'album',
      ['late night', 'ambient'],
      'saved',
      'Maya',
      'For the kind of evening that needs a little more space.',
    ],
    [
      'Promises',
      'Floating Points, Pharoah Sanders & The London Symphony Orchestra',
      'album',
      ['focus', 'jazz'],
      'keep',
      'Alex',
      'Let it unfold. Movement 6 is worth waiting for.',
    ],
    [
      'In Rainbows',
      'Radiohead',
      'album',
      ['familiar', 'rainy days'],
      'keep',
      '',
      'The walk home, after the rain stopped.',
    ],
    [
      'A Walk',
      'Tycho',
      'track',
      ['focus', 'electronic'],
      'saved',
      'Sam',
      'Try this on tomorrow’s train.',
    ],
    [
      'Heaven or Las Vegas',
      'Cocteau Twins',
      'album',
      ['dreamy', 'evening'],
      'tried',
      'Maya',
      'Loved the texture. Come back with headphones.',
    ],
    [
      'Nights',
      'Frank Ocean',
      'track',
      ['late night', 'familiar'],
      'keep',
      '',
      'The beat switch still catches me.',
    ],
    [
      'Music Has the Right to Children',
      'Boards of Canada',
      'album',
      ['electronic', 'focus'],
      'saved',
      'Alex',
      'An entire world to get lost in.',
    ],
    [
      'Lahai',
      'Sampha',
      'album',
      ['soul', 'evening'],
      'saved',
      'Jess',
      'Saved after that long conversation in the kitchen.',
    ],
    [
      'Pink Moon',
      'Nick Drake',
      'album',
      ['quiet', 'morning'],
      'keep',
      '',
      'A slow Sunday and an open window.',
    ],
    [
      'Two Thousand and Seventeen',
      'Four Tet',
      'track',
      ['electronic', 'quiet'],
      'tried',
      'Sam',
      'One for the end of a busy day.',
    ],
    [
      'For Emma, Forever Ago',
      'Bon Iver',
      'album',
      ['rainy days', 'quiet'],
      'saved',
      'Jess',
      'For a proper uninterrupted listen.',
    ],
    [
      'Untrue',
      'Burial',
      'album',
      ['late night', 'electronic'],
      'tried',
      'Alex',
      'Last bus home music.',
    ],
  ];
  const items = rows.map(
    (
      [title, artist, type, tags, status, recommendedBy, note],
      i,
    ): MusicItem => ({
      id: `sample-${i + 1}`,
      title,
      artist,
      type,
      tags,
      status,
      recommendedBy,
      note,
      links: [],
      savedAt: ago(i * 2 + 1),
      ...(['tried', 'keep'].includes(status) ? { triedAt: ago(i * 2) } : {}),
      metadata: { source: 'manual' },
      ...([0, 4, 9].includes(i)
        ? { revisitDate: localDay(ago(i === 0 ? 0 : 1)) }
        : {}),
    }),
  );
  return {
    version: 1,
    items,
    capsules: [
      {
        id: 'sample-capsule-1',
        title: 'After the city quiets',
        description: 'Soft edges, open windows, one more track.',
        theme: 'copper',
        itemIds: ['sample-1', 'sample-6', 'sample-12'],
        createdAt: ago(9),
      },
      {
        id: 'sample-capsule-2',
        title: 'A little room to think',
        description: 'Music for finding the thread again.',
        theme: 'sage',
        itemIds: ['sample-2', 'sample-4', 'sample-7', 'sample-10'],
        createdAt: ago(14),
      },
      {
        id: 'sample-capsule-3',
        title: 'Sunday, slowly',
        description: 'Nothing pressing. Let the morning happen.',
        theme: 'blue',
        itemIds: ['sample-9', 'sample-11', 'sample-3'],
        createdAt: ago(21),
      },
    ],
    moments: [
      {
        id: 'sample-moment-1',
        itemId: 'sample-3',
        date: ago(1),
        note: 'Walked the long way home. The streets were still shining from the rain.',
        kind: 'memory',
        source: 'manual',
      },
      {
        id: 'sample-moment-2',
        capsuleId: 'sample-capsule-1',
        date: ago(3),
        note: 'A quiet hour after a very full day.',
        kind: 'session',
        source: 'manual',
      },
      {
        id: 'sample-moment-3',
        itemId: 'sample-2',
        date: ago(5),
        note: 'Heard something new in Movement 6 this time.',
        kind: 'revisit',
        source: 'manual',
      },
      {
        id: 'sample-moment-4',
        itemId: 'sample-9',
        date: ago(8, 10),
        note: 'Coffee, an open window, and nowhere to be.',
        kind: 'memory',
        source: 'manual',
      },
    ],
    preferences: { lowerEffects: false },
  };
}
