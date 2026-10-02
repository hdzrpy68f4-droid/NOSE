-- NOSE archive: one document per report, not per download.
--
-- A document was one row per distinct PDF, keyed by the SHA-256 of its bytes.
-- Method Testing Labs' portal builds its PDF at the moment of download, so
-- every fetch of one report brought new bytes and became a new document, with
-- its own extraction and parse (PARSER-HANDOFF s13, "One report, many
-- documents"). Verified on the real project, 2026-10-02: one jar scanned twice
-- a minute apart made two documents whose extracted text was identical.
--
-- From here, save_scan finds the document in this order:
--
--   1. the same bytes        that document, as before - reparse.js and
--                            backfill reach a document by its own fingerprint
--   2. the same text         a document already holding an extraction with
--                            this text: the first one stored. No new
--                            document row, and the extraction is reused, so a
--                            parse is written only if the reading differs
--   3. neither               a new document, as before
--
-- The text is the one the archive already fingerprints (text_hash of the text
-- as stored), compared whole: nothing is normalised. A report whose text
-- changes between downloads is still kept once per text.
--
-- The same guarantees as the rest of schema nose:
--
--   1. APPEND-ONLY. save_scan still only inserts; nose_writer's grants are
--      unchanged, and the new function and index give it nothing more.
--   2. NOTHING IDENTIFIES A PERSON. The person check runs first, unchanged.
--   3. DERIVED VALUES CANNOT DISAGREE. The text hash is the generated column's
--      own function; no caller supplies it.
--
-- Two views change with it (below): batch_series becomes one row per sample,
-- and nose.sample_key() is the one rule for "same sample".
--
-- Once applied, this file is immutable. Change save_scan in a new migration.

-- Finding a document by its text must not read the whole table.
CREATE INDEX extractions_text_sha256_idx ON nose.extractions (text_sha256);

COMMENT ON TABLE nose.documents IS
  'One row per distinct report: a PDF, keyed by the SHA-256 of its bytes, unless its extracted text is already held by an earlier document. Only the first address and day it was seen are kept.';

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

  -- 3. A new document. ON CONFLICT still guards the same new bytes arriving
  -- under a different text at the same moment (another extractor).
  IF v_document_id IS NULL THEN
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
  'The only write path. A document is found by its bytes, else by its text, else written; an extraction is reused on conflict; a parse is written only when it differs from the latest.';

-- CREATE OR REPLACE keeps the function's grants; said again so this file
-- stands on its own.
REVOKE ALL ON FUNCTION nose.save_scan(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nose.save_scan(jsonb) TO nose_writer;

-- The sample ------------------------------------------------------------------
--
-- One rule for "the same sample": the laboratory and its own sample number
-- (lab_id), where the parser read one - a report printed again, amended, or
-- downloaded twice is still one sample. Where no lab ID was read, each
-- document is its own sample. The lab name is length-prefixed so no pair of
-- names and IDs can run together into another's key.
CREATE FUNCTION nose.sample_key(lab text, lab_id text, document_id bigint) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT CASE
           WHEN NULLIF(btrim(lab_id), '') IS NOT NULL
             THEN 'lab ' || CASE WHEN lab IS NULL THEN '-' ELSE length(lab) || ':' || lab END || ' id ' || btrim(lab_id)
           ELSE 'document ' || document_id
         END
$$;
COMMENT ON FUNCTION nose.sample_key(text, text, bigint) IS
  'Analysis key for one sample: the lab and its lab ID where one was read, else the document.';

-- batch_series: one row per SAMPLE, not per document. The usable latest
-- readings of a sample's documents count once: the one shown is the newest
-- document's (an amended report is the lab's later word; copies read alike),
-- and `copies` says how many documents the sample is read from - 1 when it
-- was kept once. Columns are as before, with copies added at the end.
CREATE OR REPLACE VIEW nose.batch_series WITH (security_invoker = true) AS
SELECT s.lab,
       s.client,
       nose.strain_key(s.strain)           AS strain_key,
       s.batch,
       COALESCE(s.harvest_on, s.report_on) AS batch_date,
       s.total_terpenes,
       s.parse_id,
       s.copies
  FROM (SELECT lp.*,
               count(*) OVER w                                AS copies,
               row_number() OVER (w ORDER BY lp.document_id DESC) AS newest
          FROM nose.latest_parses AS lp
         WHERE lp.usable
        WINDOW w AS (PARTITION BY nose.sample_key(lp.lab, lp.lab_id, lp.document_id))) AS s
 WHERE s.newest = 1;
COMMENT ON VIEW nose.batch_series IS
  'One row per usable sample (lab and lab ID, else document): lab, client, strain key, batch, batch date (harvest, else report), total terpenes, parse id of the newest document, and how many documents hold it.';

-- Read-only for nose_writer, as in the analysis migration.
REVOKE ALL ON nose.batch_series FROM nose_writer;
GRANT SELECT ON nose.batch_series TO nose_writer;
REVOKE ALL ON FUNCTION nose.sample_key(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nose.sample_key(text, text, bigint) TO nose_writer;

-- As in every migration: nothing for Supabase's API roles. Skipped where they
-- do not exist (PGlite, plain Postgres), effective on Supabase.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON nose.batch_series FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION nose.sample_key(text, text, bigint) FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION nose.save_scan(jsonb) FROM %I', r);
    END IF;
  END LOOP;
END
$$;
