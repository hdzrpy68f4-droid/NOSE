-- NOSE for dispensaries (B2B): what each batch's reading came from.
-- PARSER-HANDOFF s14, "Catalog upload and the batch reader", 2026-10-08.
--
-- Five columns on b2b.batch_reads, so that a reading is reported as it was
-- read, and is never taken for the reading of a link the batch no longer has:
--
--   read_url       The link this reading came from: the batch's coa_url as
--                  the catalog listed it on the day it was read. A reading is
--                  the batch's current one only while this is still the
--                  batch's own coa_url, so a link the store corrects is read
--                  again - never shown with the numbers of the report the old
--                  link served (Never fill a batch from another batch).
--   fetched        False when the link gave no report at all - refused before
--                  any request, unreachable, timed out, not a PDF. Then
--                  reject_reasons holds the fetcher's own words, one sentence,
--                  and nothing else is set. The reader tries such a link again
--                  on its next run: a fetch that failed read nothing.
--   report_batch,  The batch and the lab ID the report printed, as the parser
--   report_lab_id  read them (its output fields batch and labId), so the
--                  coverage report can flag a report that does not name the
--                  catalog's batch. Identifiers, never figures; NULL when the
--                  parser read none.
--   new_layout     True when the parser had not seen the report's layout
--                  before (its novelty notes were not empty), so the coverage
--                  report shows the line NOSE's card shows. The notes
--                  themselves are written for the review queue and are not
--                  kept here.
--
-- Additive: no existing column, constraint, trigger or grant changes, and
-- nose_b2b's table grants cover the new columns. Nothing here names a person,
-- a shopper, a purchase or an order, and no column holds a time of day.
-- Decided by the owner on 2026-10-08, when the coverage report read from the
-- database had to match the report read from the CSV.
--
-- Once applied, this file is immutable. Change any of it in a new migration.

ALTER TABLE b2b.batch_reads
  ADD COLUMN read_url      text    CHECK (read_url ~ '^https://[^[:space:]#]+$' AND length(read_url) <= 2048),
  ADD COLUMN fetched       boolean NOT NULL DEFAULT true,
  ADD COLUMN report_batch  text    CHECK (report_batch = btrim(report_batch) AND length(report_batch) BETWEEN 1 AND 200
                                          AND report_batch !~ '[[:cntrl:]]'),
  ADD COLUMN report_lab_id text    CHECK (report_lab_id = btrim(report_lab_id) AND length(report_lab_id) BETWEEN 1 AND 200
                                          AND report_lab_id !~ '[[:cntrl:]]'),
  ADD COLUMN new_layout    boolean NOT NULL DEFAULT false,
  -- A link that gave no report read nothing: the fetcher's one sentence, the
  -- link it was, and no lab, form, reader, day, identifier, note or figure.
  -- (values_only_when_usable already keeps every figure off a refusal.)
  ADD CONSTRAINT nothing_read_unless_fetched CHECK (
    fetched
    OR (read_url IS NOT NULL AND NOT usable AND cardinality(reject_reasons) = 1
        AND lab IS NULL AND product_class IS NULL AND read_by IS NULL
        AND harvest_on IS NULL AND report_on IS NULL
        AND report_batch IS NULL AND report_lab_id IS NULL
        AND NOT new_layout AND cardinality(warnings) = 0));

COMMENT ON COLUMN b2b.batch_reads.read_url IS
  'The link this reading came from, without its "#" part. Current only while it is still the batch''s coa_url.';
COMMENT ON COLUMN b2b.batch_reads.fetched IS
  'False when the link gave no report: reject_reasons then holds the fetcher''s words, and the link is tried again.';
COMMENT ON COLUMN b2b.batch_reads.report_batch IS
  'The batch the report printed, as the parser read it. An identifier, never a figure.';
COMMENT ON COLUMN b2b.batch_reads.report_lab_id IS
  'The lab ID the report printed, as the parser read it. An identifier, never a figure.';
COMMENT ON COLUMN b2b.batch_reads.new_layout IS
  'True when the parser had not seen this report''s layout before (its novelty notes were not empty).';
COMMENT ON TABLE b2b.batch_reads IS
  'NOSE''s one current reading of each listed batch''s lab report: what the parser read, terpene values only when the read was accepted - or, when the link gave no report, the fetcher''s words - and the link it came from.';
