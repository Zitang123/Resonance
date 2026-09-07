import { QUEUE_SYNC, DUE_JOB, CHECKPOINT_CONNECTION } from './sync-sql.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { linkStatements } from './link-sql.ts';
function setup() {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../../drizzle/', import.meta.url))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    db.exec(
      readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8'),
    );
  return db;
}
const input = {
  owner: 'alice',
  provider: 'lastfm',
  externalId: 'aespa-fan',
  name: 'aespa-fan',
  credentials: 'ciphertext',
  stateHash: 'state',
  now: 10000,
};

void test('Spotify identities stay unique across owners and cannot replace another user’s connection', () => {
  const db = setup();
  const link = (owner: string, externalId: string) => {
    db.prepare(
      "INSERT OR REPLACE INTO oauth_states(hash,user_id,provider,verifier,expires,used) VALUES (?,?,'spotify','encrypted',20000,1)",
    ).run(`state-${owner}`, owner);
    const statements = linkStatements({
      ...input,
      owner,
      provider: 'spotify',
      externalId,
      name: owner,
      stateHash: `state-${owner}`,
    });
    db.exec('BEGIN');
    try {
      for (const q of statements) db.prepare(q.sql).run(...q.params);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  try {
    link('alice', 'stable-alice');
    link('bob', 'stable-bob');
    assert.throws(() => link('bob', 'stable-alice'), /UNIQUE/);
    assert.equal(
      db
        .prepare("SELECT external_id FROM connections WHERE user_id='alice'")
        .get()!.external_id,
      'stable-alice',
    );
    assert.equal(
      db
        .prepare("SELECT external_id FROM connections WHERE user_id='bob'")
        .get()!.external_id,
      'stable-bob',
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_jobs').get()!.n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM listens').get()!.n, 0);
  } finally {
    db.close();
  }
});
function claim(db: DatabaseSync) {
  db.prepare(
    'INSERT INTO oauth_states(hash,user_id,provider,verifier,expires,used) VALUES (?,?,?,?,?,1)',
  ).run('state', 'alice', 'lastfm', 'encrypted', 20000);
}
function commit(db: DatabaseSync) {
  db.exec('BEGIN');
  try {
    const result = linkStatements(input).map((q) =>
      db.prepare(q.sql).run(...q.params),
    );
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
void test('one-use claim commits account, provenance and resumable job together', () => {
  const db = setup();
  try {
    claim(db);
    const results = commit(db);
    assert.equal(results[0].changes, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM connections').get()!.n, 1);
    assert.equal(
      db.prepare('SELECT external_id FROM archive_owners').get()!.external_id,
      'aespa-fan',
    );
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_jobs').get()!.n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM oauth_states').get()!.n, 0);
    assert.equal(commit(db)[0].changes, 0);
  } finally {
    db.close();
  }
});
void test('disconnect or deletion during provider exchange prevents all late writes', () => {
  const db = setup();
  try {
    claim(db);
    db.prepare('DELETE FROM oauth_states WHERE user_id=?').run('alice');
    assert.equal(commit(db)[0].changes, 0);
    for (const table of ['connections', 'archive_owners', 'sync_jobs'])
      assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n, 0);
  } finally {
    db.close();
  }
});
void test('retained Last.fm identity prevents mixing accounts after disconnect', () => {
  const db = setup();
  try {
    claim(db);
    db.prepare(
      "INSERT INTO archive_owners VALUES ('alice','lastfm','different-account')",
    ).run();
    assert.equal(commit(db)[0].changes, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM connections').get()!.n, 0);
  } finally {
    db.close();
  }
});
void test('unattributed Last.fm import must be cleared before linking a provider identity', () => {
  const db = setup();
  try {
    claim(db);
    db.prepare(
      "INSERT INTO listens VALUES ('alice','x','lastfm','2026-01-01T00:00:00.000Z','Song','Artist','',NULL)",
    ).run();
    assert.equal(commit(db)[0].changes, 0);
  } finally {
    db.close();
  }
});
void test('expired or wrong-user claim cannot create credentials', () => {
  for (const change of [
    'UPDATE oauth_states SET expires=0',
    "UPDATE oauth_states SET user_id='bob'",
    'UPDATE oauth_states SET used=0',
  ]) {
    const db = setup();
    try {
      claim(db);
      db.exec(change);
      assert.equal(commit(db)[0].changes, 0);
    } finally {
      db.close();
    }
  }
});

void test('queue cannot recreate a job after disconnect; orphan cannot starve a connected account', () => {
  const db = setup();
  try {
    assert.equal(db.prepare(QUEUE_SYNC).run('alice', 100, 'alice').changes, 0);
    db.exec(
      "INSERT INTO sync_jobs(user_id,cutoff) VALUES ('orphan',100);INSERT INTO connections VALUES ('bob','lastfm','bob','Bob','secret',1);INSERT INTO sync_jobs(user_id,cutoff,next_run) VALUES ('bob',100,1)",
    );
    assert.equal(db.prepare(DUE_JOB).get(100, 100)!.user_id, 'bob');
  } finally {
    db.close();
  }
});
void test('relinking while a page is fetching cannot advance its checkpoint', () => {
  const db = setup();
  try {
    db.exec(
      "INSERT INTO connections VALUES ('alice','lastfm','alice','Alice','secret',2);INSERT INTO sync_jobs(user_id,cutoff,page,lease) VALUES ('alice',100,10,45000)",
    );
    const update = db.prepare(
      'UPDATE sync_jobs SET page=page+1,lease=0 WHERE user_id=? AND lease=?' +
        CHECKPOINT_CONNECTION,
    );
    assert.equal(update.run('alice', 45000, 1).changes, 0);
    assert.equal(db.prepare('SELECT page FROM sync_jobs').get()!.page, 10);
    assert.equal(update.run('alice', 45000, 2).changes, 1);
  } finally {
    db.close();
  }
});
