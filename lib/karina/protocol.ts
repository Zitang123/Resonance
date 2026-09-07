/* oxlint-disable no-control-regex -- Reject or strip untrusted control characters at provider boundaries. */
/** Pure Discord protocol helpers. No network, storage, logging, or token retention. */
export const MAX_DISCORD_BODY_BYTES = 1024 * 1024;
export const DISCORD_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export const KARINA_PERIODS = [
  '7day',
  '1month',
  '3month',
  '12month',
  'overall',
] as const;
export type KarinaPeriod = (typeof KARINA_PERIODS)[number];
export const KARINA_COMMAND_NAMES = [
  'fm',
  'nowplaying',
  'recent',
  'topartists',
  'toptracks',
  'topalbums',
  'artistplays',
  'discoveries',
  'stats',
  'chart',
  'sync',
  'connect',
  'privacy',
] as const;
export type KarinaCommandName = (typeof KARINA_COMMAND_NAMES)[number];
const PERIOD_COMMANDS = new Set<KarinaCommandName>([
  'topartists',
  'toptracks',
  'topalbums',
  'discoveries',
  'stats',
  'chart',
]);
const PERIOD_LABELS: Record<KarinaPeriod, string> = {
  '7day': 'Past 7 days',
  '1month': 'Past month',
  '3month': 'Past 3 months',
  '12month': 'Past year',
  overall: 'All available history',
};

export type KarinaCommandOption =
  | {
      name: 'period';
      description: string;
      type: 3;
      required: false;
      choices: Array<{ name: string; value: KarinaPeriod }>;
    }
  | {
      name: 'artist';
      description: string;
      type: 3;
      required: true;
      min_length: 1;
      max_length: 100;
    };
export type KarinaCommandDefinition = {
  name: KarinaCommandName;
  description: string;
  type: 1;
  integration_types: [1];
  contexts: [0, 1, 2];
  options?: KarinaCommandOption[];
};
const DESCRIPTIONS: Record<KarinaCommandName, string> = {
  fm: 'See what your linked account currently reports as playing.',
  nowplaying: 'See what your linked account currently reports as playing.',
  recent: 'See your own recently recorded listens.',
  topartists: 'See your own top artists for a selected period.',
  toptracks: 'See your own top tracks for a selected period.',
  topalbums: 'See your own top albums for a selected period.',
  artistplays:
    'See your recorded plays for one artist across all available history.',
  discoveries:
    'See artists first recorded in your available archive during a selected period.',
  stats: 'See statistics from your own linked listening records.',
  chart: 'Open your listening charts in Resonance.',
  sync: 'Request a refresh of your own linked listening history.',
  connect: 'Link your account securely on the Resonance website.',
  privacy: 'See how private replies and account linking work.',
};

/** Register these globally. User-install support must also be enabled in the Portal. */
export const KARINA_COMMANDS: KarinaCommandDefinition[] =
  KARINA_COMMAND_NAMES.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    type: 1,
    integration_types: [1],
    contexts: [0, 1, 2],
    ...(PERIOD_COMMANDS.has(name)
      ? {
          options: [
            {
              name: 'period' as const,
              description: 'Choose the period to show (default: past 7 days).',
              type: 3 as const,
              required: false as const,
              choices: KARINA_PERIODS.map((value) => ({
                name: PERIOD_LABELS[value],
                value,
              })),
            },
          ],
        }
      : {}),
    ...(name === 'artistplays'
      ? {
          options: [
            {
              name: 'artist' as const,
              description:
                'Artist name to look up in your own listening records.',
              type: 3 as const,
              required: true as const,
              min_length: 1 as const,
              max_length: 100 as const,
            },
          ],
        }
      : {}),
  }));

function hex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/.{2}/g) || [], (part) =>
    parseInt(part, 16),
  );
}

/**
 * `body` must be the ORIGINAL request text, never JSON.stringify(parsedBody).
 * `now` is Unix milliseconds. Timestamp tolerance is +/-5 minutes.
 * The caller must separately deduplicate interaction IDs before any mutation.
 */
