-- NOSE for dispensaries (B2B): the stores that license NOSE, their keys, the
-- batches each store has listed, and NOSE's one current reading of each
-- batch's lab report. PARSER-HANDOFF s14, "Dispensary integration".
--
-- Apart from the lab-report archive in every way a database can keep two
-- things apart:
--
--   1. ITS OWN SCHEMA AND ROLE. Schema b2b, never public; role nose_b2b,
--      which holds nothing in schema nose, as nose_writer holds nothing here.
--      No view, function or key joins the two schemas, and a catalog's lab
--      reports never enter the archive (Prompt 3).
--
--   2. NOTHING ABOUT A PERSON. No column is for a shopper, a purchase or an
--      order: a shopper's purchase history never reaches NOSE - the
--      dispensary's page hands it to the shopper's own browser, which builds
--      the palate there. b2b.holds_no_person() - the archive's own rule, the
--      same keys, the same body - is a CHECK on every jsonb column, and a
--      trigger runs the same check on every row first, so a refusal carries no
--      data: a CHECK violation echoes the whole failing row into the Postgres
--      log, the refused field included. Dates are UTC days, never times.
--
--   3. NO DELETE FOR THE APPLICATION. nose_b2b can read the stores and their
--      keys and nothing more there; it can read, add and update batches and
--      their readings; it can delete or truncate nothing. Stores and keys are
--      made, rotated, revoked and deleted only by scripts/b2b-store.js, run
--      by hand from the Codespace as the admin.
--
-- A key is never stored, only its SHA-256: the key itself is printed once by
-- the script that makes it, and the database never sees it - not in a row,
-- not in a statement.
--
-- Reached only through pg, from server code and Codespace scripts. Supabase
-- exposes only the public schema to its Data API unless a schema is added to
-- "Exposed schemas" (docs: Using Custom Schemas); b2b must never be added,
-- and scripts/probe-db.js checks the Data API refuses it. No RLS: access is
-- by grants alone, as in schema nose.
--
-- Once applied, this file is immutable. Change any of it in a new migration.

CREATE SCHEMA b2b;
COMMENT ON SCHEMA b2b IS
  'NOSE for dispensaries: stores, their keys (hashes only), listed batches and one reading per batch. Holds no column for a shopper, a purchase or an order.';
REVOKE ALL ON SCHEMA b2b FROM PUBLIC;

-- Helper functions ------------------------------------------------------------

