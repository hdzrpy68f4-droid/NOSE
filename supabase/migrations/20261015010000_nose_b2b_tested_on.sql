-- NOSE for dispensaries (B2B): the day the lab finished, beside a reading's
-- harvest and report days.
-- PARSER-HANDOFF s14, "The day the lab finished, in a store's readings",
-- 2026-10-14.
--
-- Since 2026-10-14 the parser reads testedOn - the day the lab finished, as
-- an ISO day or null, from one row per lab (PARSER-HANDOFF s7) - and the
-- archive and the card carry it. b2b.batch_reads kept only harvest_on and
-- report_on, so on the demo test store 15 of its 28 readings carried no date
-- at all: every Method, Modern Canna and ACT report, and the Kaycha and ACS
-- reports that print no harvest day.
--
-- One column and one check on b2b.batch_reads:
--
--   tested_on      The day the lab finished, as the parser read it from the
--                  report: an ISO day, NULL when the report gives none. Kept
--                  whatever the verdict, as harvest_on and report_on are. A
--                  day printed on the lab's own report, about the product -
--                  never about a shopper, and never a time of day.
--   tested_on_only_when_fetched
--                  A link that gave no report read nothing, so it holds no
--                  tested_on - as nothing_read_unless_fetched keeps the other
--                  two days off it. That constraint stays as pushed; this is
--                  a check of its own.
--
-- Additive: no existing column, constraint, trigger or grant changes, and
-- nothing in schema nose changes either. nose_b2b's table grants cover the
-- new column: a role may SELECT, INSERT or UPDATE a column if it holds that
-- privilege for the column or for its whole table (PostgreSQL 16
-- documentation, GRANT, Notes).
-- Adding a column with no DEFAULT rewrites nothing, and adding the CHECK scans
-- the table once to verify its rows (ALTER TABLE, Notes).
--
-- Once applied, this file is immutable. Change any of it in a new migration.

ALTER TABLE b2b.batch_reads
  ADD COLUMN tested_on date,
  ADD CONSTRAINT tested_on_only_when_fetched CHECK (fetched OR tested_on IS NULL);

COMMENT ON COLUMN b2b.batch_reads.tested_on IS
  'The day the lab finished, as the parser read it from the report, or NULL when the report gives none. About the product, never a person.';
