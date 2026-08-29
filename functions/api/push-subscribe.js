// functions/api/push-subscribe.js -> POST /api/push-subscribe
//
// Saves (or removes) a browser's Web Push subscription, keyed by the same
// per-device id used for the visitor counter. telegram-webhook.js looks
// this up by device id when a reply comes in.

import { jsonResponse } from '../lib/kv.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const deviceId = (body.deviceId || '').toString().trim().slice(0, 64);
  if (!deviceId) {
    return jsonResponse({ ok: false, error: 'Missing deviceId' }, 400);
  }

  try {
    if (body.unsubscribe) {
      await env.APP_KV.delete(`push:${deviceId}`);
      return jsonResponse({ ok: true, removed: true });
    }

    if (!body.subscription || !body.subscription.endpoint) {
      return jsonResponse({ ok: false, error: 'Missing subscription' }, 400);
    }

    await env.APP_KV.put(`push:${deviceId}`, JSON.stringify(body.subscription));
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('push-subscribe error:', err);
    return jsonResponse({ ok: false, error: 'Server error' });
  }
}
