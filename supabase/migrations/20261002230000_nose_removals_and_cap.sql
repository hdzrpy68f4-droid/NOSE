-- NOSE archive: taking something back out, and a ceiling on what comes in.
--
-- Until now nothing could leave the archive except a duplicate copy
-- (scripts/remove-copies.js), and nothing limited how much a day's scans
-- could add. Three additions (PARSER-HANDOFF s13, "What gets kept, and
-- taking it back out"):
--
--   nose.removals   one row per removal made by hand with
--                   scripts/remove-document.js: the UTC day, and one word from
--                   a fixed list saying why. Nothing else, and nothing about
--                   who asked.
--   nose.withheld   the fingerprints a removal took out: the SHA-256 of the
--                   file, and of each text read from it. save_scan checks them
--                   before anything else, so the same file - or another
--                   download of the same report, whose bytes differ and whose
--                   text does not - is never kept again.
--   the daily cap   save_scan keeps at most nose.daily_document_cap() NEW
--                   documents from live scans per UTC day. Above it the scan
--                   still works and nothing is kept. One count for the whole
--                   site: there is no per-person key to count by, and none is
--                   wanted. A scan of a report already held is not new and is
--                   never capped; seed, reparse and backfill runs are not
--                   capped, but what they add today counts toward the cap.
--
-- And one change: nose.reparse_runs.last_document_id loses its foreign key.
-- It would refuse to remove any document a reparse run happened to walk
-- last, which is likely to be exactly the newest scan someone asks about. A
-- trigger keeps the half that mattered - a run cannot be recorded naming a
-- document that does not exist - and a run that walked a document since
-- removed keeps that number, as the record of what it walked.
--
-- The same guarantees as the rest of schema nose:
--
--   1. APPEND-ONLY for nose_writer. It may read nose.withheld, because
--      save_scan runs as the caller, and nothing more; nose.removals it cannot
--      see. Only the admin role deletes, through two scripts run by hand.
--   2. NOTHING IDENTIFIES A PERSON. A removal is a day and a word from a fixed
--      list - a CHECK, so not even a name fits; withheld holds fingerprints. No
--      column can hold who asked, or what their message said.
--   3. DERIVED VALUES CANNOT DISAGREE. The text fingerprint save_scan checks is
--      computed by nose.text_hash, the function behind the extractions'
--      generated column.
--
-- Once applied, this file is immutable. Change any of it in a new migration.

-- Removals -------------------------------------------------------------------

CREATE TABLE nose.removals (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  removed_on date   NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  -- request    someone asked for it to be taken out
  -- personal   it carries something about a person
  -- notreport  it is not a lab report, kept under the looser rule before
  --            two signs were required
  -- legal      a legal demand
  reason     text   NOT NULL CHECK (reason IN ('request', 'personal', 'notreport', 'legal'))
);
COMMENT ON TABLE nose.removals IS
  'One row per removal made by hand (scripts/remove-document.js): the UTC day and one word saying why. Nothing about who asked.';

CREATE TABLE nose.withheld (
  kind       text   NOT NULL CHECK (kind IN ('file', 'text')),
  sha256     text   NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  removal_id bigint NOT NULL REFERENCES nose.removals (id),
  PRIMARY KEY (kind, sha256)
);
COMMENT ON TABLE nose.withheld IS
  'Fingerprints a removal took out: a file''s SHA-256, or the SHA-256 of a text read from it. save_scan keeps nothing that matches one.';

-- The daily cap --------------------------------------------------------------

-- On 2026-10-02 the real archive held 8 documents from live scans, made over
-- 11 days (PARSER-HANDOFF s13). The cap is far above that and still bounds
-- what an open, anonymous endpoint can add in a day.
CREATE FUNCTION nose.daily_document_cap() RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT 100
$$;
COMMENT ON FUNCTION nose.daily_document_cap() IS
  'At most this many new documents from live scans per UTC day; above it save_scan keeps nothing. Change it in a new migration.';

-- Counting a day's documents must not read the whole table.
CREATE INDEX documents_first_fetched_on_idx ON nose.documents (first_fetched_on);

-- reparse_runs: a number, not a foreign key -----------------------------------

ALTER TABLE nose.reparse_runs DROP CONSTRAINT reparse_runs_last_document_id_fkey;

CREATE FUNCTION nose.reparse_run_document_exists() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.last_document_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM nose.documents AS d WHERE d.id = NEW.last_document_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'foreign_key_violation',
      MESSAGE = pg_catalog.format('reparse_runs: last document #%s is not in nose.documents - refused',
                                  NEW.last_document_id);
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION nose.reparse_run_document_exists() IS
  'A reparse run is recorded only naming a document that exists; once recorded, the number stays even if that document is later removed.';

CREATE TRIGGER reparse_runs_last_document_exists
  BEFORE INSERT ON nose.reparse_runs
  FOR EACH ROW EXECUTE FUNCTION nose.reparse_run_document_exists();

-- The one write path ----------------------------------------------------------
--
-- As 20261002180000_nose_one_document_per_text.sql, with two answers before
-- anything is written:
--
--   withheld   the file's fingerprint, or its text's, is in nose.withheld -
--              for every context; nothing is written
--   capped     a live scan ('production') would add a new document, and the
--              day already holds nose.daily_document_cap() of them; nothing
--              is written
--
-- Every other answer is exactly as before. lib/archive.js writes no PDF for
-- either: the PDF half obeys the database.

CREATE OR REPLACE FUNCTION nose.save_scan(payload jsonb) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
  SET timezone = 'UTC'
AS $$
DECLARE
  v_output        jsonb := payload -> 'output';
  v_text_hash     text;
  v_document_id   bigint;
  v_matched_by    text;
  v_extraction_id bigint;
  v_parse_id      bigint;
  v_latest_id     bigint;
  v_latest_hash   text;
  v_doc_written   boolean := false;
  v_ext_written   boolean := false;
  v_parse_written boolean := false;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'save_scan: payload must be a JSON object';
  END IF;
  IF v_output IS NULL THEN
    RAISE EXCEPTION 'save_scan: payload.output is required';
  END IF;
  -- Checked here as well as by the CHECK on parses, because a constraint
  -- violation echoes the whole failing row into the Postgres log - the very
  -- field being refused included. This message carries no data at all.
  IF NOT nose.holds_no_person(v_output) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'save_scan: output carries a field that identifies a person - refused, nothing stored';
  END IF;
  IF payload ->> 'text' IS NULL THEN
    RAISE EXCEPTION 'save_scan: payload.text is required';
  END IF;

  v_text_hash := nose.text_hash(payload ->> 'text');

  -- One writer at a time per TEXT, taken before either lookup, so two scans
  -- of one report that arrive together with different bytes cannot both find
  -- nothing and both insert a document. Transaction-scoped, as the per-
  -- extraction lock below; always taken first, so the two cannot deadlock.
  PERFORM pg_advisory_xact_lock(hashtextextended('nose.save_scan text ' || v_text_hash, 0));

  -- 0. Withheld: a removal took this file, or this text, out of the archive.
  -- Nothing is written, whoever asks; the answer says so and nothing more.
  IF EXISTS (SELECT 1
               FROM nose.withheld AS w
              WHERE (w.kind = 'file' AND w.sha256 = payload ->> 'sha256')
                 OR (w.kind = 'text' AND w.sha256 = v_text_hash)) THEN
    RETURN jsonb_build_object(
      'withheld',          true,
      'documentId',        NULL,
      'documentWritten',   false,
      'matchedBy',         NULL,
      'extractionId',      NULL,
      'extractionWritten', false,
      'parseId',           NULL,
      'parseWritten',      false);
  END IF;

  -- 1. The same bytes.
  SELECT d.id INTO v_document_id
    FROM nose.documents AS d
   WHERE d.sha256 = payload ->> 'sha256';
  IF v_document_id IS NOT NULL THEN
    v_matched_by := 'bytes';
  END IF;

  -- 2. The same text, on the first document that holds it.
  IF v_document_id IS NULL THEN
    SELECT e.document_id INTO v_document_id
      FROM nose.extractions AS e
     WHERE e.text_sha256 = v_text_hash
     ORDER BY e.document_id, e.id
     LIMIT 1;
    IF v_document_id IS NOT NULL THEN
      v_matched_by := 'text';
    END IF;
  END IF;

  -- 3. A new document - unless a live scan would take the day past its cap.
  -- One count at a time per day, so two scans at the cap's edge cannot both
  -- pass. Taken after the text lock and before the extraction lock, always,
  -- so no two transactions can wait on each other in a circle.
  IF v_document_id IS NULL THEN
    IF payload ->> 'context' = 'production' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('nose.save_scan day ' || current_date::text, 0));
      IF (SELECT count(*) FROM nose.documents AS d WHERE d.first_fetched_on = current_date)
           >= nose.daily_document_cap() THEN
        RETURN jsonb_build_object(
          'capped',            true,
          'documentId',        NULL,
          'documentWritten',   false,
          'matchedBy',         NULL,
          'extractionId',      NULL,
          'extractionWritten', false,
          'parseId',           NULL,
          'parseWritten',      false);
      END IF;
    END IF;

    -- ON CONFLICT still guards the same new bytes arriving under a different
    -- text at the same moment (another extractor).
    INSERT INTO nose.documents (sha256, byte_size, first_source_url, first_fetched_on)
    VALUES (payload ->> 'sha256',
            (payload ->> 'byteSize')::integer,
            payload ->> 'sourceUrl',
            COALESCE(((payload ->> 'fetchedAt')::timestamptz)::date, current_date))
    ON CONFLICT (sha256) DO NOTHING
    RETURNING id INTO v_document_id;

    IF v_document_id IS NULL THEN
      SELECT d.id INTO STRICT v_document_id
        FROM nose.documents AS d
       WHERE d.sha256 = payload ->> 'sha256';
      v_matched_by := 'bytes';
    ELSE
      v_doc_written := true;
      v_matched_by := 'new';
    END IF;
  END IF;

  INSERT INTO nose.extractions (document_id, extractor_version, text)
  VALUES (v_document_id, payload ->> 'extractorVersion', payload ->> 'text')
  ON CONFLICT (document_id, text_sha256) DO NOTHING
  RETURNING id INTO v_extraction_id;

  IF v_extraction_id IS NULL THEN
    SELECT e.id INTO STRICT v_extraction_id
      FROM nose.extractions AS e
     WHERE e.document_id = v_document_id
       AND e.text_sha256 = v_text_hash;
  ELSE
    v_ext_written := true;
  END IF;

  -- One writer at a time per extraction, so "insert only if the most recent
  -- parse differs" stays true when two people scan the same jar at once.
  PERFORM pg_advisory_xact_lock(hashtextextended('nose.save_scan', v_extraction_id));

  -- The MOST RECENT parse, not any earlier one: after A -> B -> A the latest
  -- must be A again.
  SELECT p.id, p.output_hash INTO v_latest_id, v_latest_hash
    FROM nose.parses AS p
   WHERE p.extraction_id = v_extraction_id
   ORDER BY p.id DESC
   LIMIT 1;

  IF v_latest_hash IS DISTINCT FROM nose.output_hash(v_output) THEN
    INSERT INTO nose.parses (extraction_id, parser_version, context, output)
    VALUES (v_extraction_id, payload ->> 'parserVersion', payload ->> 'context', v_output)
    RETURNING id INTO v_parse_id;
    v_parse_written := true;
  ELSE
    v_parse_id := v_latest_id;
  END IF;

  RETURN jsonb_build_object(
    'documentId',        v_document_id,
    'documentWritten',   v_doc_written,
    'matchedBy',         v_matched_by,
    'extractionId',      v_extraction_id,
    'extractionWritten', v_ext_written,
    'parseId',           v_parse_id,
    'parseWritten',      v_parse_written);
