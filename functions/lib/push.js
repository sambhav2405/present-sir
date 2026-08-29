// functions/lib/push.js
//
// Web Push, implemented directly against the Web Crypto API (available
// natively in the Workers/Pages Functions runtime) instead of the
// `web-push` npm package — that package shells out to Node's `https`
// module internally, which isn't available on Workers. This follows the
// Web Push protocol spec directly:
//   - RFC 8291 (aes128gcm payload encryption)
//   - RFC 8292 (VAPID, an ES256-signed JWT identifying the sender)
//
// Not live-tested against a real push service (no Cloudflare account
// available in the environment that wrote this) — it follows both RFCs
// exactly, but please verify end-to-end once deployed: send yourself a
// suggestion reply and confirm the OS notification actually shows up.

function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

async function hkdfExpand(prk, info, length) {
  // Single-block HKDF-Expand (HMAC-SHA256) — fine for the <=32-byte outputs we need here.
  const data = concatBytes(info, new Uint8Array([1]));
  const out = await hmacSha256(prk, data);
  return out.slice(0, length);
}

async function importVapidPrivateKey(publicKeyB64url, privateKeyB64url) {
  const pub = base64urlToBytes(publicKeyB64url); // 65 bytes: 0x04 || X(32) || Y(32)
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const d = base64urlToBytes(privateKeyB64url); // 32-byte raw private scalar
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToBase64url(x), y: bytesToBase64url(y), d: bytesToBase64url(d),
    ext: true
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function createVapidJWT(audience, subject, publicKeyB64url, privateKeyB64url) {
  const enc = new TextEncoder();
  const encodePart = (obj) => bytesToBase64url(enc.encode(JSON.stringify(obj)));
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };
  const unsigned = `${encodePart(header)}.${encodePart(payload)}`;

  const key = await importVapidPrivateKey(publicKeyB64url, privateKeyB64url);
  // WebCrypto's ECDSA sign() returns the raw (r || s) signature, which is
  // exactly the format JWS ES256 expects — no DER conversion needed.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `${unsigned}.${bytesToBase64url(sig)}`;
}

async function encryptPayload(payload, p256dhB64url, authB64url) {
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(JSON.stringify(payload));

  const subscriberPublicKeyBytes = base64urlToBytes(p256dhB64url); // 65 bytes uncompressed EC point
  const authSecret = base64urlToBytes(authB64url); // 16 bytes

  const subscriberKey = await crypto.subtle.importKey(
    'raw', subscriberPublicKeyBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  const ephemeralKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephemeralPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: subscriberKey }, ephemeralKeyPair.privateKey, 256)
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 double-HKDF: first derive IKM keyed by the subscription's auth
  // secret, then re-key with the per-message salt to get the actual CEK/nonce.
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), subscriberPublicKeyBytes, ephemeralPublicRaw);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const prk2 = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk2, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(prk2, enc.encode('Content-Encoding: nonce\0'), 12);

  const padded = concatBytes(payloadBytes, new Uint8Array([2])); // last-record delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false); // record size
  const idlen = new Uint8Array([ephemeralPublicRaw.length]);

  return concatBytes(salt, rs, idlen, ephemeralPublicRaw, ciphertext);
}

export async function sendPush(subscription, payload, env) {
  const { endpoint, keys } = subscription;
  if (!keys || !keys.p256dh || !keys.auth) throw new Error('Invalid subscription: missing keys');
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('VAPID keys not configured');

  const body = await encryptPayload(payload, keys.p256dh, keys.auth);
  const audience = new URL(endpoint).origin;
  const jwt = await createVapidJWT(audience, 'mailto:no-reply@presentsir.me', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`
    },
    body
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Push failed: ${res.status} ${text}`);
  }
}
