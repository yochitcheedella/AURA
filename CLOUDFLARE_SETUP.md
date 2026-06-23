# AURA — Cloudflare + Neon + Clerk + R2 Setup Guide (v2.0)

**Stack:**
- 🌐 **Frontend**: Cloudflare Pages (static + edge functions)
- 🗄 **Database**: Neon (serverless PostgreSQL)
- 📦 **Storage**: Cloudflare R2 (voice recordings, attachments)
- 🔐 **Auth**: Clerk

---

## Architecture Overview

```
Browser (AURA SPA)
   │
   ├── Clerk JS SDK          ← auth, JWT tokens
   ├── /api/reminders  ──►  Cloudflare Pages Function
   ├── /api/notifications ►  Cloudflare Pages Function  ──► Neon PostgreSQL
   ├── /api/profile    ──►  Cloudflare Pages Function
   └── /api/upload     ──►  Cloudflare Pages Function  ──► Cloudflare R2
          ▲
     _middleware.js
     (verifies Clerk JWT on every /api/* request)
```

---

## Prerequisites

| Tool | Install |
|---|---|
| Node.js ≥ 18 | https://nodejs.org |
| Wrangler CLI | `npm install -g wrangler` |
| Clerk account | https://clerk.com (free) |
| Neon account | https://neon.tech (free) |
| Cloudflare account | https://cloudflare.com (free) |

---

## Step 1 — Install Dependencies

```bash
npm install @clerk/clerk-js @neondatabase/serverless jose svix
```

| Package | Used In |
|---|---|
| `@clerk/clerk-js` | Frontend — auth UI + JWT |
| `@neondatabase/serverless` | Cloudflare Functions — Neon HTTP driver |
| `jose` | Middleware — verify Clerk JWT (edge-compatible) |
| `svix` | Webhook handler — verify Clerk webhook signatures |

---

## Step 2 — Set Up Neon PostgreSQL

