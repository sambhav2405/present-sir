// functions/api/check-reply.js -> GET /api/check-reply?id=xxx
//
// The website polls this to check if the developer has replied yet to a
// particular suggestion.

import { kvGetJSON, jsonResponse } from '../lib/kv.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return jsonResponse({ ok: false, error: 'Missing id' }, 400);
  }

  try {
    const record = await kvGetJSON(env, `sugg:${id}`);
    if (!record) {
      return jsonResponse({ ok: true, replied: false });
    }
    if (record.reply) {
      return jsonResponse({ ok: true, replied: true, reply: record.reply, repliedAt: record.repliedAt });
    }
    return jsonResponse({ ok: true, replied: false });
  } catch (err) {
    console.error('check-reply error:', err);
    return jsonResponse({ ok: false, error: 'Server error' }, 500);
  }
}
