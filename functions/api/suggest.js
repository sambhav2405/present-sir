// functions/api/suggest.js -> POST /api/suggest
//
// Saves each suggestion to Cloudflare KV with a unique id, and forwards it
// to Telegram with that id visible. Reply to that Telegram message and
// telegram-webhook.js will save your reply back against this id, so
// check-reply.js can return it to the right user's browser later.

import { kvGetJSON, kvSetJSON, jsonResponse } from '../lib/kv.js';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const clean = (s, max) => (s || '').toString().trim().slice(0, max);
  const name = clean(payload.name, 60);
  const branch = clean(payload.branch, 60);
  const text = clean(payload.text, 800);
  const deviceId = clean(payload.deviceId, 64);

  if (!text) {
    return jsonResponse({ ok: false, error: 'Empty suggestion' }, 400);
  }

  const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = env.TELEGRAM_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    return jsonResponse({ ok: false, error: 'Server not configured' }, 500);
  }

  const id = genId();
  const lines = ['💡 New Suggestion (Academic Pro)', ''];
  if (name) lines.push(`👤 Name: ${name}`);
  if (branch) lines.push(`🎓 Branch: ${branch}`);
  lines.push('', `📝 ${text}`, '', `🆔 ID: ${id}`, '↩️ Reply to THIS message to answer the user.');

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: lines.join('\n') })
    });
    const data = await res.json();
    if (!data.ok) {
      return jsonResponse({ ok: false, error: 'Telegram rejected message' }, 502);
    }

    const telegramMessageId = data.result.message_id;

    // The message has already reached the developer on Telegram at this
    // point — that's the part the user actually cares about. A KV failure
    // below must NOT make the user think their suggestion was lost.
    try {
      const record = { id, name, branch, text, deviceId, telegramMessageId, createdAt: Date.now(), reply: null, repliedAt: null };
      await kvSetJSON(env, `sugg:${id}`, record);
      await kvSetJSON(env, `tg:${telegramMessageId}`, { pointsTo: id });
    } catch (storeErr) {
      console.error('suggest: KV store failed (message still sent to Telegram):', storeErr);
      return jsonResponse({ ok: true, id, replyTrackingUnavailable: true });
    }

    return jsonResponse({ ok: true, id });
  } catch (err) {
    console.error('suggest error:', err);
    return jsonResponse({ ok: false, error: 'Server error' }, 500);
  }
}
