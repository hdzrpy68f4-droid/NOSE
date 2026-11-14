#!/usr/bin/env bash
# NOSE - is the live site serving, and is it serving this commit?
#
#   bash scripts/live-check.sh https://nose-app.com            the site answers as it should
#   bash scripts/live-check.sh https://nose-app.com <commit>   ...and serves that commit's pages
#
# Prints one line per check and ends "live-check clean", or exits 1 with one
# plain line naming the first check that failed. .github/workflows/gates.yml
# runs it after promote has moved the branch live, and once a week
# (PARSER-HANDOFF.md section 13, "The live site is checked after every
# deploy").
#
# The gates load each function's source in Node. Netlify's own bundling and
# runtime are exercised only on Netlify, so this asks the real site: a
# function that fails to start there, a Netlify build that failed, a paused
# site or a certificate about to expire shows up here.
#
# It reads only. It sends no vote, no error report and no link to a lab
# report, so it stores nothing anywhere, and it uses no secret.
#
# With a commit: it waits, up to 10 minutes in 20-second steps, until the
# site's home page and /app link the same fingerprinted files as that
# commit's index.html and app.html, read with git from the folder it is run
# in. A commit that renamed no file those two pages link looks the same as
# the one before it, so for such a commit this shows the site is up, not
# that the deploy arrived.
set -uo pipefail

site=${1:-}
commit=${2:-}
if [ -z "$site" ]; then
  echo 'usage: bash scripts/live-check.sh <site> [<commit>]' >&2
  exit 2
fi
site=${site%/}

fail() { echo "FAIL  $1"; exit 1; }
ok() { echo "ok    $1"; }
status() { curl -s -o /dev/null --max-time 30 -w '%{http_code}' "$@"; }
# The fingerprinted files a page links: /js/x.<8 hex>.js, /css/x.<8 hex>.css.
assets() { grep -oE '/(js|css)/[a-z0-9-]+\.[0-9a-f]{8}\.(js|css)|/family\.[0-9a-f]{8}\.css' | sort -u | tr '\n' ' '; }

if [ -n "$commit" ]; then
  short=$(git rev-parse --short "$commit" 2>/dev/null) || fail "this folder has no commit $commit to compare the site with"
  want_home=$(git show "$commit:index.html" | assets)
  want_app=$(git show "$commit:app.html" | assets)
  [ -n "$want_home" ] && [ -n "$want_app" ] || fail "commit $short's index.html or app.html links no fingerprinted file"
  served=no
  for _ in $(seq 1 31); do
    if [ "$(curl -s --max-time 30 "$site/" | assets)" = "$want_home" ] &&
       [ "$(curl -s --max-time 30 "$site/app" | assets)" = "$want_app" ]; then
      served=yes
      break
    fi
    sleep 20
  done
  [ "$served" = yes ] || fail "the site is not serving $short after 10 minutes"
  ok "the home page and /app link the files commit $short does"
fi

for page in / /app /privacy/ /methodology/; do
  code=$(status "$site$page")
  [ "$code" = 200 ] || fail "$page answered $code, not 200"
done
ok '/, /app, /privacy/ and /methodology/ answer 200'

# The lab-report function starts and reads a request: a body of null is
# refused with its fixed sentence before anything is fetched or stored.
reply=$(curl -s --max-time 30 -X POST "$site/.netlify/functions/coa" -H 'content-type: application/json' --data 'null')
[ "$reply" = '{"error":"Could not read that request."}' ] || fail "the coa function answered: ${reply:0:200}"
ok 'the coa function refuses an empty request with its fixed sentence'

# The dispensary feed with no key: 400 while the dispensary module is
# switched on, 404 when it is off (lib/b2b-flag.js). Anything else - a 5xx,
# a timeout - is a function that did not start.
code=$(status "$site/.netlify/functions/b2b-feed")
case "$code" in
  400|404) ok "the b2b-feed function answers $code with no key" ;;
  *) fail "the b2b-feed function answered $code with no key, not 400 or 404" ;;
esac

for path in /PARSER-HANDOFF.md /CLAUDE.md /package.json /README.md; do
  code=$(status "$site$path")
  [ "$code" = 404 ] || fail "$path answered $code, not 404: source is being served"
done
ok '/PARSER-HANDOFF.md, /CLAUDE.md, /package.json and /README.md answer 404'

# The certificate: more than 14 days left.
host=${site#https://}
host=${host%%/*}
if command -v openssl >/dev/null 2>&1; then
  cert=$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null)
  [ -n "$cert" ] || fail "no certificate could be read from $host"
  if ! printf '%s\n' "$cert" | openssl x509 -noout -checkend $((14 * 86400)) >/dev/null 2>&1; then
    fail "the certificate for $host ends within 14 days: $(printf '%s\n' "$cert" | openssl x509 -noout -enddate 2>/dev/null)"
  fi
  ok "the certificate has more than 14 days left ($(printf '%s\n' "$cert" | openssl x509 -noout -enddate | cut -d= -f2))"
else
  echo 'skip  the certificate: openssl is not installed here'
fi

echo
echo 'live-check clean'
