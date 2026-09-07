import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Real Worker fetch and D1 semantics, with synthetic Last.fm responses only.
const bundle = await build({
  stdin: {
    contents: `import { syncPage } from './lib/karina/sync.ts';
      import { archiveSignals } from './lib/karina/archive.ts';
      export default { async fetch(request) {
        try {
          const url = new URL(request.url);
          return Response.json(url.pathname === '/stats'
            ? await archiveSignals(url.searchParams.get('owner'), 'lastfm')
            : await syncPage('alice'));
        } catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      }};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  external: ['node:*', 'cloudflare:*'],
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'bridge',
        modules: true,
        compatibilityDate: '2026-09-07',
        compatibilityFlags: ['nodejs_compat'],
        script: bundle.outputFiles[0].text,
        d1Databases: { DB: 'synthetic-history' },
        bindings: {
          RESONANCE_ORIGIN: 'https://resonance.example',
          KARINA_TOKEN_KEY: '0'.repeat(64),
          LASTFM_ENABLED: 'true',
          LASTFM_API_KEY: 'synthetic-key',
          LASTFM_SHARED_SECRET: 'synthetic-secret',
        },
        outboundService: 'synthetic-lastfm',
      },
      {
        name: 'synthetic-lastfm',
        modules: true,
        compatibilityDate: '2026-09-07',
        script: `export default { async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== 'ws.audioscrobbler.com' || url.searchParams.get('method') !== 'user.getRecentTracks') return new Response(null, {status: 400});
    const page = Number(url.searchParams.get('page'));
    if (url.searchParams.has('from') && Number(url.searchParams.get('to')) < Math.floor(Date.now()/1000)-60)
      return new Response('Incremental cycle must include newly available history', {status:400});
    const track = page === 1 ? [
      {name:'正在播放',artist:{'#text':'Test artist'},album:{'#text':''},'@attr':{nowplaying:'true'}},
      {name:'星星',artist:{'#text':'Test artist'},album:{'#text':'Test album'},date:{uts:'1788739200'}},
    ] : [{name:'Earlier song',artist:{'#text':'Another artist'},album:{'#text':''},date:{uts:'1788652800'}}];
    const expanded=track.flatMap(t=>t.date?Array.from({length:200},(_,i)=>({...t,date:{uts:String(Number(t.date.uts)+i)}})):[t]);
    return Response.json({recenttracks: {track:expanded, '@attr': {page:String(page),totalPages:'2',total:'400'}}});
  }};`,
      },
    ],
  }),
);
try {
  const db = await mf.getD1Database('DB');
  for (const name of readdirSync('drizzle')
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync(`drizzle/${name}`, 'utf8')
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  }
  await db
    .prepare(
      "INSERT INTO connections VALUES ('alice','lastfm','listener','listener','encrypted',1)",
    )
    .run();
  const backfillCutoff = Math.floor(Date.now() / 1000) - 3600;
  await db
    .prepare("INSERT INTO sync_jobs(user_id,cutoff) VALUES ('alice',?)")
    .bind(backfillCutoff)
    .run();
  const sync = async () => {
    await db
      .prepare("UPDATE system_state SET value=0 WHERE key='rate:lastfm'")
      .run();
    await db.prepare('UPDATE sync_jobs SET next_run=0').run();
    const response = await mf.dispatchFetch('https://test.example/sync');
    return { status: response.status, ...(await response.json()) };
  };
  const first = await sync();
  assert.equal(first.status, 200);
  assert.equal(first.complete, false);
  assert.match(first.message, /Saved 200 new listens/);
  assert.equal(
    (await db.prepare('SELECT cutoff FROM sync_jobs').first()).cutoff,
    backfillCutoff,
  );
  const second = await sync();
  assert.equal(second.complete, true);
  assert.match(second.message, /Saved 200 new listens/);
  assert.equal(
    (await db.prepare('SELECT phase FROM sync_jobs').first()).phase,
    'incremental',
  );
  const stats = await (
    await mf.dispatchFetch('https://test.example/stats?owner=alice')
  ).json();
  assert.equal(stats.count, 400);
  assert.equal(stats.uniqueArtists, 2);
  assert.equal(stats.totalDurationMs, null);
  const other = await (
    await mf.dispatchFetch('https://test.example/stats?owner=bob')
  ).json();
  assert.equal(other.count, 0);
  await db.prepare('UPDATE sync_jobs SET cutoff=?').bind(backfillCutoff).run();
  const repeated = await sync();
  assert.match(repeated.message, /Saved 0 new listens/);
  assert.equal(
    (await db.prepare('SELECT count(*) n FROM listens').first()).n,
    400,
  );
  assert.ok(
    (
      await db
        .prepare('SELECT bytes AS value FROM lastfm_archive_budget WHERE id=1')
        .first()
    ).value > 0,
  );
  process.stdout.write(
    'Last.fm Worker backfill, incremental transition, exact counts, deduplication and account isolation passed.\n',
  );
} finally {
  await mf.dispose();
}
