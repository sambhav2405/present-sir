// functions/api/site-config.js -> GET/POST /api/site-config
//
// Backend-controlled site content, managed from a password-protected page
// (/admin.html) instead of hand-editing raw JSON in a Gist. Covers:
//   - promoCards: the swipeable popup's cards
//   - amazonDeals: the "Trending Top Picks" category carousel
//   - support: the UPI/QR support section (and whether to show it at all)
//
// ONE-TIME SETUP (the only setup this needs):
// 1. Cloudflare Pages project -> Settings -> Environment variables, add:
//      ADMIN_PASSWORD = <a password only you know>  (mark it as a secret)
// 2. Redeploy (env var changes need a redeploy to take effect).
// 3. Open /admin.html on your site and log in with that password.
//
// GET  (public, no auth) -> { ok:true, config: {...} | null }
//   null means "nothing saved yet" -> the site falls back to its built-in
//   defaults until you save something from /admin.html.
// POST (requires { password, config } in the JSON body) -> overwrites the
//   saved config. Wrong/missing password -> 401, nothing is changed.
//   { password } with no `config` field just verifies the password
//   (used by the admin page's login step) without saving anything.

import { kvGetJSON, kvSetJSON, jsonResponse } from '../lib/kv.js';

const KEY = 'siteConfig';

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
    const config = await kvGetJSON(env, KEY);
    return new Response(JSON.stringify({ ok: true, config: config || null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    console.error('site-config GET error:', err);
    return jsonResponse({ ok: true, config: null });
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
  // No `config` field = the admin page is just verifying the password
  // (login step), not saving anything yet.
  if (body.config === undefined) {
    return jsonResponse({ ok: true, verified: true });
  }
  if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
    return jsonResponse({ ok: false, error: 'config must be an object' }, 400);
  }

  try {
    await kvSetJSON(env, KEY, body.config);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('site-config POST error:', err);
    return jsonResponse({ ok: false, error: 'Failed to save' }, 500);
  }
}
