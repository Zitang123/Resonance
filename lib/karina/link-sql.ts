/** A cancelable, one-use OAuth claim remains present until these writes commit atomically. */
export function linkStatements(input: {
  owner: string;
  provider: string;
  externalId: string;
  name: string;
  credentials: string | null;
  stateHash: string;
  now: number;
}) {
  const { owner, provider, externalId, name, credentials, stateHash, now } =
    input;
  const state =
    'EXISTS (SELECT 1 FROM oauth_states WHERE hash=? AND user_id=? AND provider=? AND used=1 AND expires>?)';
  const stateArgs = [stateHash, owner, provider, now];
  const identity =
    provider === 'lastfm'
      ? " AND NOT EXISTS (SELECT 1 FROM archive_owners WHERE user_id=? AND source='lastfm' AND external_id<>?) AND (NOT EXISTS (SELECT 1 FROM listens WHERE user_id=? AND source='lastfm') OR EXISTS (SELECT 1 FROM archive_owners WHERE user_id=? AND source='lastfm' AND external_id=?))"
      : '';
  const identityArgs =
    provider === 'lastfm' ? [owner, externalId, owner, owner, externalId] : [];
  const statements = [
    {
      sql: `INSERT INTO connections(user_id,provider,external_id,name,credentials,updated_at) SELECT ?,?,?,?,?,? WHERE ${state}${identity} ON CONFLICT(user_id,provider) DO UPDATE SET external_id=excluded.external_id,name=excluded.name,credentials=excluded.credentials,updated_at=excluded.updated_at`,
      params: [
        owner,
        provider,
        externalId,
        name,
        credentials,
        now,
        ...stateArgs,
        ...identityArgs,
      ],
    },
  ];
  const connected =
    'EXISTS (SELECT 1 FROM connections WHERE user_id=? AND provider=? AND updated_at=?)';
  if (provider === 'lastfm')
    statements.push(
      {
        sql: `INSERT INTO archive_owners(user_id,source,external_id) SELECT ?,'lastfm',? WHERE ${state} AND ${connected} ON CONFLICT(user_id,source) DO NOTHING`,
        params: [owner, externalId, ...stateArgs, owner, provider, now],
      },
      {
        sql: `INSERT INTO sync_jobs(user_id,cutoff) SELECT ?,? WHERE ${state} AND ${connected} ON CONFLICT(user_id) DO NOTHING`,
        params: [
          owner,
          Math.floor(now / 1000),
          ...stateArgs,
          owner,
          provider,
          now,
        ],
      },
    );
  statements.push({
    sql: 'DELETE FROM oauth_states WHERE hash=? AND user_id=?',
    params: [stateHash, owner],
  });
  return statements;
}
