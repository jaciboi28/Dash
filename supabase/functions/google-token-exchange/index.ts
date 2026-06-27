import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { grant_type?: string; code?: string; code_verifier?: string; redirect_uri?: string; refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const grantType    = body.grant_type || 'authorization_code';

  const params = new URLSearchParams({ grant_type: grantType, client_id: clientId, client_secret: clientSecret });

  if (grantType === 'authorization_code') {
    const { code, code_verifier, redirect_uri } = body;
    if (!code || !code_verifier || !redirect_uri) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    params.set('code', code);
    params.set('code_verifier', code_verifier);
    params.set('redirect_uri', redirect_uri);
  } else if (grantType === 'refresh_token') {
    const { refresh_token } = body;
    if (!refresh_token) {
      return new Response(JSON.stringify({ error: 'missing_refresh_token' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    params.set('refresh_token', refresh_token);
  } else {
    return new Response(JSON.stringify({ error: 'unsupported_grant_type' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params,
  });

  const data = await resp.json();
  return new Response(JSON.stringify(data), {
    status:  resp.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
