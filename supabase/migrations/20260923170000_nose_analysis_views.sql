-- NOSE archive: the analysis layer's two views, read by scripts/drift.js and
-- scripts/lab-stats.js. Read-only: nothing here writes, and nose_writer gets
-- SELECT on both views and nothing else.
--
-- The same guarantees as the rest of schema nose:
--
--   1. APPEND-ONLY is untouched. Views over the three tables; no table, no
--      write path, no trigger.
--   2. NOTHING IDENTIFIES A PERSON. The views read only what the tables hold,
--      and they leave out even the document's address and its text: nothing
--      the analysis needs.
--   3. DERIVED VALUES CANNOT DISAGREE WITH THEIR SOURCE. Both views are
--      computed from the stored parses on every read; nothing is copied.
--
-- security_invoker, like terpene_values: a view reads with the privileges of
-- whoever queries it, never with its owner's.
--
-- Once applied, this file is immutable. Change a view in a new migration.

-- The strain key: one place that says when two printed strain names are the
-- same strain for the analysis. Lowercase, whitespace runs collapsed to one
-- space and trimmed, and a leading (I), (S) or (H) - the indica / sativa /
-- hybrid marker some labs put before the name, "(I) Banana Papaya" - dropped.
-- Nothing else: "GMO" and "GMO #2" stay different strains. NULL when nothing
-- is left. scripts/drift.js keys its argument with this same function, so the
-- rule exists once.
CREATE FUNCTION nose.strain_key(strain text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT NULLIF(
           lower(btrim(regexp_replace(
             regexp_replace(strain, '^\s*\((I|S|H)\)', '', 'i'),
             '\s+', ' ', 'g'))),
           '')
$$;
COMMENT ON FUNCTION nose.strain_key(text) IS
  'Analysis key for a printed strain name: lowercase, whitespace collapsed, a leading (I)/(S)/(H) marker dropped.';

-- One row per document: its most recent parse, meaning the latest parse of
-- its NEWEST extraction - the reading scripts/reparse.js and
-- scripts/review-queue.js stand by (scripts/lib/rerun.js, ROWS_SQL). The two
-- differ from "the highest parse id" only after an extractor revert, when an
-- older text is reused rather than stored again (PARSER-HANDOFF s13).
CREATE VIEW nose.latest_parses WITH (security_invoker = true) AS
SELECT d.id               AS document_id,
       d.sha256,
       d.first_fetched_on,
       e.id               AS extraction_id,
       p.id               AS parse_id,
       p.parser_version,
       p.context,
       p.parsed_on,
       p.lab,
       p.strain,
       p.batch,
       p.lab_id,
       p.client,
       p.product_class,
       p.read_by,
       p.usable,
       p.total_terpenes,
       p.moisture,
       p.water_activity,
       p.harvest_on,
       p.report_on,
       p.output
  FROM nose.documents AS d
  JOIN LATERAL (
        SELECT x.id
          FROM nose.extractions AS x
         WHERE x.document_id = d.id
         ORDER BY x.id DESC
         LIMIT 1) AS e ON true
  JOIN LATERAL (
        SELECT y.*
          FROM nose.parses AS y
         WHERE y.extraction_id = e.id
         ORDER BY y.id DESC
         LIMIT 1) AS p ON true;
COMMENT ON VIEW nose.latest_parses IS
  'One row per document: the latest parse of its newest extraction, as reparse.js and review-queue.js read it.';

-- One row per document whose latest reading is usable: the batch, and when it
-- was made. batch_date is the harvest day, else the report day, as ISO text -
-- NULL when the report prints neither in a form the parser can read without
-- guessing (lib/coa-dates.js). A NULL batch_date is an undated batch: the
-- scripts list those apart and never place them in a series.
CREATE VIEW nose.batch_series WITH (security_invoker = true) AS
SELECT lp.lab,
       lp.client,
       nose.strain_key(lp.strain)            AS strain_key,
       lp.batch,
       COALESCE(lp.harvest_on, lp.report_on) AS batch_date,
       lp.total_terpenes,
       lp.parse_id
  FROM nose.latest_parses AS lp
 WHERE lp.usable;
COMMENT ON VIEW nose.batch_series IS
  'Usable latest readings as a batch series: lab, client, strain key, batch, batch date (harvest, else report), total terpenes, parse id.';

-- Read-only for nose_writer. The first migration's default privileges would
-- also give it INSERT on any new relation here, so everything is revoked
-- first and SELECT alone granted back. (Neither view is updatable anyway;
-- the grant says so in its own right.)
REVOKE ALL ON nose.latest_parses, nose.batch_series FROM nose_writer;
GRANT SELECT ON nose.latest_parses, nose.batch_series TO nose_writer;

-- As in every nose function: PUBLIC executes nothing, and the invoker of
-- batch_series needs EXECUTE on the key it computes.
REVOKE ALL ON FUNCTION nose.strain_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nose.strain_key(text) TO nose_writer;

-- As in the earlier migrations: nothing for Supabase's API roles. Skipped
-- where they do not exist (PGlite, plain Postgres), effective on Supabase.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON nose.latest_parses, nose.batch_series FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION nose.strain_key(text) FROM %I', r);
    END IF;
  END LOOP;
END
$$;
