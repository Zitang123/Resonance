-- Last.fm API terms set a 100 MB application-wide data cap. Budget 80 MB for
-- normalized UTF-8 records, including 256 bytes per row of conservative overhead.
-- Initialize lazily so this migration remains schema-only and existing archives
-- are counted on their first mutation. Ordinary inserts are constant-time.
CREATE TRIGGER lastfm_budget_insert BEFORE INSERT ON listens
WHEN NEW.source = 'lastfm'
BEGIN
  INSERT INTO system_state(key,value)
  SELECT 'lastfm:archive_bytes', (SELECT COALESCE(SUM(
    length(CAST(user_id || id || source || played_at || title || artist || album AS BLOB)) + 256
  ),0) FROM listens WHERE source='lastfm')
  WHERE NOT EXISTS (SELECT 1 FROM system_state WHERE key='lastfm:archive_bytes');
  SELECT CASE WHEN
    NOT EXISTS (SELECT 1 FROM listens WHERE user_id=NEW.user_id AND id=NEW.id)
    AND (SELECT value FROM system_state WHERE key='lastfm:archive_bytes')
      + length(CAST(NEW.user_id || NEW.id || NEW.source || NEW.played_at || NEW.title || NEW.artist || NEW.album AS BLOB)) + 256 > 80000000
    THEN RAISE(ABORT, 'lastfm_archive_limit') END;
END;
--> statement-breakpoint
CREATE TRIGGER lastfm_budget_added AFTER INSERT ON listens
WHEN NEW.source = 'lastfm'
BEGIN
  UPDATE system_state SET value=value
    + length(CAST(NEW.user_id || NEW.id || NEW.source || NEW.played_at || NEW.title || NEW.artist || NEW.album AS BLOB)) + 256
  WHERE key='lastfm:archive_bytes';
END;
--> statement-breakpoint
CREATE TRIGGER lastfm_budget_delete BEFORE DELETE ON listens
WHEN OLD.source = 'lastfm'
BEGIN
  INSERT INTO system_state(key,value)
  SELECT 'lastfm:archive_bytes', (SELECT COALESCE(SUM(
    length(CAST(user_id || id || source || played_at || title || artist || album AS BLOB)) + 256
  ),0) FROM listens WHERE source='lastfm')
  WHERE NOT EXISTS (SELECT 1 FROM system_state WHERE key='lastfm:archive_bytes');
  UPDATE system_state SET value=value
    - length(CAST(OLD.user_id || OLD.id || OLD.source || OLD.played_at || OLD.title || OLD.artist || OLD.album AS BLOB)) - 256
  WHERE key='lastfm:archive_bytes';
END;
--> statement-breakpoint
-- Archive records are content-addressed and append-only. Corrections must delete
-- and reinsert a record so its hash, deduplication and byte accounting agree.
CREATE TRIGGER lastfm_records_immutable BEFORE UPDATE ON listens
WHEN OLD.source='lastfm' OR NEW.source='lastfm'
BEGIN
  SELECT RAISE(ABORT, 'lastfm_records_immutable');
END;
