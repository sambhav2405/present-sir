// functions/api/vapid-public-key.js -> GET /api/vapid-public-key
//
// Hands the frontend the VAPID public key it needs to subscribe to Web
// Push. Public keys aren't secret, so serving it like this keeps it in
// one place instead of hardcoding it into the frontend.

import { jsonResponse } from '../lib/kv.js';

export async function onRequestGet({ env }) {
  const publicKey = env.VAPID_PUBLIC_KEY || '';
  return jsonResponse({ ok: Boolean(publicKey), publicKey });
}
