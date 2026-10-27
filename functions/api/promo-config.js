// functions/api/promo-config.js -> GET/POST /api/promo-config
//
// Backend-controlled promo cards for the swipeable popup, so the site admin
// can manage them from a password-protected page (/admin.html) instead of
// hand-editing raw JSON in a Gist.
//
// ONE-TIME SETUP (the only setup this needs):
// 1. Cloudflare Pages project -> Settings -> Environment variables, add:
//      ADMIN_PASSWORD = <a password only you know>  (mark it as a secret)
// 2. Redeploy (env var changes need a redeploy to take effect).
// 3. Open /admin.html on your site and log in with that password.
//
// GET  (public, no auth) -> { ok:true, cards: [...] | null }
//   null means "nothing saved yet" -> the site falls back to its built-in
//   default cards until you save something from /admin.html.
// POST (requires { password, cards } in the JSON body) -> overwrites the
//   saved cards. Wrong/missing password -> 401, nothing is changed.

import { kvGetJSON, kvSetJSON, jsonResponse } from '../lib/kv.js';

const KEY = 'promoCards';

function safeEqual(a, b) {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(String(a));
  const bufB = encoder.encode(String(b));
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

export async function onRequestGet({ env }) {
  try {
    const cards = await kvGetJSON(env, KEY);
    return new Response(JSON.stringify({ ok: true, cards: cards || null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    console.error('promo-config GET error:', err);
    return jsonResponse({ ok: true, cards: null });
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return jsonResponse({ ok: false, error: 'Server not configured: set ADMIN_PASSWORD in Cloudflare Pages env vars and redeploy.' }, 500);
  }
  if (!body.password || !safeEqual(body.password, ADMIN_PASSWORD)) {
    return jsonResponse({ ok: false, error: 'Wrong password' }, 401);
  }
  // No `cards` field = the admin page is just verifying the password
  // (login step), not saving anything yet.
  if (body.cards === undefined) {
    return jsonResponse({ ok: true, verified: true });
  }
  if (!Array.isArray(body.cards)) {
    return jsonResponse({ ok: false, error: 'cards must be an array' }, 400);
  }

  try {
    await kvSetJSON(env, KEY, body.cards);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('promo-config POST error:', err);
    return jsonResponse({ ok: false, error: 'Failed to save' }, 500);
  }
}