export async function verifyDiscord(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
  now = Date.now(),
): Promise<boolean> {
  try {
    if (
      typeof body !== 'string' ||
      body.length > MAX_DISCORD_BODY_BYTES ||
      typeof signature !== 'string' ||
      !/^[a-f\d]{128}$/i.test(signature) ||
      typeof publicKey !== 'string' ||
      !/^[a-f\d]{64}$/i.test(publicKey) ||
      typeof timestamp !== 'string' ||
      !/^\d{1,12}$/.test(timestamp) ||
      !Number.isFinite(now)
    )
      return false;
    const signedAt = Number(timestamp) * 1000;
    if (
      !Number.isSafeInteger(signedAt) ||
      Math.abs(now - signedAt) > DISCORD_SIGNATURE_WINDOW_MS
    )
      return false;
    const encoder = new TextEncoder();
    const rawBody = encoder.encode(body);
    if (rawBody.byteLength > MAX_DISCORD_BODY_BYTES) return false;
    const prefix = encoder.encode(timestamp);
    const message = new Uint8Array(prefix.length + rawBody.length);
    message.set(prefix);
    message.set(rawBody, prefix.length);
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      hex(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await globalThis.crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      hex(signature),
      message,
    );
  } catch {
    return false;
  }
}

export type ParsedPing = { kind: 'ping'; type: 1 };
export type ParsedCommandInteraction = {
  kind: 'command';
  type: 2;
  id: string;
  applicationId: string;
  actorId: string;
  token: string;
  command: KarinaCommandName;
  period: KarinaPeriod;
  artist?: string;
  context?: 0 | 1 | 2;
  guildId?: string;
};
export type ParsedInteraction = ParsedPing | ParsedCommandInteraction;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const snowflake = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[1-9]\d{0,19}$/.test(value) &&
  BigInt(value) <= 18_446_744_073_709_551_615n;
const token = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2048 &&
  !/[^\x21-\x7e]/.test(value);
const isCommand = (value: unknown): value is KarinaCommandName =>
  typeof value === 'string' &&
  (KARINA_COMMAND_NAMES as readonly string[]).includes(value);
const isPeriod = (value: unknown): value is KarinaPeriod =>
  typeof value === 'string' &&
  (KARINA_PERIODS as readonly string[]).includes(value);

/**
 * Parse only AFTER verifyDiscord succeeds. This function is a schema parser,
 * not authentication: it cannot establish whether an arbitrary object was signed.
 * Never use command options or installation-owner metadata as the acting user.
 * The route must additionally compare applicationId with its configured app ID.
 */
export function parseInteraction(value: unknown): ParsedInteraction | null {
  try {
    if (!record(value)) return null;
    if (value.type === 1) return { kind: 'ping', type: 1 };
    if (
      value.type !== 2 ||
      !snowflake(value.id) ||
      !snowflake(value.application_id) ||
      !token(value.token) ||
      !record(value.data)
    )
      return null;
    const data = value.data;
    if (data.type !== 1 || !isCommand(data.name)) return null;
    if (data.id !== undefined && !snowflake(data.id)) return null;
    if (
      value.context !== undefined &&
      ![0, 1, 2].includes(value.context as number)
    )
      return null;
    if (value.guild_id !== undefined && !snowflake(value.guild_id)) return null;
    let memberId: string | undefined, userId: string | undefined;
    if (value.member !== undefined) {
      if (
        !record(value.member) ||
        !record(value.member.user) ||
        !snowflake(value.member.user.id)
      )
        return null;
      memberId = value.member.user.id;
    }
    if (value.user !== undefined) {
      if (!record(value.user) || !snowflake(value.user.id)) return null;
      userId = value.user.id;
    }
    if ((!memberId && !userId) || (memberId && userId && memberId !== userId))
      return null;
    if ((value.guild_id !== undefined || value.context === 0) && !memberId)
      return null;
    if ((value.context === 1 || value.context === 2) && !userId) return null;
    let period: KarinaPeriod = '7day';
    let artist: string | undefined;
    if (data.options !== undefined) {
      if (!Array.isArray(data.options) || data.options.length > 1) return null;
      if (data.options.length) {
        const option = data.options[0];
        if (
          !record(option) ||
          option.type !== 3 ||
          option.options !== undefined
        )
          return null;
        if (data.name === 'artistplays') {
          if (
            option.name !== 'artist' ||
            typeof option.value !== 'string' ||
            option.value.length > 100 ||
            !option.value.trim() ||
            /[\u0000-\u001f\u007f]/.test(option.value)
          )
            return null;
          artist = option.value.trim();
        } else {
          if (
            !PERIOD_COMMANDS.has(data.name) ||
            option.name !== 'period' ||
            !isPeriod(option.value)
          )
            return null;
          period = option.value;
        }
      }
    }
    if (data.name === 'artistplays' && !artist) return null;
    return {
      kind: 'command',
      type: 2,
      id: value.id,
      applicationId: value.application_id,
      actorId: memberId || userId!,
      token: value.token,
      command: data.name,
      period,
      ...(artist ? { artist } : {}),
      ...(value.context !== undefined
        ? { context: value.context as 0 | 1 | 2 }
        : {}),
      ...(value.guild_id !== undefined ? { guildId: value.guild_id } : {}),
    };
  } catch {
    return null;
  }
}

