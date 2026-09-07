import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KARINA_COMMANDS,
  KARINA_COMMAND_NAMES,
  KARINA_PERIODS,
  verifyDiscord,
  parseInteraction,
  commandReply,
  replyVisibility,
  escapeDiscordText,
  MAX_DISCORD_BODY_BYTES,
} from './protocol.ts';
import type { ListeningSnapshot, KarinaDiscordReply } from './protocol.ts';

const NOW = Date.parse('2026-09-07T19:00:00Z');
const TIMESTAMP = String(NOW / 1000);
const ACTOR = '123456789012345678';
const APP = '234567890123456789';
const INTERACTION = '345678901234567890';
const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
  'sign',
  'verify',
])) as CryptoKeyPair;
const publicKey = Buffer.from(
  await crypto.subtle.exportKey('raw', keyPair.publicKey),
).toString('hex');
async function sign(body: string, timestamp = TIMESTAMP) {
  return Buffer.from(
    await crypto.subtle.sign(
      'Ed25519',
      keyPair.privateKey,
      new TextEncoder().encode(timestamp + body),
    ),
  ).toString('hex');
}
function interaction(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 2,
    id: INTERACTION,
    application_id: APP,
    token: 'test-interaction-token',
    context: 1,
    user: { id: ACTOR },
    data: { id: '456789012345678901', name: 'stats', type: 1 },
    ...patch,
  };
}
const snapshot: ListeningSnapshot = {
  linked: true,
  siteUrl: 'https://resonance.example/existing?private=not-forwarded#ignored',
  source: 'Last.fm',
  nowPlaying: {
    title: 'Supernova',
    artist: 'aespa',
    playing: true,
    url: 'https://www.last.fm/music/aespa/_/Supernova?utm_source=test',
  },
  recent: [
    {
      title: 'A completed record',
      artist: 'An artist',
      playedAt: '2026-09-07T18:00:00Z',
    },
  ],
  topArtists: [{ name: 'aespa', count: 12 }],
  topTracks: [{ name: 'Supernova', artist: 'aespa', count: 12 }],
  topAlbums: [{ name: 'Armageddon', artist: 'aespa', count: 12 }],
  artistPlays: {
    name: 'aespa',
    count: 120,
    first: '2024-05-13T18:00:00Z',
    last: '2026-09-07T18:00:00Z',
  },
  discoveries: [
    { name: 'Nala Sinephro', count: 12, first: '2026-09-05T18:00:00Z' },
  ],
  stats: {
    count: 24,
    artistCount: 3,
    trackCount: 8,
    first: '2026-09-01T10:00:00Z',
    last: '2026-09-07T18:00:00Z',
    durationMs: null,
    source: 'Last.fm',
  },
};
function text(response: KarinaDiscordReply): string {
  return [
    response.data.content,
    ...(response.data.embeds || []).flatMap((embed) => [
      embed.author.name,
      embed.title,
      embed.description,
      ...(embed.fields || []).map((field) => `${field.name}: ${field.value}`),
      embed.footer.text,
    ]),
  ]
    .filter(Boolean)
    .join('\n');
}
function assertEmbedBounds(response: KarinaDiscordReply) {
  assert.ok((response.data.content || '').length <= 2000);
  let total = 0;
  for (const embed of response.data.embeds || []) {
    assert.ok(embed.title.length <= 256);
    assert.ok((embed.description || '').length <= 4096);
    assert.ok(embed.author.name.length <= 256);
    assert.ok(embed.footer.text.length <= 2048);
    total +=
      embed.title.length +
      (embed.description || '').length +
      embed.author.name.length +
      embed.footer.text.length;
    for (const field of embed.fields || []) {
      assert.ok(field.name.length <= 256);
      assert.ok(field.value.length <= 1024);
      total += field.name.length + field.value.length;
    }
  }
  assert.ok(total <= 6000);
}

void test('valid Ed25519 signature verifies exact Unicode raw body and timestamp', async () => {
  const body = JSON.stringify({ type: 1, note: '카리나 🎧 café' });
  const signature = await sign(body);
  assert.equal(
    await verifyDiscord(body, signature, TIMESTAMP, publicKey, NOW),
    true,
  );
  assert.equal(
    await verifyDiscord(
      body,
      signature.toUpperCase(),
      TIMESTAMP,
      publicKey.toUpperCase(),
      NOW,
    ),
    true,
  );
});

