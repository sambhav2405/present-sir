// functions/api/visit-count.js -> POST /api/visit-count
//
// Our own visitor counter, backed by Cloudflare KV. Client sends a stable
// per-device id (a UUID kept in localStorage); we only increment the total
// the first time we ever see that id, so this is safe to call every load.

import { jsonResponse } from '../lib/kv.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const deviceId = (body.deviceId || '').toString().trim().slice(0, 64);
  if (!deviceId) {
    return jsonResponse({ ok: false, error: 'Missing deviceId' }, 400);
  }

  try {
    const seenKey = `visit:seen:${deviceId}`;
    const alreadySeen = await env.APP_KV.get(seenKey);
    const totalRecord = await env.APP_KV.get('visit:total', { type: 'json' });
    let count = (totalRecord && totalRecord.count) || 0;

    if (!alreadySeen) {
      count += 1;
      await env.APP_KV.put('visit:total', JSON.stringify({ count }));
      await env.APP_KV.put(seenKey, '1');
    }

    return jsonResponse({ ok: true, raw: count });
  } catch (err) {
    console.error('visit-count error:', err);
    return jsonResponse({ ok: false, error: 'Server error' });
  }
}