1. Go to [https://console.neon.tech](https://console.neon.tech) → **New Project**
2. Name it `aura`, choose a region
3. Click **SQL Editor** in the left nav
4. Paste the **entire** contents of [`neon_schema.sql`](./neon_schema.sql)
5. Click **Run** — you should see all tables created
6. Go to **Connection Details** → choose **Pooled connection**
7. Copy the connection string → paste as `DATABASE_URL` in your `.env`

**Connection string format:**
```
postgresql://aura_owner:password@ep-xxxx.us-east-1.aws.neon.tech/aura?sslmode=require
```

---

## Step 3 — Set Up Clerk

### Create Application
1. Go to [https://dashboard.clerk.com](https://dashboard.clerk.com) → **Add Application**
2. Name it `AURA`, choose **Email + Password** as auth method
3. Optionally enable **Google OAuth**

### Get API Keys
1. Go to **API Keys**
2. Copy **Publishable Key** → `VITE_CLERK_PUBLISHABLE_KEY` in `.env`
3. Copy **Frontend API URL** → `CLERK_FRONTEND_API_URL` in `.env`
   - Looks like: `your-subdomain.clerk.accounts.dev`

### Configure Clerk Webhook
1. Go to **Webhooks** → **Add Endpoint**
2. **URL**: `https://your-aura-app.pages.dev/api/webhooks/clerk`
   - (use your local tunnel during dev, e.g. `npx cloudflare tunnel`)
3. **Events to listen**: `user.created`, `user.updated`, `user.deleted`
4. Copy **Signing Secret** → `CLERK_WEBHOOK_SECRET` in `.env`

---

## Step 4 — Create Cloudflare R2 Bucket

```bash
# Authenticate with Cloudflare
wrangler login

# Create the bucket
wrangler r2 bucket create aura-attachments
```

In the Cloudflare Dashboard:
1. Go to **R2 → aura-attachments → Settings**
2. Enable **CORS policy** for your domain:
```json
[
  {
    "AllowedOrigins": ["https://your-aura-app.pages.dev", "http://localhost:8787"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Step 5 — Configure Environment Variables

```bash
cp .env.example .env
```

Fill in `.env`:
```ini
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
CLERK_FRONTEND_API_URL=your-subdomain.clerk.accounts.dev
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
DATABASE_URL=postgresql://user:pass@ep-xxxx.us-east-1.aws.neon.tech/aura?sslmode=require
```

---

## Step 6 — Wire Clerk Into app.js

At the **top** of `app.js`:

```js
import { clerkAuth, getToken } from './src/clerk_auth.js';
import { api, toAppReminder, startPolling } from './src/api_client.js';
```

Replace the `document.addEventListener('DOMContentLoaded', ...)` call at the bottom:

```js
document.addEventListener('DOMContentLoaded', async () => {
    await clerkAuth.init(
        async (user) => {
            // User is signed in — boot the app
            document.getElementById('auth-gate').style.display = 'none';
            document.querySelector('.app-layout').style.display = 'flex';
            clerkAuth.mountUserButton('user-button-container');
            updateGreeting(clerkAuth.getUserDisplayName());
            await initApp();
        },
        () => {
            // User is not signed in — show auth gate
            document.getElementById('auth-gate').style.display = 'flex';
            document.querySelector('.app-layout').style.display = 'none';
            clerkAuth.mountSignIn('clerk-sign-in-container');
        }
    );
});
```

### Replace `loadReminders()` in app.js:

```js
async function loadReminders() {
    try {
        const rows = await api.reminders.getAll();
        state.reminders = rows.map(toAppReminder);
        renderQueue();
        renderDateScroller();
        renderTimeline();
    } catch (e) {
        showToast('Could not load reminders from server.', 'error');
        console.error(e);
    }
}
```

### Replace `saveReminders()` — it's no longer needed as a bulk dump:

```js
// saveReminders() is replaced by per-operation API calls.
// Just update stats after changes:
function saveReminders() {
    updateStats();
}
```

### Replace reminder creation (in `simulateTextVoice` / voice handler):

```js
const parsedReminder = parseSpeechCommand(text);
try {
    const created = await api.reminders.create(toApiReminder(parsedReminder));
    state.reminders.push(toAppReminder(created));
    updateStats();
    renderQueue();
    renderTimeline();
} catch(e) {
    showToast('Failed to save reminder: ' + e.message, 'error');
}
```

### Replace delete handler (in `renderQueue`):

```js
btn.addEventListener('click', async (e) => {
    const id  = btn.getAttribute('data-id');
    const rem = state.reminders.find(r => r.id === id);
    if (!confirm(`Delete "${rem?.title}"? This cannot be undone.`)) return;
    try {
        await api.reminders.delete(id);
        state.reminders = state.reminders.filter(r => r.id !== id);
        renderQueue();
        renderTimeline();
    } catch(e) {
        showToast('Failed to delete: ' + e.message, 'error');
    }
});
```

### Enable polling-based realtime sync:

Add inside `initApp()` after `loadReminders()`:

```js
startPolling((rows) => {
    state.reminders = rows.map(toAppReminder);
    updateStats();
    renderQueue();
    renderTimeline();
}, 5000); // poll every 5 seconds
```

---

## Step 7 — Add Auth Gate to index.html

Add this **before** the `<div class="app-layout">`:

```html
<!-- Auth Gate (shown when logged out) -->
<div id="auth-gate" style="display:none; min-height:100vh; align-items:center; justify-content:center;">
    <div id="clerk-sign-in-container"></div>
</div>

<!-- User Button (shown when logged in, in header) -->
<div id="user-button-container"></div>
```

---

## Step 8 — Run Locally

```bash
# Start Vite dev server (frontend)
npm run dev

# In a second terminal — start Cloudflare Pages Functions locally
wrangler pages dev dist --binding DATABASE_URL="your-neon-url" \
    --binding CLERK_FRONTEND_API_URL="your-clerk-url" \
    --binding CLERK_WEBHOOK_SECRET="whsec_xxx" \
    --r2=R2_BUCKET=aura-attachments
```

Visit `http://localhost:8787`

---

## Step 9 — Deploy to Cloudflare Pages

### Option A: GitHub Integration (recommended)

1. Push your project to GitHub
2. Cloudflare Dashboard → **Pages** → **Create a project** → Connect GitHub
3. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Set **Environment Variables** (Functions secrets):
   - `DATABASE_URL`
   - `CLERK_FRONTEND_API_URL`
   - `CLERK_WEBHOOK_SECRET`

### Option B: Direct Deploy via CLI

```bash
npm run build
wrangler pages deploy dist --project-name=aura-assistant
```

Set secrets:
```bash
wrangler pages secret put DATABASE_URL
wrangler pages secret put CLERK_FRONTEND_API_URL
wrangler pages secret put CLERK_WEBHOOK_SECRET
```

---

## Step 10 — Update Clerk Webhook URL

After deploying, update your Clerk webhook endpoint to the production URL:
```
https://aura-assistant.pages.dev/api/webhooks/clerk
```

---

## Security Checklist

- [ ] `.env` is in `.gitignore` and NOT committed
- [ ] Neon connection uses `sslmode=require` in the URL
- [ ] All `/api/*` routes are protected by `_middleware.js` (Clerk JWT verification)
- [ ] R2 CORS policy only allows your production domain
- [ ] `CLERK_WEBHOOK_SECRET` is set as a secret (not plaintext) in CF Dashboard
- [ ] Neon project has IP allowlist enabled (in Neon Dashboard → Settings → IP Allow)
- [ ] Cloudflare Pages build uses `pk_live_` key (not `pk_test_`)

---

## File Reference

| File | Purpose |
|---|---|
| [`neon_schema.sql`](./neon_schema.sql) | Run once in Neon SQL Editor |
| [`wrangler.toml`](./wrangler.toml) | Cloudflare Pages + R2 config |
| [`functions/_middleware.js`](./functions/_middleware.js) | JWT auth guard for all /api/* |
| [`functions/api/reminders.js`](./functions/api/reminders.js) | Reminders CRUD |
| [`functions/api/notifications.js`](./functions/api/notifications.js) | Notifications log |
| [`functions/api/profile.js`](./functions/api/profile.js) | Profile, settings, GDPR export |
| [`functions/api/upload.js`](./functions/api/upload.js) | R2 presigned uploads |
| [`functions/api/webhooks/clerk.js`](./functions/api/webhooks/clerk.js) | Clerk user lifecycle sync |
| [`src/clerk_auth.js`](./src/clerk_auth.js) | Frontend Clerk integration |
| [`src/api_client.js`](./src/api_client.js) | Frontend → Functions API client |
| [`.env.example`](./.env.example) | Copy to `.env`, fill in keys |