void test('forged signature, changed body and reformatted JSON are rejected', async () => {
  const body = '{"type":1}';
  const signature = await sign(body);
  assert.equal(
    await verifyDiscord(body, '0'.repeat(128), TIMESTAMP, publicKey, NOW),
    false,
  );
  assert.equal(
    await verifyDiscord('{"type":2}', signature, TIMESTAMP, publicKey, NOW),
    false,
  );
  assert.equal(
    await verifyDiscord('{ "type": 1 }', signature, TIMESTAMP, publicKey, NOW),
    false,
  );
});

void test('stale, future and malformed timestamps or hex inputs fail closed', async () => {
  const body = '{"type":1}';
  for (const seconds of [-301, 301]) {
    const timestamp = String(NOW / 1000 + seconds);
    assert.equal(
      await verifyDiscord(
        body,
        await sign(body, timestamp),
        timestamp,
        publicKey,
        NOW,
      ),
      false,
    );
  }
  const signature = await sign(body);
  for (const timestamp of ['', 'nope', '123.5', '1e10', '9'.repeat(13)])
    assert.equal(
      await verifyDiscord(body, signature, timestamp, publicKey, NOW),
      false,
    );
  assert.equal(
    await verifyDiscord(body, 'xx'.repeat(64), TIMESTAMP, publicKey, NOW),
    false,
  );
  assert.equal(
    await verifyDiscord(body, signature, TIMESTAMP, '0'.repeat(63), NOW),
    false,
  );
  assert.equal(
    await verifyDiscord(body, signature, TIMESTAMP, publicKey, NaN),
    false,
  );
});

void test('the one-megabyte limit is measured in UTF-8 bytes', async () => {
  assert.equal(
    await verifyDiscord(
      'a'.repeat(MAX_DISCORD_BODY_BYTES + 1),
      '0'.repeat(128),
      TIMESTAMP,
      publicKey,
      NOW,
    ),
    false,
  );
  const unicode = '🎧'.repeat(300_000);
  assert.ok(unicode.length < MAX_DISCORD_BODY_BYTES);
  assert.equal(
    await verifyDiscord(
      unicode,
      await sign(unicode),
      TIMESTAMP,
      publicKey,
      NOW,
    ),
    false,
  );
});

void test('PING and DM commands parse without mutating input', () => {
  assert.deepEqual(parseInteraction({ type: 1 }), { kind: 'ping', type: 1 });
  const input = interaction();
  const before = structuredClone(input);
  Object.freeze(input);
  assert.deepEqual(parseInteraction(input), {
    kind: 'command',
    type: 2,
    id: INTERACTION,
    applicationId: APP,
    actorId: ACTOR,
    token: 'test-interaction-token',
    command: 'stats',
    period: '7day',
    context: 1,
  });
  assert.deepEqual(input, before);
});

void test('guild, DM and group-DM actors come from their verified payload fields', () => {
  const guild = interaction({
    context: 0,
    user: undefined,
    member: { user: { id: ACTOR } },
    guild_id: '567890123456789012',
  });
  const parsedGuild = parseInteraction(guild);
  assert.equal(parsedGuild?.kind, 'command');
  if (parsedGuild?.kind === 'command') assert.equal(parsedGuild.actorId, ACTOR);
  for (const context of [1, 2]) {
    const parsed = parseInteraction(
      interaction({
        context,
        authorizing_integration_owners: { '1': '999999999999999999' },
      }),
    );
    assert.equal(parsed?.kind, 'command');
    if (parsed?.kind === 'command') assert.equal(parsed.actorId, ACTOR);
  }
  assert.equal(
    parseInteraction(
      interaction({ member: { user: { id: '999999999999999999' } } }),
    ),
    null,
  );
  assert.equal(parseInteraction(interaction({ context: 0 })), null);
  assert.equal(
    parseInteraction(
      interaction({
        user: undefined,
        authorizing_integration_owners: { '1': ACTOR },
      }),
    ),
    null,
  );
});

void test('unknown commands, invalid snowflakes, missing tokens and wrong interaction types reject', () => {
  assert.equal(
    parseInteraction(interaction({ data: { name: 'everyone', type: 1 } })),
    null,
  );
  assert.equal(parseInteraction(interaction({ type: 3 })), null);
  assert.equal(
    parseInteraction(interaction({ data: { name: 'stats', type: 2 } })),
    null,
  );
  for (const id of ['0', '01', '-1', '18446744073709551616', 'abc', 123])
    assert.equal(parseInteraction(interaction({ id })), null);
  assert.equal(
    parseInteraction(interaction({ application_id: undefined })),
    null,
  );
  assert.equal(
    parseInteraction(interaction({ user: { id: 'not-an-id' } })),
    null,
  );
  for (const token of ['', 'x'.repeat(2049), 'line\nbreak', undefined])
    assert.equal(parseInteraction(interaction({ token })), null);
  for (const raw of [null, [], true, 'unsigned nonsense', { type: 2 }])
    assert.equal(parseInteraction(raw), null);
});

