// functions/api/kv-status.js -> GET /api/kv-status
//
// Debug helper — open this to check whether the APP_KV namespace is bound
// and working: https://<YOUR_SITE>/api/kv-status
// (Equivalent of the old blobs-status.js from the Netlify version.)

import { jsonResponse } from '../lib/kv.js';

export async function onRequestGet({ env }) {
  if (!env.APP_KV) {
    return jsonResponse({
      ok: false,
      error: 'APP_KV namespace is not bound. In the Cloudflare dashboard: Pages project -> Settings -> Functions -> KV namespace bindings -> add APP_KV.'
    });
  }

  try {
    const testKey = `selftest:${Date.now()}`;
    await env.APP_KV.put(testKey, JSON.stringify({ ok: true, at: Date.now() }));
    const readBack = await env.APP_KV.get(testKey, { type: 'json' });
    await env.APP_KV.delete(testKey);
    return jsonResponse({ ok: true, writeRead: Boolean(readBack && readBack.ok) });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}