export type ListeningSnapshot = {
  linked: boolean;
  /** Server-owned configuration, not a URL supplied in a Discord option. */
  siteUrl: string;
  source?: string;
  nowPlaying?: {
    title: string;
    artist: string;
    url?: string;
    playing: boolean;
  } | null;
  recent?: Array<{ title: string; artist: string; playedAt: string }>;
  topArtists?: Array<{ name: string; artist?: string; count: number }>;
  topTracks?: Array<{ name: string; artist?: string; count: number }>;
  topAlbums?: Array<{ name: string; artist?: string; count: number }>;
  /** Counts and dates cover all available history, not only the selected period. */
  artistPlays?: {
    name: string;
    count: number;
    first: string | null;
    last: string | null;
  };
  /** Parent filters by first recorded date in the selected period; count stays all-history. */
  discoveries?: Array<{ name: string; count: number; first: string }>;
  /** Statistics must already represent the requested period; this module does not infer them. */
  stats?: {
    count: number;
    artistCount: number;
    trackCount: number;
    first: string | null;
    last: string | null;
    durationMs: number | null;
    source: string;
  };
  /** Supplied only after the parent has actually queued or completed a sync. */
  syncMessage?: string;
};
export type KarinaEmbed = {
  author: { name: string };
  title: string;
  description?: string;
  url?: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
};
export type KarinaDiscordReply = {
  type: 4;
  data: {
    content?: string;
    embeds?: KarinaEmbed[];
    flags: 0 | 64;
    allowed_mentions: { parse: [] };
  };
};
export type PrivateDiscordReply = KarinaDiscordReply & {
  data: { content: string; flags: 64 };
};
export type KarinaCommandRequest =
  | KarinaCommandName
  | Pick<ParsedCommandInteraction, 'command' | 'period' | 'artist'>;
export type ReplyVisibility = 'public' | 'private';

/** Normal command visibility. Authenticate first: unlinked/error replies stay private. */
export function replyVisibility(
  command: KarinaCommandRequest,
): ReplyVisibility {
  const name = typeof command === 'string' ? command : command.command;
  return (
    [
      'fm',
      'nowplaying',
      'recent',
      'topartists',
      'toptracks',
      'topalbums',
      'artistplays',
      'discoveries',
      'stats',
      'chart',
    ] as string[]
  ).includes(name)
    ? 'public'
    : 'private';
}