void test('only the five permitted periods and no other-user options are accepted', () => {
  for (const period of KARINA_PERIODS) {
    const parsed = parseInteraction(
      interaction({
        data: {
          name: 'toptracks',
          type: 1,
          options: [{ name: 'period', type: 3, value: period }],
        },
      }),
    );
    assert.equal(parsed?.kind, 'command');
    if (parsed?.kind === 'command') assert.equal(parsed.period, period);
  }
  for (const options of [
    [{ name: 'user', type: 6, value: ACTOR }],
    [{ name: 'period', type: 3, value: 'yesterday' }],
    [{ name: 'period', type: 4, value: 7 }],
    [
      { name: 'period', type: 3, value: '7day' },
      { name: 'period', type: 3, value: 'overall' },
    ],
  ])
    assert.equal(
      parseInteraction(
        interaction({ data: { name: 'stats', type: 1, options } }),
      ),
      null,
    );
  assert.equal(
    parseInteraction(
      interaction({
        data: {
          name: 'recent',
          type: 1,
          options: [{ name: 'period', type: 3, value: '7day' }],
        },
      }),
    ),
    null,
  );
});

void test('registration exposes only global user-installed commands with private-data options', () => {
  assert.deepEqual(
    KARINA_COMMANDS.map((c) => c.name),
    [...KARINA_COMMAND_NAMES],
  );
  for (const command of KARINA_COMMANDS) {
    assert.equal(command.type, 1);
    assert.deepEqual(command.integration_types, [1]);
    assert.deepEqual(command.contexts, [0, 1, 2]);
    assert.ok(command.description.length <= 100);
    for (const option of command.options || []) {
      if (command.name === 'artistplays') {
        assert.equal(option.name, 'artist');
        assert.equal(option.required, true);
        if (option.name === 'artist') assert.equal(option.max_length, 100);
      } else {
        assert.equal(option.name, 'period');
        assert.equal(option.required, false);
        if (option.name === 'period')
          assert.deepEqual(
            option.choices.map((c) => c.value),
            [...KARINA_PERIODS],
          );
      }
    }
  }
});

void test('linked listening commands are public while connection, privacy and sync stay ephemeral', () => {
  const before = structuredClone(snapshot);
  for (const command of KARINA_COMMAND_NAMES) {
    const result = commandReply(command, snapshot);
    const isPrivate = ['connect', 'privacy', 'sync'].includes(command);
    assert.equal(replyVisibility(command), isPrivate ? 'private' : 'public');
    assert.equal(
      replyVisibility({ command, period: '1month' }),
      isPrivate ? 'private' : 'public',
    );
    assert.equal(result.type, 4);
    assert.equal(result.data.flags, isPrivate ? 64 : 0);
    assert.deepEqual(result.data.allowed_mentions, { parse: [] });
    assert.equal(!!result.data.embeds?.length, !isPrivate);
    assertEmbedBounds(result);
  }
  assert.deepEqual(snapshot, before);
});

void test('music strings cannot inject Markdown links, headings, new lines or mentions', () => {
  const hostile =
    '**loud**\n# heading <@123456789012345678> @everyone [bait](https://bad.example)';
  const result = commandReply('fm', {
    ...snapshot,
    nowPlaying: {
      title: hostile,
      artist: hostile,
      url: 'javascript:alert(1)',
      playing: true,
    },
  });
  const output = text(result);
  assert.ok(!output.includes('<@'));
  assert.ok(!output.includes('@everyone'));
  assert.ok(!output.includes('[bait](https://bad.example)'));
  assert.ok(!output.includes('javascript:'));
  assert.ok(output.includes('\\*\\*loud\\*\\*'));
  assert.ok(!escapeDiscordText('name\u202Eevil').includes('\u202E'));
});