END
$$;
COMMENT ON FUNCTION nose.save_scan(jsonb) IS
  'The only write path. Withheld fingerprints and, for live scans, the daily cap on new documents are checked first; then a document is found by its bytes, else by its text, else written; a parse is written only when it differs from the latest.';

-- Grants ---------------------------------------------------------------------
--
-- The first migration's default privileges hand nose_writer SELECT and
-- INSERT on every new table here, so everything is revoked first and SELECT
-- on withheld alone granted back: save_scan reads it as the caller. The
-- removals table nose_writer cannot see at all.
REVOKE ALL ON nose.removals, nose.withheld FROM nose_writer;
GRANT SELECT ON nose.withheld TO nose_writer;

-- PUBLIC executes nothing in nose. save_scan calls the cap as its caller, so
-- nose_writer needs EXECUTE on it; a trigger function is not checked for
-- EXECUTE when it fires, so nobody is granted the trigger's.
REVOKE ALL ON FUNCTION nose.daily_document_cap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nose.daily_document_cap() TO nose_writer;
REVOKE ALL ON FUNCTION nose.reparse_run_document_exists() FROM PUBLIC;
-- CREATE OR REPLACE keeps save_scan's grants; said again so this file stands
-- on its own.
REVOKE ALL ON FUNCTION nose.save_scan(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nose.save_scan(jsonb) TO nose_writer;

-- As in every migration: nothing for Supabase's API roles. Skipped where they
-- do not exist (PGlite, plain Postgres), effective on Supabase. The identity
-- sequence of removals is included, so the grant audit in scripts/probe-db.js
-- finds nothing to report.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON nose.removals, nose.withheld FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA nose FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION nose.daily_document_cap(), nose.reparse_run_document_exists(), nose.save_scan(jsonb) FROM %I', r);
    END IF;
  END LOOP;
END
$$;