-- The archive's rule, in this schema, so that nose_b2b needs nothing in schema
-- nose (a CHECK runs its function with the writer's privileges). Keep the key
-- list, and the whole body, identical to nose.holds_no_person() and to
-- PERSONAL_KEYS in netlify/functions/lib/store.js: test/b2b-store-test.js
-- fails if the three lists differ by one key, or the two bodies by one byte.
CREATE FUNCTION b2b.holds_no_person(doc jsonb) RETURNS boolean
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
COMMENT ON FUNCTION b2b.holds_no_person(jsonb) IS
  'True when no object key, at any depth, names a person. Identical to nose.holds_no_person().';

-- The terpenes of one reading, as the parser read them: an object whose keys
-- are terpene keys (lowercase letters, digits, "_" and "-", as the parser
-- names them: limonene, pinene_a) and whose values are numbers, none
-- negative. Below-LOQ is 0, never the printed limit (PARSER-HANDOFF s4), so a
-- number is all a value can be. Nothing here can hold a sentence or a name.
CREATE FUNCTION b2b.terps_ok(terps jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT CASE WHEN jsonb_typeof(terps) <> 'object' THEN false
              ELSE (SELECT count(*) FROM jsonb_object_keys(terps)) BETWEEN 1 AND 100
                   AND NOT EXISTS (
                         SELECT 1
                           FROM jsonb_each(terps) AS e (k, v)
                          WHERE e.k !~ '^[a-z][a-z0-9_-]{0,39}$'
                             -- CASE, so the cast runs on numbers alone: SQL
                             -- does not promise the order an OR is read in.
                             OR CASE WHEN jsonb_typeof(e.v) = 'number' THEN (e.v #>> '{}')::numeric < 0
                                     ELSE true END)
         END
$$;
COMMENT ON FUNCTION b2b.terps_ok(jsonb) IS
  'True for an object of terpene keys and non-negative numbers, 1 to 100 of them.';

-- Where a store's page may load the widget from: https origins only - the
-- scheme, a lowercase host and an optional port, as a browser sends an Origin
-- header. No path, no query, no duplicates, at most 20.
CREATE FUNCTION b2b.https_origins(origins text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT cardinality(origins) <= 20
     AND coalesce(array_ndims(origins), 1) = 1
     AND array_position(origins, NULL) IS NULL
     AND (SELECT count(DISTINCT o) FROM unnest(origins) AS o) = cardinality(origins)
     AND NOT EXISTS (
           SELECT 1
             FROM unnest(origins) AS o
            WHERE length(o) > 270
               OR o !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$')
$$;
COMMENT ON FUNCTION b2b.https_origins(text[]) IS
  'True when every element is a distinct https origin (scheme, lowercase host, optional port), at most 20.';

-- Run first on every row written to this schema: the whole row as JSON - its
-- column names and every jsonb value inside it - through holds_no_person. A
-- refusal says nothing about the row, unlike the CHECK it runs ahead of.
-- Fired as a trigger, so nobody needs EXECUTE on it; the check it calls runs
-- with the writer's own privileges, which is why nose_b2b holds EXECUTE on
-- holds_no_person below.
CREATE FUNCTION b2b.refuse_personal_fields() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NOT b2b.holds_no_person(to_jsonb(NEW)) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'b2b: a field that identifies a person - refused, nothing written';
  END IF;
  RETURN NEW;
END
$$;
COMMENT ON FUNCTION b2b.refuse_personal_fields() IS
  'Trigger: refuses, with a message carrying no data, any row whose fields name a person at any depth.';

-- Tables ----------------------------------------------------------------------
--
-- Text a dispensary sends is bounded and holds no control characters; a NULL
-- is "not given", never an empty string standing in for one.

CREATE TABLE b2b.stores (
  id                   bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Names the store to the admin script and in storage paths (a vote's
  -- Blobs key, Prompt 4): lowercase letters, digits and single hyphens.
  slug                 text    NOT NULL UNIQUE
                               CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 40),
  display_name         text    NOT NULL
                               CHECK (display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 100
                                      AND display_name !~ '[[:cntrl:]]'),
  allowed_origins      text[]  NOT NULL DEFAULT '{}' CHECK (b2b.https_origins(allowed_origins)),
  -- How far back a listed batch stays in the store's feed, so that a
  -- shopper's past purchases - usually sold out - are still found in it.
  window_months        integer NOT NULL DEFAULT 12 CHECK (window_months BETWEEN 1 AND 36),
  -- The guardrail (Prompt 5): when set, the ranked list keeps only batches
  -- whose THC (or CBD) percent is within this many percentage points of the
  -- median of the shopper's basis batches. It filters, never reorders. NULL:
  -- not applied to that cannabinoid.
  guardrail_thc_points numeric CHECK (guardrail_thc_points > 0 AND guardrail_thc_points <= 100),
  guardrail_cbd_points numeric CHECK (guardrail_cbd_points > 0 AND guardrail_cbd_points <= 100),
  created_on           date    NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date)
);
COMMENT ON TABLE b2b.stores IS
  'One row per licensed dispensary store: its slug, display name, the https origins its page may load the widget from, its feed window and guardrail.';

CREATE TABLE b2b.store_keys (
  store_id   bigint NOT NULL REFERENCES b2b.stores (id),
  -- secret (nsk_...): the store's server, uploading its catalog. public
  -- (npk_...): named in the store's page, it fetches the feed; not a secret.
  kind       text   NOT NULL CHECK (kind IN ('secret', 'public')),
  -- The SHA-256, as hex, of the whole key as written, prefix included. The
  -- key itself is nowhere in this database.
  key_sha256 text   PRIMARY KEY CHECK (key_sha256 ~ '^[0-9a-f]{64}$'),
  created_on date   NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  revoked_on date,
  CONSTRAINT revoked_after_made CHECK (revoked_on >= created_on)
);
COMMENT ON TABLE b2b.store_keys IS
  'A store''s keys, as SHA-256 hashes only: secret ones for uploads, public ones for the feed. A key works until the day it is revoked.';

-- At most one key of each kind works for a store at a time: rotating revokes
-- the old one in the same transaction as it adds the new.
CREATE UNIQUE INDEX store_keys_one_current_idx ON b2b.store_keys (store_id, kind) WHERE revoked_on IS NULL;

CREATE TABLE b2b.batches (
  store_id        bigint  NOT NULL REFERENCES b2b.stores (id),
  -- The catalog's own identifiers (docs/B2B-CATALOG-FORMAT.md), as given.
  batch_id        text    NOT NULL CHECK (batch_id = btrim(batch_id) AND length(batch_id) BETWEEN 1 AND 200
                                          AND batch_id !~ '[[:cntrl:]]'),
  product_id      text    NOT NULL CHECK (product_id = btrim(product_id) AND length(product_id) BETWEEN 1 AND 200
                                          AND product_id !~ '[[:cntrl:]]'),
  -- Where the batch came in the store's last upload that listed it; the feed
  -- keeps ties in this order.
  list_position   integer NOT NULL CHECK (list_position >= 0),
  category        text    NOT NULL CHECK (category IN ('flower', 'pre-roll', 'vape', 'concentrate')),
  route           text    NOT NULL CHECK (route IN ('smoking', 'inhalation')),
  name            text    NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 300 AND name !~ '[[:cntrl:]]'),
  brand           text             CHECK (brand = btrim(brand) AND length(brand) BETWEEN 1 AND 300 AND brand !~ '[[:cntrl:]]'),
  -- The batch's lab report, as the catalog links it, without its "#" part:
  -- a fragment is never sent to a server. The query stays, because real
  -- links name the report there (Kaycha's viewer ?sample=, Method's portal
  -- ?search=). A catalog link is the store's product data, the same for
  -- every shopper - unlike a link someone scanned, which is why the archive
  -- keeps origin and path only. Decided 2026-10-07 (PARSER-HANDOFF s14).
  coa_url         text             CHECK (coa_url ~ '^https://[^[:space:]#]+$' AND length(coa_url) <= 2048),
  product_url     text             CHECK (product_url ~ '^https://[^[:space:]]+$' AND length(product_url) <= 2048),
  in_stock        boolean NOT NULL,
  thc_percent     numeric          CHECK (thc_percent >= 0 AND thc_percent <= 100),
  cbd_percent     numeric          CHECK (cbd_percent >= 0 AND cbd_percent <= 100),
  first_listed_on date    NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  last_listed_on  date    NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  PRIMARY KEY (store_id, batch_id),
  CONSTRAINT listed_in_order CHECK (last_listed_on >= first_listed_on)
);
COMMENT ON TABLE b2b.batches IS
  'One row per batch a store has listed, kept after it sells out, so a shopper''s past purchases stay findable in the feed. No sales, no quantities, no shopper.';

CREATE TABLE b2b.batch_reads (
  store_id        bigint  NOT NULL,
  batch_id        text    NOT NULL,
  read_on         date    NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  -- What the parser said, and nothing it did not: lab, form and reader are
  -- its own words; a refusal keeps its reasons and no figure at all.
  lab             text             CHECK (length(lab) BETWEEN 1 AND 100 AND lab !~ '[[:cntrl:]]'),
  product_class   text             CHECK (product_class ~ '^[a-z][a-z-]{0,39}$'),
  usable          boolean NOT NULL,
  reject_reasons  text[]  NOT NULL DEFAULT '{}'
                          CHECK (coalesce(array_ndims(reject_reasons), 1) = 1 AND array_position(reject_reasons, NULL) IS NULL
                                 AND cardinality(reject_reasons) <= 20),
  terps           jsonb            CONSTRAINT terps_are_terpenes CHECK (b2b.terps_ok(terps))
                                   CONSTRAINT terps_hold_no_person CHECK (b2b.holds_no_person(terps)),
  total_terpenes  numeric          CHECK (total_terpenes >= 0 AND total_terpenes <= 100),
  moisture        numeric          CHECK (moisture >= 0 AND moisture <= 100),
  water_activity  numeric          CHECK (water_activity >= 0 AND water_activity <= 1),
  harvest_on      date,
  report_on       date,
  read_by         text             CHECK (read_by ~ '^[a-z]{1,20}$'),
  warnings        text[]  NOT NULL DEFAULT '{}'
                          CHECK (coalesce(array_ndims(warnings), 1) = 1 AND array_position(warnings, NULL) IS NULL
                                 AND cardinality(warnings) <= 20),
  PRIMARY KEY (store_id, batch_id),
  FOREIGN KEY (store_id, batch_id) REFERENCES b2b.batches (store_id, batch_id),
  -- Values only for an accepted read: a usable read carries its terpenes and
  -- the total the lab printed; a refused one carries neither, nor any other
  -- figure. Never a guess, never another batch's numbers.
  CONSTRAINT values_only_when_usable CHECK (
    (terps IS NOT NULL) = usable
    AND (total_terpenes IS NOT NULL) = usable
    AND (usable OR (moisture IS NULL AND water_activity IS NULL)))
);
COMMENT ON TABLE b2b.batch_reads IS
  'NOSE''s one current reading of each listed batch''s lab report: what the parser read, terpene values only when the read was accepted.';

-- Every row written here is checked for a person first.
CREATE TRIGGER stores_refuse_personal_fields BEFORE INSERT OR UPDATE ON b2b.stores
  FOR EACH ROW EXECUTE FUNCTION b2b.refuse_personal_fields();
CREATE TRIGGER store_keys_refuse_personal_fields BEFORE INSERT OR UPDATE ON b2b.store_keys
  FOR EACH ROW EXECUTE FUNCTION b2b.refuse_personal_fields();
CREATE TRIGGER batches_refuse_personal_fields BEFORE INSERT OR UPDATE ON b2b.batches
  FOR EACH ROW EXECUTE FUNCTION b2b.refuse_personal_fields();
CREATE TRIGGER batch_reads_refuse_personal_fields BEFORE INSERT OR UPDATE ON b2b.batch_reads
  FOR EACH ROW EXECUTE FUNCTION b2b.refuse_personal_fields();

-- The application role --------------------------------------------------------
--
-- No password here, ever. scripts/set-b2b-password.js sets one through the
-- admin connection, sending only a SCRAM verifier, as set-writer-password.js
-- does for nose_writer.

CREATE ROLE nose_b2b LOGIN;
COMMENT ON ROLE nose_b2b IS
  'NOSE dispensary role: reads stores and keys; reads, adds and updates batches and readings; deletes nothing; nothing in schema nose.';

GRANT USAGE ON SCHEMA b2b TO nose_b2b;
GRANT SELECT ON b2b.stores, b2b.store_keys TO nose_b2b;
GRANT SELECT, INSERT, UPDATE ON b2b.batches, b2b.batch_reads TO nose_b2b;

-- PUBLIC executes nothing here. nose_b2b executes the two checks on the
-- tables it writes; nobody needs the trigger's, nor https_origins, which
-- checks a table only the admin writes.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA b2b FROM PUBLIC;
GRANT EXECUTE ON FUNCTION b2b.holds_no_person(jsonb), b2b.terps_ok(jsonb) TO nose_b2b;

-- As in every nose migration: nothing for Supabase's API roles. Skipped where
-- they do not exist (PGlite, plain Postgres), effective on Supabase.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA b2b FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA b2b FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA b2b FROM %I', r);
      EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA b2b FROM %I', r);
    END IF;
  END LOOP;
END
$$;
