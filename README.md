# present-sir (Academic Pro) — Cloudflare edition

Same app as the Netlify version, rebuilt for Cloudflare Pages:
- `frontend/` — the static site (index.html, manifest.json, sw.js, icon).
- `functions/api/` — backend, as Cloudflare Pages Functions (one file = one route: `functions/api/suggest.js` → `/api/suggest`).
- `functions/lib/` — shared helpers (KV access, and a from-scratch Web Push implementation using the Web Crypto API — Cloudflare's runtime can't run the `web-push` npm package, which depends on Node's `https` module).

Storage: one Cloudflare KV namespace (`APP_KV`) replaces Netlify Blobs.

## Setup — do these in order

### 1. Create the Cloudflare Pages project
Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick this repo (`sambhav2405/present-sir`).
- Build output directory: `frontend`
- Build command: *(leave empty — it's a static site, nothing to build)*

This gives you a `*.pages.dev` URL immediately. Point your domain (`presentsir.me`) at it later under **Custom domains**, once you're happy with it — no rush, your current Netlify site keeps serving `presentsir.me` until you switch the domain over.

### 2. Create the KV namespace and bind it
```
npx wrangler login
npx wrangler kv namespace create APP_KV
```
This prints an `id`. Then in the Cloudflare dashboard: your Pages project → **Settings** → **Functions** → **KV namespace bindings** → **Add binding** → Variable name `APP_KV`, pick the namespace you just created.

(The `id` also goes into `wrangler.toml` if you want to use `wrangler pages dev` for local testing — not required for the deployed site, that reads the dashboard binding instead.)

### 3. Set environment variables
Pages project → **Settings** → **Environment variables** → add for **Production**:

| Key | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | your bot token from BotFather |
| `TELEGRAM_CHAT_ID` | your chat id (see below) |
| `VAPID_PUBLIC_KEY` | `BIrzFkL2Bg0ztwWr0ppaWOegB5qlD9uWazzNuHGyi3k1QdYtmyAW7xf6_aHNftSt9rJQvcbmdhPNARxFex8PiqA` |
| `VAPID_PRIVATE_KEY` | `K5HD8v6yb-TsOGQYrCnQevQafO4S57QegJ4qVB6vmRI` |

The VAPID pair above is the **same one already used on the live Netlify site** — reusing it means any push subscriptions saved there stay valid if you switch the domain over later. Mark `VAPID_PRIVATE_KEY` and `TELEGRAM_BOT_TOKEN` as **secret/encrypted** in the dashboard.

Don't have a Telegram bot yet, or forgot your chat id: message your bot once, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser — your chat id is in the JSON response.

After adding these, **redeploy** (env var changes need a fresh deploy to take effect).

### 4. Point the Telegram webhook at the new site
Once deployed, open (once):
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-pages-url>/api/telegram-webhook
```
Check it worked: `https://<your-pages-url>/api/webhook-status`.

### 5. (Optional) Auto-deploy from GitHub Actions instead of Cloudflare's own Git integration
This repo already has `.github/workflows/deploy.yml`. If you'd rather deploy via Actions than Cloudflare's built-in Git integration, add these two **GitHub repo secrets** (repo → Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar of any domain, or Workers & Pages overview page |

These are **GitHub secrets, not Cloudflare env vars** — different system, don't mix them up with step 3. If you use step 1's Git integration instead, you don't need this at all (pick one, not both, or they'll race each other on every push).

## Verify it's working
- `https://<your-site>/api/kv-status` → should return `{"ok":true,"writeRead":true}`.
- `https://<your-site>/api/webhook-status` → `webhookInfo.url` should show your Pages URL.
- Send a suggestion from the site, reply to it in Telegram, confirm the reply shows up on the site and (if you enabled the bell icon) as a push notification.

## Known differences from the Netlify version / things to watch for
- **KV is eventually consistent** (Blobs was strongly consistent). For our scale (a visitor counter, suggestion replies) this is very unlikely to matter, but don't be alarmed by an occasional few-second lag on a read right after a write.
- **The Web Push code is hand-written against the raw spec** (RFC 8291/8292) since the `web-push` npm package doesn't run on Workers. It wasn't testable end-to-end without a live Cloudflare deployment — please actually test a real push notification once this is live, and tell me if it doesn't arrive so it can be debugged with real error output.
- **Functions must stay in `functions/`** at the repo root (sibling to `frontend/`, not inside it) — that exact folder name is a Cloudflare Pages convention, not a choice made here.
- If you ever see `APP_KV` errors, it almost always means the KV binding (step 2) wasn't added, or was added but a redeploy hasn't happened since.
