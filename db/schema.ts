import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const connections = sqliteTable(
  'connections',
  {
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    credentials: text('credentials'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider] }),
    uniqueIndex('connection_identity').on(t.provider, t.externalId),
  ],
);
export const oauthStates = sqliteTable('oauth_states', {
  hash: text('hash').primaryKey(),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  verifier: text('verifier').notNull(),
  expires: integer('expires').notNull(),
  used: integer('used').notNull().default(0),
});
export const listens = sqliteTable(
  'listens',
  {
    userId: text('user_id').notNull(),
    id: text('id').notNull(),
    source: text('source').notNull(),
    playedAt: text('played_at').notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    album: text('album').notNull(),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('listens_owner_source_date').on(t.userId, t.source, t.playedAt),
  ],
);
export const syncJobs = sqliteTable('sync_jobs', {
  userId: text('user_id').primaryKey(),
  page: integer('page').notNull().default(1),
  cutoff: integer('cutoff').notNull(),
  since: integer('since').notNull().default(0),
  latest: integer('latest').notNull().default(0),
  phase: text('phase').notNull().default('backfill'),
  nextRun: integer('next_run').notNull().default(0),
  lease: integer('lease').notNull().default(0),
  lastSuccess: integer('last_success'),
  error: text('error'),
});
export const systemState = sqliteTable('system_state', {
  key: text('key').primaryKey(),
  value: integer('value').notNull(),
});
export const interactions = sqliteTable('interactions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
});
export const archiveOwners = sqliteTable(
  'archive_owners',
  {
    userId: text('user_id').notNull(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source] })],
);
