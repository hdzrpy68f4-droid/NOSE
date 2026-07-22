// Receives client-side JS errors. Deliberately minimal: enough to locate a bug,
// nothing that identifies a person. Errors here used to be invisible entirely.
export default async (request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let data;
  try { data = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }
  if (!data || !data.message) return new Response('Bad Request', { status: 400 });

  const record = {
    kind: String(data.kind || 'error').slice(0, 40),
    message: String(data.message).slice(0, 300),
    source: String(data.source || '').slice(0, 200),
    line: Number.isFinite(data.line) ? data.line : null,
    col: Number.isFinite(data.col) ? data.col : null,
    page: String(data.page || '').slice(0, 120),
    ua: String(data.ua || '').slice(0, 180),
    ts: new Date().toISOString(),
  };

  // Shows up in Netlify function logs immediately; swap for a real sink later.
  console.error('client-error', JSON.stringify(record));
  return new Response(null, { status: 204 });
};
