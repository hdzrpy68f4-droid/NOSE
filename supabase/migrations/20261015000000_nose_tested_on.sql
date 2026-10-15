-- NOSE archive: the day the lab finished, so most reports can be placed in
-- time.
--
-- batch_series dated a sample by its harvest day, else its report day. On the
-- 56 accepted test reports only 20 carried either - Kaycha 16 of 22, ACS 3 of
-- 8, TerpLife 1 of 1, and none of Modern Canna's 13, Method's 9 or ACT's 3 -
-- though every one of those labs prints when it finished (PARSER-HANDOFF s13,
-- "When the lab finished"). The parser now reads that row as testedOn: an ISO
-- day or null, from one row per lab, chosen from what the labs print.
--
-- This migration:
--
--   1. adds parses.tested_on, computed from output -> 'testedOn' exactly as
--      harvest_on and report_on are computed from theirs: an ISO day, or NULL
--      - never a mis-cast guess. A stored reading fills it once it is read
--      again (scripts/reparse.js).
--   2. adds tested_on to latest_parses, at the end, so CREATE OR REPLACE
--      keeps the view, its grants, and batch_series built on it.
--   3. replaces batch_series: batch_date = COALESCE(harvest_on, tested_on,
--      report_on), and batch_date_from says which day it is - 'harvest',
--      'tested' or 'report', NULL for an undated batch. Added at the end, as
--      copies was.
--
-- The same guarantees as the rest of schema nose:
--
--   1. APPEND-ONLY is untouched. A generated column and two views; no write
--      path, no grant beyond what nose_writer held.
--   2. NOTHING ABOUT THE PERSON WHO SCANNED. tested_on is a day the lab
--      printed on its own report, read from text the archive already holds.
--   3. DERIVED VALUES CANNOT DISAGREE WITH THEIR SOURCE. tested_on is computed
--      by the database from the stored output; both views are computed on
--      every read.
--
-- Once applied, this file is immutable. Change a view in a new migration.

ALTER TABLE nose.parses
  ADD COLUMN tested_on text GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(output -> 'testedOn') = 'string'
                                                     AND output ->> 'testedOn' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
                                                    THEN output ->> 'testedOn' END) STORED;

-- As in 20260923170000_nose_analysis_views.sql, with tested_on added last.
CREATE OR REPLACE VIEW nose.latest_parses WITH (security_invoker = true) AS
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
       p.output,
       p.tested_on
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

-- As in 20261002180000_nose_one_document_per_text.sql - one row per sample,
-- the newest document's reading, copies - with the day the lab finished
-- between the harvest day and the report day, and batch_date_from added
-- last. A harvest day is the batch's own; the day the lab finished comes
-- after it; a report day is the last resort, read for labs and layouts that
-- print a report date and no finish row the parser knows.
CREATE OR REPLACE VIEW nose.batch_series WITH (security_invoker = true) AS
SELECT s.lab,
       s.client,
       nose.strain_key(s.strain)                       AS strain_key,
       s.batch,
       COALESCE(s.harvest_on, s.tested_on, s.report_on) AS batch_date,
       s.total_terpenes,
       s.parse_id,
       s.copies,
       CASE WHEN s.harvest_on IS NOT NULL THEN 'harvest'
            WHEN s.tested_on  IS NOT NULL THEN 'tested'
            WHEN s.report_on  IS NOT NULL THEN 'report'
       END                                             AS batch_date_from
  FROM (SELECT lp.*,
               count(*) OVER w                                AS copies,
               row_number() OVER (w ORDER BY lp.document_id DESC) AS newest
          FROM nose.latest_parses AS lp
         WHERE lp.usable
        WINDOW w AS (PARTITION BY nose.sample_key(lp.lab, lp.lab_id, lp.document_id))) AS s
 WHERE s.newest = 1;
COMMENT ON VIEW nose.batch_series IS
  'One row per usable sample (lab and lab ID, else document): lab, client, strain key, batch, batch date (harvest, else the day the lab finished, else report), total terpenes, parse id of the newest document, how many documents hold it, and which day the batch date is.';

-- Read-only for nose_writer, as in the analysis migration. CREATE OR REPLACE
-- keeps both views' grants; said again so this file stands on its own.
REVOKE ALL ON nose.latest_parses, nose.batch_series FROM nose_writer;
GRANT SELECT ON nose.latest_parses, nose.batch_series TO nose_writer;

-- As in every migration: nothing for Supabase's API roles. Skipped where they
-- do not exist (PGlite, plain Postgres), effective on Supabase.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON nose.latest_parses, nose.batch_series FROM %I', r);
    END IF;
  END LOOP;
END
$$;
