// Last.fm's application-wide 100 MB allowance includes more than archive rows.
// Reserve 80 MB for UTF-8 archive data with 256 bytes of per-record overhead.
// Execute after inserts IN THE SAME D1 BATCH: the CHECK constraint rolls back
// the complete page when the allowance is exceeded. Scan once per page, never
// once per row, and derive from records so deletion and deduplication are exact.
export const LASTFM_BUDGET_CHECK = `
  INSERT INTO lastfm_archive_budget(id,bytes)
  SELECT 1,COALESCE(SUM(length(CAST(user_id || id || source || played_at || title || artist || album AS BLOB)) + 256),0)
  FROM listens WHERE source='lastfm'
  ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes
`;
