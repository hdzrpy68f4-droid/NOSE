-- NOSE archive: one row for every real run of scripts/reparse.js.
--
-- save_scan writes a parse only when a reading changes, so a re-run that
-- changes nothing leaves nothing in nose.parses. This table is its record: a
-- run that checked every document and changed none of them still says so
-- here - which parser version, which day, how many documents, and what
-- happened to them. A --dry-run writes nothing, here or anywhere.
--
-- The same guarantees as the rest of schema nose:
--
--   1. APPEND-ONLY. nose_writer can SELECT and INSERT, nothing else.
--   2. NOTHING IDENTIFIES A PERSON. A mode, two versions, a day, a document id
--      and counts. No column can hold anything else.
--   3. IT CANNOT CONTRADICT ITSELF. The counts must add up to the documents
--      the run walked, and a plain reparse cannot claim an extractor, or the
--      row is refused.
--
-- A day, never a time, like every date in this schema. A run is started from
-- a Codespace rather than by a scan, but one rule is easier to keep than two.
--
-- Once applied, this file is immutable. Change the table in a new migration.

CREATE TABLE nose.reparse_runs (
  id                   bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_on               date    NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),

  -- 'reparse': the stored text of each document's newest extraction, parsed
  -- again. 'reextract': each PDF pulled from Netlify Blobs and extracted
  -- again first; the extractor that did it is recorded.
  mode                 text    NOT NULL CHECK (mode IN ('reparse', 'reextract')),
  -- A commit, never 'dev': the script refuses to write while parse-coa.js or
  -- extract-text.js has uncommitted changes, and this makes the database
  -- refuse too.
  parser_version       text    NOT NULL CHECK (parser_version ~ '^[0-9a-f]{7,40}$'),
  extractor_version    text             CHECK (extractor_version ~ '^[0-9a-f]{7,64}$'),

  -- What the run walked: documents 1..last_document_id as they stood. A
  -- document scanned after the run is not covered by it.
  documents            integer NOT NULL CHECK (documents >= 0),
  last_document_id     bigint  REFERENCES nose.documents (id),

  unchanged            integer NOT NULL CHECK (unchanged >= 0),
  values_changed       integer NOT NULL CHECK (values_changed >= 0),
  accepted_to_rejected integer NOT NULL CHECK (accepted_to_rejected >= 0),
  rejected_to_accepted integer NOT NULL CHECK (rejected_to_accepted >= 0),
  failed               integer NOT NULL CHECK (failed >= 0),

  -- Re-extract only: extractions written because the text changed, and
  -- documents with no PDF in Blobs, parsed from their stored text instead.
  new_texts            integer NOT NULL DEFAULT 0 CHECK (new_texts >= 0),
  no_pdf               integer NOT NULL DEFAULT 0 CHECK (no_pdf >= 0),

  CONSTRAINT every_document_counted_once CHECK (
    unchanged + values_changed + accepted_to_rejected + rejected_to_accepted + failed = documents),
  CONSTRAINT last_document_when_any CHECK ((documents = 0) = (last_document_id IS NULL)),
  CONSTRAINT extractor_only_when_reextracting CHECK ((mode = 'reextract') = (extractor_version IS NOT NULL)),
  CONSTRAINT texts_only_when_reextracting CHECK (mode = 'reextract' OR (new_texts = 0 AND no_pdf = 0)),
  CONSTRAINT texts_within_documents CHECK (new_texts + no_pdf <= documents)
);
COMMENT ON TABLE nose.reparse_runs IS
  'One row per real run of scripts/reparse.js, so a parser version that checked everything is on record even when it changed nothing.';

GRANT SELECT, INSERT ON nose.reparse_runs TO nose_writer;

-- As in the first migration: nothing for Supabase's API roles. Skipped where
-- they do not exist (PGlite, plain Postgres), effective on Supabase. The
-- identity sequence is included, so the grant audit in scripts/probe-db.js,
-- which reads every relation in the schema, finds nothing to report.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON TABLE nose.reparse_runs FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA nose FROM %I', r);
    END IF;
  END LOOP;
END
$$;