void test('now-playing never treats a recent completed record as current playback', () => {
  const recentOnly = { ...snapshot, nowPlaying: null };
  for (const name of ['fm', 'nowplaying'] as const) {
    const result = commandReply(name, recentOnly);
    const content = text(result);
    assert.equal(result.data.flags, 0);
    assert.match(content, /Nothing currently reported/);
    assert.ok(!content.includes('A completed record'));
    assert.match(
      text(
        commandReply(name, {
          ...snapshot,
          nowPlaying: { title: 'Old title', artist: 'Artist', playing: false },
        }),
      ),
      /Nothing currently reported/,
    );
  }
  assert.ok(
    !text(commandReply('recent', { ...snapshot, recent: [] })).includes(
      'Supernova',
    ),
  );
});

void test('stats preserve unknown duration and source rather than estimating from counts', () => {
  const content = text(
    commandReply({ command: 'stats', period: '1month' }, snapshot),
  );
  assert.match(content, /Past month/);
  assert.match(content, /Recorded duration: unknown/);
  assert.match(content, /Last\.fm/);
  assert.match(
    text(
      commandReply('stats', {
        ...snapshot,
        stats: { ...snapshot.stats!, durationMs: 3_660_000 },
      }),
    ),
    /1h 1m recorded/,
  );
});

void test('connect/chart links are fixed to the configured HTTPS origin and Karina page', () => {
  for (const command of ['connect', 'chart'] as const) {
    const result = commandReply(command, snapshot);
    assert.match(text(result), /https:\/\/resonance\.example\/\?space=Karina/);
    assert.ok(!text(result).includes('private=not-forwarded'));
    for (const embed of result.data.embeds || [])
      assert.ok(!('image' in embed) && !('thumbnail' in embed));
  }
  for (const siteUrl of [
    'javascript:alert(1)',
    'http://resonance.example',
    'https://user:secret@resonance.example',
    'https://resonance.example:8080',
    'https://bad).example',
  ]) {
    const result = commandReply('connect', { ...snapshot, siteUrl });
    assert.match(text(result), /not configured/);
    assert.ok(!text(result).includes(siteUrl));
    const chartError = commandReply('chart', { ...snapshot, siteUrl });
    assert.equal(chartError.data.flags, 64);
  }
  const chart = text(commandReply('chart', snapshot));
  assert.match(chart, /website/);
  assert.ok(!chart.includes('generated'));
});

void test('unlinked commands reveal no listening data and sync does not claim unperformed work', () => {
  for (const command of KARINA_COMMAND_NAMES.filter(
    (c) => c !== 'connect' && c !== 'privacy',
  )) {
    const result = commandReply(command, { ...snapshot, linked: false });
    const content = text(result);
    assert.equal(result.data.flags, 64);
    assert.match(content, /Connect your music first/);
    assert.ok(!content.includes('Supernova'));
    assert.ok(!content.includes('aespa'));
  }
  assert.match(text(commandReply('sync', snapshot)), /No sync result/);
  assert.match(
    text(
      commandReply('sync', {
        ...snapshot,
        syncMessage: 'Your sync is queued.',
      }),
    ),
    /Your sync is queued/,
  );
  assert.equal(replyVisibility('unknown' as never), 'private');
  assert.equal(commandReply('unknown' as never, snapshot).data.flags, 64);
});

void test('large and unusual provider strings remain within Discord message limits', () => {
  const large = Array.from({ length: 10 }, () => ({
    name: '*'.repeat(10_000),
    artist: '🎧'.repeat(10_000),
    count: 10,
  }));
  for (const command of ['topartists', 'toptracks', 'topalbums'] as const) {
    const result = commandReply(command, {
      ...snapshot,
      topArtists: large,
      topTracks: large,
      topAlbums: large,
    });
    assertEmbedBounds(result);
    assert.match(text(result), /Last\.fm/);
  }
  const recent = Array.from({ length: 10 }, () => ({
    title: '*'.repeat(10_000),
    artist: '🎧'.repeat(10_000),
    playedAt: '2026-09-07T18:00:00Z',
  }));
  const recentResult = commandReply('recent', { ...snapshot, recent });
  assertEmbedBounds(recentResult);
  assert.match(text(recentResult), /Last\.fm/);
  const nowResult = commandReply('nowplaying', {
    ...snapshot,
    nowPlaying: {
      title: '*'.repeat(10_000),
      artist: '🎧'.repeat(10_000),
      url: `https://www.last.fm/music/${'x'.repeat(1800)}`,
      playing: true,
    },
  });
  assertEmbedBounds(nowResult);
  assert.match(text(nowResult), /Last\.fm.*Current report/);
  assert.ok(!text(nowResult).includes('Open this recording'));
});

