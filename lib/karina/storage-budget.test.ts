import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

function setup(beforeBudget?: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../../drizzle/', import.meta.url))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if (name === '0003_lastfm_storage_budget.sql') beforeBudget?.(db);
    db.exec(
      readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8'),
    );
  }
  return db;
}
const fields = ['lastfm', '2026-01-01T00:00:00.000Z', '星星', 'aespa', 'Album'];
function insert(
  db: DatabaseSync,
  owner = 'alice',
  id = 'one',
  source = 'lastfm',
) {
  return db
    .prepare(
      'INSERT OR IGNORE INTO listens VALUES (?,?,?,?,?,?,?,NULL) RETURNING id',
    )
    .all(owner, id, source, ...fields.slice(1));
}
function usage(db: DatabaseSync) {
  return db
    .prepare("SELECT value FROM system_state WHERE key='lastfm:archive_bytes'")
    .get()?.value;
}

void test('archive budget counts UTF-8 bytes across accounts, deduplicates and frees deleted records', () => {
  const db = setup();
  try {
    assert.equal(insert(db).length, 1);
    const bytes = Buffer.byteLength(['alice', 'one', ...fields].join('')) + 256;
    assert.equal(usage(db), bytes);
    assert.equal(insert(db).length, 0);
    assert.equal(usage(db), bytes);
    insert(db, 'bob', 'two', 'listenbrainz');
    assert.equal(usage(db), bytes);
    insert(db, 'alice', 'two');
    db.prepare("DELETE FROM listens WHERE source='lastfm'").run();
    assert.equal(usage(db), 0);
  } finally {
    db.close();
  }
});

void test('global budget rejects new records without rejecting duplicates or deleting saved data', () => {
  const db = setup();
  try {
    insert(db);
    db.exec(
      "UPDATE system_state SET value=80000000 WHERE key='lastfm:archive_bytes'",
    );
    assert.equal(insert(db).length, 0);
    assert.throws(() => insert(db, 'bob'), /lastfm_archive_limit/);
    assert.equal(db.prepare('SELECT count(*) n FROM listens').get()!.n, 1);
    assert.equal(usage(db), 80000000);
    assert.throws(
      () => db.exec("UPDATE listens SET title='changed'"),
      /lastfm_records_immutable/,
    );
  } finally {
    db.close();
  }
});

void test('existing records are included even when the first mutation is deletion', () => {
  for (const firstMutation of ['insert', 'delete']) {
    const db = setup((legacy) => {
      insert(legacy);
    });
    try {
      assert.equal(usage(db), undefined);
      if (firstMutation === 'insert') {
        insert(db, 'alice', 'two');
        const bytes =
          Buffer.byteLength(['alice', 'one', ...fields].join('')) + 256;
        assert.equal(usage(db), bytes * 2);
      } else {
        db.exec('DELETE FROM listens');
        assert.equal(usage(db), 0);
      }
    } finally {
      db.close();
    }
  }
});

void test('a failed page transaction rolls back both listens and accounting', () => {
  const db = setup();
  try {
    insert(db);
    db.exec(
      "UPDATE system_state SET value=79999600 WHERE key='lastfm:archive_bytes'",
    );
    db.exec('BEGIN');
    insert(db, 'alice', 'two');
    assert.throws(() => insert(db, 'alice', 'three'), /lastfm_archive_limit/);
    db.exec('ROLLBACK');
    assert.equal(usage(db), 79999600);
    assert.equal(db.prepare('SELECT count(*) n FROM listens').get()!.n, 1);
  } finally {
    db.close();
  }
});
