// functions/api/telegram-webhook.js -> POST /api/telegram-webhook
//
// Telegram calls this whenever you reply to a suggestion message in your
// chat. It saves your reply text, and — if the sender's device has a
// saved push subscription — pushes them a real notification too.
//
// ONE-TIME SETUP: open this in your browser (replace both placeholders):
//   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_SITE>/api/telegram-webhook

import { kvGetJSON, kvSetJSON } from '../lib/kv.js';
import { sendPush } from '../lib/push.js';

export async function onRequestPost({ request, env }) {
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('ok', { status: 200 });
  }

  const msg = update.message;
  const CHAT_ID = env.TELEGRAM_CHAT_ID;

  if (!msg || !msg.reply_to_message || String(msg.chat.id) !== String(CHAT_ID)) {
    return new Response('ok', { status: 200 });
  }

  const repliedToId = msg.reply_to_message.message_id;
  const replyText = (msg.text || '').trim();
  if (!replyText) {
    return new Response('ok', { status: 200 });
  }

  try {
    const pointer = await kvGetJSON(env, `tg:${repliedToId}`);
    if (!pointer || !pointer.pointsTo) {
      return new Response('ok', { status: 200 }); // reply to some unrelated message, ignore
    }

    const record = await kvGetJSON(env, `sugg:${pointer.pointsTo}`);
    if (!record) {
      return new Response('ok', { status: 200 });
    }

    record.reply = replyText;
    record.repliedAt = Date.now();
    await kvSetJSON(env, `sugg:${pointer.pointsTo}`, record);

    // Best-effort push — never let a push failure affect the Telegram-side
    // confirmation below.
    if (record.deviceId) {
      try {
        const subscription = await kvGetJSON(env, `push:${record.deviceId}`);
        if (subscription) {
          await sendPush(subscription, { title: '💬 Developer replied!', body: replyText.slice(0, 140), url: '/' }, env);
        }
      } catch (pushErr) {
        console.error('telegram-webhook: push send failed:', pushErr);
      }
    }

    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
    if (BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: '✅ Reply saved. User will see it next time they open the site.' })
      });
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('telegram-webhook error:', err);
    return new Response('ok', { status: 200 }); // always 200 so Telegram doesn't retry-storm
  }
}