void test('ranked embeds show ten numbered entries, counts and source/period footer', () => {
  const topArtists = Array.from({ length: 12 }, (_, i) => ({
    name: `Artist ${i + 1}`,
    count: 100 - i,
  }));
  const result = commandReply(
    { command: 'topartists', period: '3month' },
    { ...snapshot, topArtists },
  );
  const embed = result.data.embeds![0];
  assert.match(embed.description!, /`01` \*\*Artist 1\*\* · `100` listens/);
  assert.match(embed.description!, /`10` \*\*Artist 10\*\* · `91` listens/);
  assert.ok(!embed.description!.includes('Artist 11'));
  assert.match(embed.footer.text, /Last\.fm.*Past 3 months/);
  assert.match(embed.author.name, /^KARINA/);
  assert.equal(result.data.flags, 0);
});

void test('privacy copy accurately describes public conversation replies', () => {
  const result = commandReply('privacy', snapshot);
  assert.equal(result.data.flags, 64);
  assert.match(text(result), /server channels and group DMs/);
  assert.ok(
    !text(result).includes('These command replies are visible only to you'),
  );
});

void test('artistplays requires exactly one bounded artist string and no period or other user', () => {
  const valid = parseInteraction(
    interaction({
      data: {
        name: 'artistplays',
        type: 1,
        options: [{ name: 'artist', type: 3, value: '  aespa  ' }],
      },
    }),
  );
  assert.equal(valid?.kind, 'command');
  if (valid?.kind === 'command') {
    assert.equal(valid.artist, 'aespa');
    assert.equal(valid.actorId, ACTOR);
  }
  for (const value of ['', '   ', 'x'.repeat(101), 'line\nbreak', 42, null]) {
    assert.equal(
      parseInteraction(
        interaction({
          data: {
            name: 'artistplays',
            type: 1,
            options: [{ name: 'artist', type: 3, value }],
          },
        }),
      ),
      null,
    );
  }
  for (const options of [
    undefined,
    [],
    [{ name: 'period', type: 3, value: 'overall' }],
    [
      { name: 'artist', type: 3, value: 'aespa' },
      { name: 'user', type: 6, value: ACTOR },
    ],
  ]) {
    assert.equal(
      parseInteraction(
        interaction({ data: { name: 'artistplays', type: 1, options } }),
      ),
      null,
    );
  }
  assert.equal(
    parseInteraction(
      interaction({
        data: {
          name: 'stats',
          type: 1,
          options: [{ name: 'artist', type: 3, value: 'aespa' }],
        },
      }),
    ),
    null,
  );
});

void test('artistplays shows available all-history count and explicitly qualified first date', () => {
  const result = commandReply(
    { command: 'artistplays', period: '7day', artist: 'aespa' },
    snapshot,
  );
  assert.equal(result.data.flags, 0);
  assert.equal(result.data.embeds![0].title, 'aespa');
  assert.match(text(result), /Recorded listens: 120/);
  assert.match(text(result), /First recorded: 13 May 2024/);
  assert.match(text(result), /All available history/);
  assert.match(text(result), /may be later than your actual first listen/);
  const absent = commandReply(
    { command: 'artistplays', period: '7day', artist: 'Unknown artist' },
    { ...snapshot, artistPlays: undefined },
  );
  assert.equal(absent.data.flags, 0);
  assert.match(text(absent), /No recorded plays/);
});

void test('discoveries use selected first-recorded period while counts remain all-history', () => {
  const parsed = parseInteraction(
    interaction({
      data: {
        name: 'discoveries',
        type: 1,
        options: [{ name: 'period', type: 3, value: '1month' }],
      },
    }),
  );
  assert.equal(parsed?.kind, 'command');
  const result = commandReply(
    { command: 'discoveries', period: '1month' },
    snapshot,
  );
  assert.equal(result.data.flags, 0);
  assert.match(text(result), /First recorded 5 Sept? 2026/);
  assert.match(text(result), /`12` listens across your available history/);
  assert.match(text(result), /not necessarily your first-ever listen/);
  assert.match(result.data.embeds![0].footer.text, /Last\.fm.*Past month/);
  const large = Array.from({ length: 12 }, () => ({
    name: '*'.repeat(1000),
    count: 10,
    first: '2026-09-05T18:00:00Z',
  }));
  const largeResult = commandReply('discoveries', {
    ...snapshot,
    discoveries: large,
  });
  assertEmbedBounds(largeResult);
  assert.ok(!text(largeResult).includes('`11`'));
});
