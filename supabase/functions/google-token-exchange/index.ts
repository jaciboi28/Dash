import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const action = body.action || 'exchange';

  // ── Step data proxy ──────────────────────────────────────────────────────────
  if (action === 'fetch_steps') {
    const { access_token } = body;
    if (!access_token) return json({ error: 'missing_access_token' }, 400);

    const now       = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endTime   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    // Try the primary endpoint; return raw body so the client can adapt if shape changes
    const resp = await fetch('https://health.googleapis.com/v1/users/me/aggregates', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, endTime, aggregateBy: ['STEPS'] }),
    });
    const text = await resp.text();
    return new Response(JSON.stringify({ status: resp.status, body: text }), {
      status: 200, // always 200 so the client can read the body
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Token exchange / refresh ─────────────────────────────────────────────────
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const grantType    = body.grant_type || 'authorization_code';

  const params = new URLSearchParams({ grant_type: grantType, client_id: clientId, client_secret: clientSecret });

  if (grantType === 'authorization_code') {
    const { code, code_verifier, redirect_uri } = body;
    if (!code || !code_verifier || !redirect_uri) return json({ error: 'missing_params' }, 400);
    params.set('code', code);
    params.set('code_verifier', code_verifier);
    params.set('redirect_uri', redirect_uri);
  } else if (grantType === 'refresh_token') {
    const { refresh_token } = body;
    if (!refresh_token) return json({ error: 'missing_refresh_token' }, 400);
    params.set('refresh_token', refresh_token);
  } else {
    return json({ error: 'unsupported_grant_type' }, 400);
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await resp.json();
  return json(data, resp.status);
});
