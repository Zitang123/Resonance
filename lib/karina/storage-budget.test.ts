import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { LASTFM_BUDGET_CHECK } from './storage-budget.ts';

function setup(beforeBudget?: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../../drizzle/', import.meta.url))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if (name === '0003_lastfm_storage_budget.sql') beforeBudget?.(db);
    db.exec(
      readFileSync(
        new URL(`../../drizzle/${name}`, import.meta.url),
        'utf8',
      ).replace('80000000', '1000'),
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
  return db.prepare('SELECT bytes FROM lastfm_archive_budget WHERE id=1').get()
    ?.bytes;
}
function save(db: DatabaseSync, action: () => void) {
  db.exec('BEGIN');
  try {
    action();
    db.prepare(LASTFM_BUDGET_CHECK).run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
void test('archive budget counts UTF-8 bytes across accounts and deduplicates exactly', () => {
  const db = setup();
  try {
    save(db, () => {
      assert.equal(insert(db).length, 1);
    });
    const bytes = Buffer.byteLength(['alice', 'one', ...fields].join('')) + 256;
    assert.equal(usage(db), bytes);
    save(db, () => {
      assert.equal(insert(db).length, 0);
      insert(db, 'bob', 'two', 'listenbrainz');
    });
    assert.equal(usage(db), bytes);
    save(db, () => {
      insert(db, 'alice', 'two');
      insert(db, 'alice', 'three');
    });
    assert.throws(
      () =>
        save(db, () => {
          insert(db, 'bob', 'four');
        }),
      /lastfm_archive_limit/,
    );
    assert.equal(
      db.prepare("SELECT count(*) n FROM listens WHERE source='lastfm'").get()!
        .n,
      3,
    );
    save(db, () => {
      assert.equal(insert(db).length, 0);
    });
  } finally {
    db.close();
  }
});
void test('deleting history releases allowance for the next page and legacy rows are included', () => {
  const db = setup((legacy) => {
    insert(legacy);
  });
  try {
    save(db, () => {
      insert(db, 'alice', 'two');
      insert(db, 'alice', 'three');
    });
    db.exec("DELETE FROM listens WHERE id='one'");
    save(db, () => {
      insert(db, 'bob', 'four');
    });
    assert.equal(db.prepare('SELECT count(*) n FROM listens').get()!.n, 3);
    db.exec('DELETE FROM listens');
    save(db, () => {});
    assert.equal(usage(db), 0);
  } finally {
    db.close();
  }
});
void test('a rejected page rolls back all its records and preserves the last valid allowance', () => {
  const db = setup();
  try {
    save(db, () => {
      insert(db);
    });
    const before = usage(db);
    assert.throws(
      () =>
        save(db, () => {
          insert(db, 'alice', 'two');
          insert(db, 'alice', 'three');
          insert(db, 'bob', 'four');
        }),
      /lastfm_archive_limit/,
    );
    assert.equal(usage(db), before);
    assert.equal(db.prepare('SELECT count(*) n FROM listens').get()!.n, 1);
  } finally {
    db.close();
  }
});
