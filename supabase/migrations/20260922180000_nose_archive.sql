-- NOSE archive: every lab report fetched, what was read from it, and every
-- distinct parse of that reading.
--
-- Three properties this file guarantees by construction, not by convention:
--
--   1. APPEND-ONLY for the application. nose_writer can SELECT and INSERT and
--      nothing else. It has no UPDATE, DELETE or TRUNCATE on anything here.
--
--   2. NOTHING IDENTIFIES A PERSON. No column can hold a person, and a CHECK on
--      parses.output refuses any key that would, at any depth of the document.
--
--   3. DERIVED VALUES CANNOT DISAGREE with their source. Every queryable parse
--      column, both hashes and the terpene view are computed by the database
--      from the stored output or text, never supplied by a caller.
--
-- Reached only from server code and Codespace scripts. Schema nose is not in
-- Supabase's exposed-schema list, and no Data API role is granted anything
-- here - see the REVOKE block at the end.
--
-- No RLS. RLS with no policies denies every non-owner role, which would block
-- nose_writer. Access is controlled by grants alone.
--
-- Timestamps are DATES, deliberately. Every date below is written at the
-- moment someone scans, and Netlify keeps request logs with IP addresses. A
-- time of day can be lined up against those logs; a date cannot, and a date
-- still supports tracking batches over time.
--
-- Once applied, this file is immutable. Never CREATE OR REPLACE text_hash or
-- output_hash: stored hashes would silently stop matching new ones. Add a new
-- function in a new migration instead.

DO $$
BEGIN
  IF pg_catalog.current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'nose: server_encoding is %, expected UTF8 - text_hash and output_hash depend on it',
      pg_catalog.current_setting('server_encoding');
  END IF;
END
$$;

CREATE SCHEMA nose;
COMMENT ON SCHEMA nose IS
  'NOSE lab-report archive. Append-only for nose_writer; holds nothing that identifies a person.';
REVOKE ALL ON SCHEMA nose FROM PUBLIC;

-- Helper functions ----------------------------------------------------------
--
-- convert_to() is STABLE in general because it depends on the server
-- encoding; that never changes for a database, and the block above proves it
-- is UTF8. Declaring these IMMUTABLE is therefore true, and it is what lets a
-- generated column use them.

CREATE FUNCTION nose.text_hash(t text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;

-- jsonb's text form is canonical for key order at every depth, so two outputs
-- that differ only in key order hash identically - no caller-side sorting to
-- get wrong. Version fields are excluded so a version bump alone is not a new
-- parse; the parser emits none today, and naming them costs nothing.
CREATE FUNCTION nose.output_hash(output jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to(
           (output - ARRAY['parserVersion', 'extractorVersion'])::text, 'UTF8')), 'hex')
$$;

-- Refuses any object key, at any depth, that names a person. Keep this list
-- identical to PERSONAL_KEYS in netlify/functions/lib/store.js; test/store-test.js
-- proves the database refuses every key the JavaScript list names.
CREATE FUNCTION nose.holds_no_person(doc jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM jsonb_path_query(doc, 'strict $.**') AS node
     CROSS JOIN LATERAL jsonb_object_keys(
             CASE WHEN jsonb_typeof(node) = 'object' THEN node END) AS k
     WHERE lower(k) = ANY (ARRAY[
             'userid', 'user_id', 'email', 'email_address', 'emailaddress',
             'ip', 'ipaddress', 'ip_address', 'deviceid', 'device_id',
             'useragent', 'user_agent', 'sessionid', 'session_id',
             'accountid', 'account_id', 'palate', 'phone'])
  )
$$;

-- Tables --------------------------------------------------------------------

CREATE TABLE nose.documents (
  id               bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256           text    NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size        integer NOT NULL CHECK (byte_size > 0),
  first_source_url text    CHECK (first_source_url ~ '^https://'),
  first_fetched_on date    NOT NULL
);
COMMENT ON TABLE nose.documents IS
  'One row per distinct PDF, keyed by the SHA-256 of its bytes. Only the first address and day it was seen are kept.';

CREATE TABLE nose.extractions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id       bigint NOT NULL REFERENCES nose.documents (id),
  extractor_version text   NOT NULL CHECK (extractor_version <> ''),
  text              text   NOT NULL,
  text_sha256       text   GENERATED ALWAYS AS (nose.text_hash(text)) STORED,
  created_on        date   NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  UNIQUE (document_id, text_sha256)
);
COMMENT ON TABLE nose.extractions IS
  'One row per distinct text extracted from a document. text_sha256 is computed by the database.';

