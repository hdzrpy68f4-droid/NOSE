#!/usr/bin/env bash
# NOSE — point test/store-test.js at a throwaway Supabase database.
#
#   bash setup-test-db.sh
#
# Run it once: it creates a .env template and tells you to fill it in.
# Run it again: it validates what you put there and runs the test.
#
# Nothing is typed at a terminal prompt — you paste into the editor, where
# pasting actually works. The connection string never enters shell history.

set -uo pipefail
cd "$(dirname "$0")"

fail() { echo; echo "FAIL: $*"; exit 1; }

TEMPLATE='NOSE_TEST_DB_URL=postgresql://postgres.PROJECTREF:PASSWORD@HOST.pooler.supabase.com:6543/postgres'

# --- 1. never write a secret anywhere git can pick it up --------------------
if ! git check-ignore -q .env 2>/dev/null; then
  fail ".env is not covered by .gitignore in this repo.
      Refusing to create a file that git could commit a password into.
      Add a line reading  .env  to .gitignore, then run this again."
fi

# --- 2. create the template on first run ------------------------------------
if [ ! -f .env ]; then
  printf '%s\n' "$TEMPLATE" > .env
  chmod 600 .env
  cat <<'NEXT'
==> created .env

Now do this:

  1. Run:  code .env
  2. Replace the WHOLE line with your Supabase connection string, like so:

       NOSE_TEST_DB_URL=postgresql://postgres.abcd...:YourPassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres

     Supabase -> Connect -> Transaction pooler.  Keep the NOSE_TEST_DB_URL=
     prefix, no spaces around the =, no quotes needed.
  3. Save with Ctrl+S
  4. Run this script again:  bash setup-test-db.sh

NEXT
  exit 0
fi

echo "==> reading .env"

# --- 3. pull the value out without sourcing the file ------------------------
# Sourcing would execute whatever is in there; this just reads the line.
URL=$(sed -n 's/^[[:space:]]*NOSE_TEST_DB_URL=//p' .env | head -1)
trim() {                                    # strip leading + trailing whitespace
  URL="${URL#"${URL%%[![:space:]]*}"}"
  URL="${URL%"${URL##*[![:space:]]}"}"
}
trim                                        # whitespace FIRST, or a trailing space
URL="${URL%\"}"; URL="${URL#\"}"            # hides the closing quote from these
URL="${URL%\'}"; URL="${URL#\'}"
trim                                        # again, for whitespace inside the quotes

[ -n "${URL:-}" ] || fail "no NOSE_TEST_DB_URL= line found in .env.
      Open it with:  code .env
      The line must start with  NOSE_TEST_DB_URL=  and have no spaces around the =."

# --- 4. check its shape before trusting it ----------------------------------
URL="$URL" node -e '
const s = process.env.URL || "";
let u;
try { u = new URL(s); }
catch (e) { console.log("  not a valid URL:", e.message); process.exit(1); }

let bad = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "BAD "} ${label}${ok ? "" : "  -> " + detail}`);
  if (!ok) bad++;
};

check("scheme is postgres", /^postgres(ql)?:$/.test(u.protocol), u.protocol);
check("username carries the project ref",
  u.username.includes("."),
  JSON.stringify(u.username) + " is the DIRECT connection form, not the pooler");
check("username is not the template",
  !/PROJECTREF/i.test(u.username), "still says PROJECTREF — paste your real string");
check("host is the pooler",
  u.hostname.includes("pooler.supabase.com"),
  u.hostname.includes("supabase.co") ? "that is the direct host" : "unrecognised host");
check("port is 6543 (transaction mode)",
  u.port === "6543",
  "got " + (u.port || "none") + "; 5432 is session/direct mode");
check("database is postgres", u.pathname === "/postgres", u.pathname || "none");
check("password present", !!u.password, "missing");
check("password is not the template",
  !/^PASSWORD$|YOUR-?PASSWORD|^%5B|^\[/i.test(decodeURIComponent(u.password || "")),
  "still a placeholder — substitute your real password");

if (u.password && /[^A-Za-z0-9]/.test(u.password)) {
  console.log("  warn  password has non-alphanumeric characters.");
  console.log("        % and # silently corrupt a URL. If auth fails, reset the");
  console.log("        Supabase password to letters and digits only.");
}
process.exit(bad ? 1 : 0);
'
[ $? -eq 0 ] || fail "the string in .env did not pass the checks above.
      Fix it with:  code .env"

chmod 600 .env

# --- 5. run the test --------------------------------------------------------
echo "==> running store-test"
echo
export NOSE_TEST_DB_URL="$URL"
node test/store-test.js
status=$?

echo
if [ $status -eq 0 ]; then
  cat <<'DONE'
In any NEW terminal, load it again with:

    set -a; . ./.env; set +a

DONE
fi
exit $status
