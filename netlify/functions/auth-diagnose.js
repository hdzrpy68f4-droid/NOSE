// TEMPORARY DIAGNOSTIC — DELETE THIS FILE ONCE AUTH WORKS.
//
// Reports the SHAPE of the auth configuration and whether Supabase is
// reachable. Deliberately never returns a secret value:
//   * SUPABASE_URL is public anyway, so the host is shown in full
//   * SUPABASE_SERVICE_KEY is reported only as present/absent, length, and its
//     first three characters — every Supabase JWT starts "eyJ", so those three
//     characters distinguish "a JWT" from "pasted the wrong thing" without
//     revealing anything an attacker could use
//
// It is publicly reachable while it exists. That is acceptable for a few
// minutes of debugging and not acceptable permanently.

export default async () => {
  const out = { note: 'temporary diagnostic — delete this function' };

  const rawUrl = process.env.SUPABASE_URL;
  const rawKey = process.env.SUPABASE_SERVICE_KEY;

  out.SUPABASE_URL = {
    present: typeof rawUrl === 'string' && rawUrl.length > 0,
    length: rawUrl ? rawUrl.length : 0,
    hasWhitespace: rawUrl ? /^\s|\s$/.test(rawUrl) : false,
    value: rawUrl ? rawUrl.trim() : null,
  };

  out.SUPABASE_SERVICE_KEY = {
    present: typeof rawKey === 'string' && rawKey.length > 0,
    length: rawKey ? rawKey.length : 0,
    hasWhitespace: rawKey ? /^\s|\s$/.test(rawKey) : false,
    startsWith: rawKey ? rawKey.trim().slice(0, 3) : null,
    looksLikeJwt: rawKey ? rawKey.trim().split('.').length === 3 : false,
  };

  // Every environment variable name visible to this function. Names only —
  // this catches the case where a variable exists under a mistyped key.
  out.visibleEnvKeys = Object.keys(process.env)
    .filter((k) => /SUPA|NOSE|AUTH/i.test(k))
    .sort();

  if (!out.SUPABASE_URL.present || !out.SUPABASE_SERVICE_KEY.present) {
    out.verdict = 'MISSING ENV VAR — the variable is not reaching the function.';
    return json(out);
  }

  let base;
  try {
    base = new URL(out.SUPABASE_URL.value);
  } catch (err) {
    out.verdict = 'SUPABASE_URL IS NOT A VALID URL — check for a stray character.';
    out.parseError = String(err && err.message);
    return json(out);
  }
  out.host = base.host;

  // Unauthenticated health endpoint: proves DNS and TLS work.
  try {
    const res = await fetch(`${base.origin}/auth/v1/health`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY.trim() },
    });
    out.reachable = true;
    out.healthStatus = res.status;
  } catch (err) {
    out.reachable = false;
    out.fetchError = String(err && err.message);
    out.verdict = 'CANNOT REACH SUPABASE — hostname wrong, or project paused/deleted.';
    return json(out);
  }

  // Authenticated call: proves the key is the service_role key, not the anon key.
  try {
    const res = await fetch(`${base.origin}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY.trim(),
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY.trim()}`,
      },
    });
    out.adminStatus = res.status;
    if (res.status === 401 || res.status === 403) {
      out.verdict = 'KEY REJECTED — this is probably the anon/publishable key, not service_role/secret.';
    } else if (res.ok) {
      out.verdict = 'CONFIG OK — Supabase reachable and the service key works.';
    } else {
      out.verdict = `Unexpected admin status ${res.status}.`;
      out.adminBody = (await res.text()).slice(0, 300);
    }
  } catch (err) {
    out.verdict = 'Admin call threw.';
    out.adminError = String(err && err.message);
  }

  return json(out);
};

const json = (data) =>
  new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
