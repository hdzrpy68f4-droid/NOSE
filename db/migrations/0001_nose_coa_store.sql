-- NOSE 0001 — COA document + parse store.
--
-- Scope: lab documents and what the parser read off them. NOTHING HERE
-- IDENTIFIES A PERSON — no user id, no IP, no device, no palate, no session.
-- If a future migration needs one of those, it does not belong in these tables.
--
-- Numerics are `numeric`, never float: the parser reconciles sums against the
-- total a lab printed, and float arithmetic does not sum exactly
-- (0.1 + 0.2 = 0.3 is false in float8, true in numeric).
--
-- Dates printed by labs (harvest_date, report_date) stay `text`. Labs use
-- several formats and some print none at all; coercing to `date` would make
-- the store assert a reading the parser never made.

CREATE TABLE documents (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256            text        NOT NULL UNIQUE,
  source_url        text,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  byte_size         integer,
  extracted_text    text,
  extractor_version text
);
-- No separate index on sha256: the UNIQUE constraint above already creates
-- one, and it is the index the sha256 lookup uses. A second would be dead
-- weight on every insert.

CREATE TABLE parses (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id    bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  parser_version text,
  parsed_at      timestamptz NOT NULL DEFAULT now(),
  usable         boolean,
  product_class  text,
  lab            text,
  strain         text,
  batch          text,
  lab_id         text,
  harvest_date   text,
  report_date    text,   -- parser does not emit this yet; stays NULL
  client         text,   -- licensee named on the COA (a business), not an app user
  total_terpenes numeric,
  moisture       numeric,
  water_activity numeric,
  read_by        text,
  reject_reasons jsonb,
  warnings       jsonb,
  output         jsonb
);

CREATE TABLE terpene_values (
  parse_id bigint  NOT NULL REFERENCES parses(id) ON DELETE CASCADE,
  key      text    NOT NULL,
  value    numeric NOT NULL,
  PRIMARY KEY (parse_id, key)
);

CREATE INDEX parses_document_parsed_at_idx ON parses (document_id, parsed_at DESC);
CREATE INDEX terpene_values_key_idx        ON terpene_values (key);

-- Supabase serves every table in `public` over its Data API. With no policies
-- defined, RLS on means the anon key reads nothing. The role in NOSE_DB_URL
-- bypasses RLS, so the functions still read and write normally.
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE parses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE terpene_values ENABLE ROW LEVEL SECURITY;
