// functions/lib/kv.js
//
// All app data lives in ONE Cloudflare KV namespace (binding: APP_KV), with
// key prefixes standing in for what used to be separate Netlify Blobs
// "stores": sugg:<id> and tg:<messageId> (suggestions + reverse lookup),
// visit:total / visit:seen:<deviceId> (visitor counter), push:<deviceId>
// (Web Push subscriptions).

export async function kvGetJSON(env, key) {
  return env.APP_KV.get(key, { type: 'json' });
}

export async function kvSetJSON(env, key, value) {
  await env.APP_KV.put(key, JSON.stringify(value));
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