/** Single-line user text with Markdown, mention and bidirectional-control protection. */
export function escapeDiscordText(value: unknown, maxLength = 120): string {
  if (typeof value !== 'string') return '';
  const clean = value
    .slice(0, 4000)
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(clean);
  const shortened =
    characters.slice(0, maxLength).join('') +
    (characters.length > maxLength ? '…' : '');
  return shortened
    .replace(/\\/g, '\\\\')
    .replace(/([`*_~|[\]()#])/g, '\\$1')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/@/g, '@\u200b');
}

function siteLink(siteUrl: string): string | null {
  try {
    const url = new URL(siteUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return null;
    if (
      url.hostname.length > 253 ||
      !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(
        url.hostname,
      )
    )
      return null;
    return `${url.origin}/?space=Karina`;
  } catch {
    return null;
  }
}
function musicLink(input?: string): string | null {
  try {
    if (!input || input.length > 2000) return null;
    const url = new URL(input);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return null;
    const host = url.hostname.toLowerCase();
    const valid =
      (['last.fm', 'www.last.fm'].includes(host) &&
        url.pathname.startsWith('/music/')) ||
      (host === 'open.spotify.com' &&
        /^\/(?:intl-[a-z]{2}\/)?(?:track|album)\/[a-zA-Z0-9]+\/?$/.test(
          url.pathname,
        )) ||
      (host === 'music.apple.com' &&
        /^\/(?:[a-z]{2}\/)?(?:album|song)\//.test(url.pathname)) ||
      (['youtube.com', 'www.youtube.com', 'music.youtube.com'].includes(host) &&
        url.pathname === '/watch' &&
        /^[\w-]+$/.test(url.searchParams.get('v') || '')) ||
      (host === 'youtu.be' && /^\/[\w-]+\/?$/.test(url.pathname)) ||
      ((host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) &&
        /^\/(?:album|track)\/[^/]+\/?$/.test(url.pathname));
    if (!valid) return null;
    url.hash = '';
    // Snapshot keys because deletions mutate this iterator.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const key of [...url.searchParams.keys()])
      if (
        !(key === 'v' && host.endsWith('youtube.com')) &&
        !(key === 'i' && host === 'music.apple.com')
      )
        url.searchParams.delete(key);
    // Parentheses are valid URL characters but must not terminate our Markdown link.
    const result = url.toString().replace(/\(/g, '%28').replace(/\)/g, '%29');
    return result.length <= 850 ? result : null;
  } catch {
    return null;
  }
}
function count(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString('en-GB')
    : 'unknown';
}
function date(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40) return 'unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'unknown';
  return new Date(parsed).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function duration(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return 'unknown';
  const minutes = Math.floor(value / 60_000);
  return `${Math.floor(minutes / 60).toLocaleString('en-GB')}h ${minutes % 60}m recorded`;
}
function reply(content: string): PrivateDiscordReply {
  const bounded =
    content.length > 2000
      ? `${content.slice(0, 1998).replace(/[\uD800-\uDBFF\\]$/, '')}…`
      : content;
  return {
    type: 4,
    data: { content: bounded, flags: 64, allowed_mentions: { parse: [] } },
  };
}

function publicEmbed(embed: KarinaEmbed): KarinaDiscordReply {
  return {
    type: 4,
    data: { embeds: [embed], flags: 0, allowed_mentions: { parse: [] } },
  };
}

/** Formats already-authorized, already-selected data. Never fetches, syncs, or estimates plays. */
export function commandReply(
  command: KarinaCommandRequest,
  snapshot: ListeningSnapshot,
): KarinaDiscordReply {
  const name = typeof command === 'string' ? command : command.command;
  const period = typeof command === 'string' ? '7day' : command.period;
  const periodLabel = PERIOD_LABELS[period] || PERIOD_LABELS['7day'];
  const url = siteLink(snapshot.siteUrl);
  const openSite = url
    ? `[Open Karina in Resonance](${url})`
    : 'Open Karina in your existing Resonance app. The website link is not configured.';
  const source = escapeDiscordText(
    snapshot.source ||
      snapshot.stats?.source ||
      'Linked listening-history records',
    90,
  );
  const embed = (
    section: string,
    title: string,
    description?: string,
    selectedPeriod = periodLabel,
  ): KarinaEmbed => ({
    author: { name: `KARINA · ${section}` },
    title,
    ...(description ? { description } : {}),
    color: 0xb99173,
    footer: {
      text: `${source} · ${selectedPeriod} · Recorded history may be incomplete`,
    },
  });

  if (name === 'privacy')
    return reply(
      `**Choose where your music appears.**\nListening commands post to the conversation where you run them, including server channels and group DMs. Connection, sync status and privacy replies are visible only to you. Use a one-to-one DM for a private listening conversation.\n\nManage linking and sync in Resonance.\n${openSite}`,
    );
  if (name === 'connect')
    return reply(
      `**${snapshot.linked ? 'Manage your linked account' : 'Connect your account'}**\nLink Discord and your listening source on the website. App installation by itself does not link your music.\n\n${openSite}`,
    );
  if (!snapshot.linked)
    return reply(
      `**Connect your music first.**\nLink your account in Resonance to use Karina with your own listening records.\n\n${openSite}`,
    );
  if (name === 'fm' || name === 'nowplaying') {
    const current = snapshot.nowPlaying;
    if (!current?.playing || !current.title?.trim() || !current.artist?.trim())
      return publicEmbed(
        embed(
          'NOW PLAYING',
          'Nothing currently reported as playing',
          'Use /recent to see your completed listening records.',
          'Current report',
        ),
      );
    const musicUrl = musicLink(current.url);
    const result = embed(
      'NOW PLAYING',
      escapeDiscordText(current.title, 100),
      `**${escapeDiscordText(current.artist, 120)}**${musicUrl ? `\n\n[Open this recording](${musicUrl})` : ''}`,
      'Current report · Not a completed listen',
    );
    if (musicUrl) result.url = musicUrl;
    return publicEmbed(result);
  }
  if (name === 'recent') {
    const entries = (snapshot.recent || []).slice(0, 10);
    const rows = entries.map(
      (entry, index) =>
        `\`${String(index + 1).padStart(2, '0')}\` **${escapeDiscordText(entry.title, 70)}** — ${escapeDiscordText(entry.artist, 45)}\n${date(entry.playedAt)} (UTC)`,
    );
    return publicEmbed(
      embed(
        'RECENT',
        'Your recent listens',
        rows.length
          ? rows.join('\n\n')
          : 'No completed listens are available in this snapshot.',
        'Recent records',
      ),
    );
  }
  if (name === 'topartists' || name === 'toptracks' || name === 'topalbums') {
    const entries =
      (name === 'topartists'
        ? snapshot.topArtists
        : name === 'toptracks'
          ? snapshot.topTracks
          : snapshot.topAlbums) || [];
    const label =
      name === 'topartists'
        ? 'artists'
        : name === 'toptracks'
          ? 'tracks'
          : 'albums';
    const rows = entries
      .slice(0, 10)
      .map(
        (entry, index) =>
          `\`${String(index + 1).padStart(2, '0')}\` **${escapeDiscordText(entry.name, 70)}**${entry.artist && name !== 'topartists' ? ` — ${escapeDiscordText(entry.artist, 45)}` : ''} · \`${count(entry.count)}\` listens`,
      );
    return publicEmbed(
      embed(
        'TOP TEN',
        `Your top ${label}`,
        rows.length
          ? rows.join('\n')
          : 'No ranked records are available for this period.',
      ),
    );
  }
  if (name === 'artistplays') {
    const artist = snapshot.artistPlays;
    const requested =
      typeof command === 'string'
        ? artist?.name
        : command.artist || artist?.name;
    if (!requested)
      return reply(
        'Choose an artist with /artistplays to look up your own recorded listens.',
      );
    const result = embed(
      'ARTIST PLAYS',
      escapeDiscordText(artist?.name || requested, 100),
      artist
        ? 'Across your available archive. The first recorded date may be later than your actual first listen.'
        : 'No recorded plays for this artist are available in your archive.',
      'All available history',
    );
    if (artist)
      result.fields = [
        { name: 'Recorded listens', value: count(artist.count), inline: true },
        {
          name: 'First recorded',
          value: `${date(artist.first)} (UTC)`,
          inline: true,
        },
        {
          name: 'Most recently recorded',
          value: `${date(artist.last)} (UTC)`,
          inline: true,
        },
      ];
    return publicEmbed(result);
  }
  if (name === 'discoveries') {
    const entries = (snapshot.discoveries || []).slice(0, 10);
    const rows = entries.map(
      (artist, index) =>
        `\`${String(index + 1).padStart(2, '0')}\` **${escapeDiscordText(artist.name, 80)}**\nFirst recorded ${date(artist.first)} (UTC) · \`${count(artist.count)}\` listens across your available history`,
    );
    const description = `${rows.length ? rows.join('\n\n') : 'No artists were first recorded in your available archive during this period.'}\n\nThese dates mark the first available record, not necessarily your first-ever listen.`;
    return publicEmbed(
      embed('DISCOVERIES', 'First recorded artists', description),
    );
  }
  if (name === 'stats') {
    const stats = snapshot.stats;
    const result = embed(
      'STATISTICS',
      'Your listening records',
      stats
        ? undefined
        : 'No statistics are available for this period. Listening duration is unknown.',
    );
    if (stats)
      result.fields = [
        { name: 'Recorded listens', value: count(stats.count), inline: true },
        { name: 'Artists', value: count(stats.artistCount), inline: true },
        { name: 'Tracks', value: count(stats.trackCount), inline: true },
        {
          name: 'Recorded duration',
          value: duration(stats.durationMs),
          inline: true,
        },
        {
          name: 'Available record span',
          value: `${date(stats.first)}–${date(stats.last)} (UTC)`,
        },
      ];
    return publicEmbed(result);
  }
  if (name === 'chart') {
    if (!url)
      return reply(
        'The Resonance website link is not configured. Open Karina in your existing Resonance app.',
      );
    const result = embed(
      'CHARTS',
      'Your listening chart',
      `Explore chart views on the Resonance website.\n\n${openSite}`,
    );
    result.url = url;
    return publicEmbed(result);
  }
  if (name === 'sync')
    return reply(
      `**Listening-history sync**\n${snapshot.syncMessage ? escapeDiscordText(snapshot.syncMessage, 600) : 'No sync result is available yet. Check Karina in Resonance.'}\n\n${openSite}`,
    );
  return reply(
    'This command is not supported. Use /privacy or /connect to get started.',
  );
}