-- No ON DELETE CASCADE anywhere: in an archive, deleting a document that has
-- extractions or parses must fail loudly, not quietly take them with it.
CREATE TABLE nose.parses (
  id             bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  extraction_id  bigint  NOT NULL REFERENCES nose.extractions (id),
  parser_version text    NOT NULL CHECK (parser_version <> ''),
  context        text    NOT NULL CHECK (context IN ('production', 'seed', 'reparse', 'backfill')),
  parsed_on      date    NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  output         jsonb   NOT NULL,
  output_hash    text    GENERATED ALWAYS AS (nose.output_hash(output)) STORED,

  -- Each column holds its value only when the output carries the expected
  -- JSON type, so a column is either right or NULL - never a mis-cast guess.
  lab            text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'lab')          = 'string'  THEN output ->> 'lab'          END) STORED,
  strain         text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'strain')       = 'string'  THEN output ->> 'strain'       END) STORED,
  batch          text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'batch')        = 'string'  THEN output ->> 'batch'        END) STORED,
  lab_id         text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'labId')        = 'string'  THEN output ->> 'labId'        END) STORED,
  client         text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'client')       = 'string'  THEN output ->> 'client'       END) STORED,
  product_class  text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'productClass') = 'string'  THEN output ->> 'productClass' END) STORED,
  read_by        text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'readBy')       = 'string'  THEN output ->> 'readBy'       END) STORED,
  usable         boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'usable')       = 'boolean' THEN (output ->> 'usable')::boolean         END) STORED,
  total_terpenes numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'totalTerpenes') = 'number' THEN (output ->> 'totalTerpenes')::numeric END) STORED,
  moisture       numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'moisture')      = 'number' THEN (output ->> 'moisture')::numeric      END) STORED,
  water_activity numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'waterActivity') = 'number' THEN (output ->> 'waterActivity')::numeric END) STORED,

  -- ISO dates only, so they sort correctly as text. These read harvestOn and
  -- reportOn, which the parser does not emit yet: its harvestDate is the lab's
  -- own format ("07/07/25"), which would sort wrong. NULL until a parser
  -- session adds the ISO fields - right or empty, never wrong.
  harvest_on     text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'harvestOn') = 'string'
                                                    AND output ->> 'harvestOn' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
                                                   THEN output ->> 'harvestOn' END) STORED,
  report_on      text    GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'reportOn') = 'string'
                                                    AND output ->> 'reportOn' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
                                                   THEN output ->> 'reportOn' END) STORED,

  CONSTRAINT output_is_object            CHECK (jsonb_typeof(output) = 'object'),
  CONSTRAINT output_identifies_no_person CHECK (nose.holds_no_person(output))
);
COMMENT ON TABLE nose.parses IS
  'One row per distinct parse of an extraction. A new row is written only when the output differs from the most recent one.';

CREATE INDEX parses_latest_idx ON nose.parses (extraction_id, id DESC);

-- One row per terpene per parse. security_invoker, so the view never reads
-- with more privilege than whoever is querying it.
CREATE VIEW nose.terpene_values WITH (security_invoker = true) AS
SELECT p.id AS parse_id,
       t.key,
       (t.value #>> '{}')::numeric AS value
  FROM nose.parses AS p
 CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(p.output -> 'terps') = 'object' THEN p.output -> 'terps' END) AS t (key, value)
 WHERE jsonb_typeof(t.value) = 'number';

-- The one write path --------------------------------------------------------

CREATE FUNCTION nose.save_scan(payload jsonb) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
  -- Pinned so a date written without a zone, and current_date, mean the UTC
  -- day whatever the connecting session's timezone. Without this a Tokyo
  -- session records "2026-09-22" as the 21st.
  SET timezone = 'UTC'
AS $$
DECLARE
  v_output        jsonb := payload -> 'output';
  v_document_id   bigint;
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
  ELSE
    v_doc_written := true;
  END IF;

  INSERT INTO nose.extractions (document_id, extractor_version, text)
  VALUES (v_document_id, payload ->> 'extractorVersion', payload ->> 'text')
  ON CONFLICT (document_id, text_sha256) DO NOTHING
  RETURNING id INTO v_extraction_id;

  IF v_extraction_id IS NULL THEN
    SELECT e.id INTO STRICT v_extraction_id
      FROM nose.extractions AS e
     WHERE e.document_id = v_document_id
       AND e.text_sha256 = nose.text_hash(payload ->> 'text');
  ELSE
    v_ext_written := true;
  END IF;

  -- One writer at a time per extraction, so "insert only if the most recent
  -- parse differs" stays true when two people scan the same jar at once.
  -- Transaction-scoped and released at commit, which the transaction pooler
  -- supports.
  PERFORM pg_advisory_xact_lock(hashtextextended('nose.save_scan', v_extraction_id));

  -- The MOST RECENT parse, not any earlier one: after A -> B -> A the latest
  -- must be A again. Ordered by id, which the lock above makes match insert
  -- order for this extraction.
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
    'extractionId',      v_extraction_id,
    'extractionWritten', v_ext_written,
    'parseId',           v_parse_id,
    'parseWritten',      v_parse_written);
END
$$;
COMMENT ON FUNCTION nose.save_scan(jsonb) IS
  'The only write path. Documents and extractions are reused on conflict; a parse is written only when it differs from the latest.';

-- The application role ------------------------------------------------------
--
-- No password here, ever. scripts/set-writer-password.js sets one through the
-- admin connection, sending only a SCRAM hash.

CREATE ROLE nose_writer LOGIN;
COMMENT ON ROLE nose_writer IS 'NOSE application writer: SELECT and INSERT on schema nose, nothing else.';

GRANT USAGE ON SCHEMA nose TO nose_writer;
GRANT SELECT, INSERT ON nose.documents, nose.extractions, nose.parses TO nose_writer;
GRANT SELECT ON nose.terpene_values TO nose_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA nose GRANT SELECT, INSERT ON TABLES TO nose_writer;

-- EXECUTE is needed on the helpers too, not only save_scan: Postgres checks
-- function privileges when a generated column or CHECK is evaluated, so
-- without these every insert fails with "permission denied for function".
-- Any future function the write path touches needs the same explicit grant.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nose FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nose.save_scan(jsonb), nose.text_hash(text),
                          nose.output_hash(jsonb), nose.holds_no_person(jsonb)
  TO nose_writer;

-- Belt and braces against Supabase's API roles. Skipped where they do not
-- exist (PGlite, plain Postgres), effective on Supabase.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA nose FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA nose FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nose FROM %I', r);
    END IF;
  END LOOP;
END
$$;
