// TEMPORARY ADMIN TOOL — DELETE THIS FILE AS SOON AS LOGIN WORKS.
//
// Sets a password and force-confirms an email address via Supabase's admin
// API. No mail is sent, so it works while the free-tier SMTP quota is
// exhausted. This exists because the Supabase dashboard in some versions
// offers no "update password" control.
//
// WHY THIS IS DANGEROUS: it can take over ANY account on the project. It is
// protected by a shared secret in an environment variable rather than by a
// session, because the whole point is that nobody can log in yet. That is a
// deliberately weak protection appropriate to a five-minute lifespan and
// nothing longer.
//
// Requires env var ADMIN_FIX_TOKEN. If that variable is absent the endpoint
// refuses to do anything, so an accidental deploy without it is inert.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }

  const expected = process.env.ADMIN_FIX_TOKEN;
  if (!expected) {
    return json({ error: 'disabled', message: 'ADMIN_FIX_TOKEN is not set.' }, 503);
  }

  const supplied = request.headers.get('x-admin-token') || '';
  // Length check first so the comparison below cannot be used as an oracle on
  // length alone. Not constant-time; adequate for a token with this lifespan.
  if (supplied.length !== expected.length || supplied !== expected) {
    return json({ error: 'forbidden' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid-json' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || password.length < 10) {
    return json({ error: 'need-email-and-password', message: 'Password must be 10+ characters.' }, 400);
  }

  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!base || !key) return json({ error: 'missing-config' }, 503);

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };

  // Find the user. The admin list endpoint supports a filter, but it is
  // inconsistent across GoTrue versions, so page through and match locally —
  // slower, and correct everywhere.
  let user = null;
  for (let page = 1; page <= 10 && !user; page += 1) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!res.ok) {
      return json({ error: 'list-failed', status: res.status, body: (await res.text()).slice(0, 300) }, 502);
    }
    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : [];
    if (!users.length) break;
    user = users.find((u) => String(u.email || '').toLowerCase() === email) || null;
  }

  if (!user) return json({ error: 'user-not-found', email }, 404);

  // email_confirm: true marks the address verified without sending anything.
  const res = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });

  if (!res.ok) {
    return json({ error: 'update-failed', status: res.status, body: (await res.text()).slice(0, 300) }, 502);
  }

  const updated = await res.json();
  return json({
    status: 'ok',
    id: updated.id,
    email: updated.email,
    emailConfirmedAt: updated.email_confirmed_at || null,
    message: 'Password set and email confirmed. Delete this function now.',
  });
};
