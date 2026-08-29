// functions/api/webhook-status.js -> GET /api/webhook-status
//
// Debug helper — open this to check whether Telegram actually has your
// webhook registered: https://<YOUR_SITE>/api/webhook-status

import { jsonResponse } from '../lib/kv.js';

export async function onRequestGet({ env }) {
  const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return jsonResponse({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not set.' });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = await res.json();
    return jsonResponse({ ok: true, chatIdConfigured: Boolean(env.TELEGRAM_CHAT_ID), webhookInfo: data.result });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Could not reach Telegram: ' + err.message });
  }
}
