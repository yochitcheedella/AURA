# AURA — Supabase Backend Setup Guide

Complete step-by-step guide to connect AURA to a real Supabase backend with authentication, database, and realtime.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| A [Supabase](https://supabase.com) account | Free tier works |

---

## Step 1 — Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click **New Project**
3. Choose an organization, name it `aura-assistant`, pick a region close to your users
4. Set a strong database password (save it — you won't see it again)
5. Wait ~2 minutes for the project to provision

---

## Step 2 — Run the Database Schema

1. In your Supabase project → click **SQL Editor** in the left sidebar
2. Click **+ New query**
3. Open [supabase_schema.sql](./supabase_schema.sql) in this project
4. Paste the **entire** contents into the SQL Editor
5. Click **Run** (green button)
6. You should see: `Success. No rows returned`

This creates:

| Object | Description |
|---|---|
| `profiles` | User profile (auto-created on signup) |
| `reminders` | All voice/manual reminder records |
| `notifications` | Alarm delivery log |
| `user_settings` | Per-user config (theme, escalation interval, etc.) |
| `calendar_events` | Synced Google/Outlook calendar mirror |
| `handle_new_user()` | Trigger: auto-creates profile on signup |
| `set_updated_at()` | Trigger: keeps `updated_at` accurate |
| `escalate_overdue_reminders()` | Function: bumps overdue reminders |
| RLS Policies | All tables locked to `auth.uid() = user_id` |
| Realtime | `reminders` + `notifications` tables published |

---

## Step 3 — Get Your API Keys

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon / public key** → a long JWT string

---

## Step 4 — Configure Environment Variables

```bash
# In your project root, copy the template:
copy .env.example .env
```

Open `.env` and fill in your real values:

```ini
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key
```

> **IMPORTANT**: Never commit `.env` to git. It is already listed in `.gitignore`.

---

## Step 5 — Install the Supabase JS SDK

```bash
npm install @supabase/supabase-js
```

---

## Step 6 — Wire the Client into app.js

At the **top** of `app.js`, add the import:

```js
import { supabase, auth, db, subscribeToReminders, toAppReminder } from './supabase_client.js';
```

Then replace the localStorage operations with the real DB calls:

### Replace `loadReminders()`

```js
// OLD (localStorage)
function loadReminders() {
    const raw = localStorage.getItem('aura_reminders');
    state.reminders = raw ? JSON.parse(raw) : [];
}

// NEW (Supabase)
async function loadReminders() {
    try {
        const rows = await db.getReminders();
        state.reminders = rows.map(toAppReminder);
    } catch (e) {
        console.error('Failed to load reminders:', e);
        showToast('Could not load reminders from server.', 'error');
    }
}
```

### Replace `saveReminders()`

```js
// OLD (localStorage)
function saveReminders() {
    localStorage.setItem('aura_reminders', JSON.stringify(state.reminders));
    updateStats();
}

// NEW (Supabase — saving happens per-operation, not as a bulk dump)
// Call db.createReminder(), db.updateReminder(), db.deleteReminder() directly.
// saveReminders() can now just call updateStats():
function saveReminders() {
    updateStats();
}
```

### Replace the reminder create call in `parseSpeechCommand` result handling

```js
// After building parsedReminder:
const dbRecord = await db.createReminder(parsedReminder);
parsedReminder.id = dbRecord.id;   // use the real UUID from Supabase
state.reminders.push(toAppReminder(dbRecord));
updateStats();
```

### Enable Realtime sync

Add inside `initApp()` after `loadReminders()`:

```js
subscribeToReminders(({ event, reminder }) => {
    if (event === 'UPDATE' || event === 'INSERT') {
        const idx = state.reminders.findIndex(r => r.id === reminder.id);
        const mapped = toAppReminder(reminder);
        if (idx >= 0) state.reminders[idx] = mapped;
        else state.reminders.push(mapped);
    }
    if (event === 'DELETE') {
        state.reminders = state.reminders.filter(r => r.id !== reminder.id);
    }
    renderQueue();
    renderTimeline();
});
```

---

## Step 7 — Enable Authentication

### Configure Email Auth (already on by default)

Go to **Supabase Dashboard → Authentication → Providers → Email**
- ✅ Enable email provider
- Set **Confirm email**: Enabled (recommended for production)

### Add a Sign-In / Sign-Up UI

Create a minimal auth gate in `index.html` before the main `app-layout`:

```html
<!-- Auth Gate (shown when user not logged in) -->
<div id="auth-gate" class="auth-gate">
    <div class="glass-card auth-card">
        <h1>AURA</h1>
        <p>Your AI Voice-First Secretary</p>
        <input type="email" id="auth-email" placeholder="Email address">
        <input type="password" id="auth-password" placeholder="Password">
        <button id="signin-btn" class="btn btn-primary w-full">Sign In</button>
        <button id="signup-btn" class="btn btn-ghost w-full">Create Account</button>
        <button id="forgot-btn" class="btn btn-ghost w-full">Forgot Password</button>
    </div>
</div>
```

Wire it up in `app.js`:

```js
async function setupAuth() {
    const session = await auth.getSession();
    if (session) {
        showApp();
    } else {
        showAuthGate();
    }

    auth.onAuthChange((event, session) => {
        if (session) showApp();
        else showAuthGate();
    });

    document.getElementById('signin-btn').addEventListener('click', async () => {
        const email    = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        try {
            await auth.signIn(email, password);
        } catch (e) {
            showToast(e.message, 'error');
        }
    });

    document.getElementById('signup-btn').addEventListener('click', async () => {
        const email    = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        try {
            await auth.signUp(email, password, 'AURA User');
            showToast('Check your email to confirm your account.', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

function showApp()      { document.getElementById('auth-gate').style.display = 'none';  document.querySelector('.app-layout').style.display = 'flex'; }
function showAuthGate() { document.getElementById('auth-gate').style.display = 'flex';  document.querySelector('.app-layout').style.display = 'none'; }
```

---

## Step 8 — Enable Realtime in Supabase Dashboard

1. Go to **Database → Replication**
2. Confirm `reminders` and `notifications` appear under **supabase_realtime** publication
3. If not, run in SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

---

## Step 9 — (Optional) Enable Browser Push Notifications via Edge Function

To trigger server-side push notifications when a reminder fires (even when browser is closed), you need a Supabase Edge Function + Web Push:

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize edge functions
supabase functions new send-notification
```

Inside `supabase/functions/send-notification/index.ts`:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// Use web-push library to send to stored subscription endpoints
// Store push subscriptions in a `push_subscriptions` table
```

---

## Step 10 — (Optional) Auto-Escalate via pg_cron

To run server-side escalation (for notifications even when the user's browser is closed):

1. Enable `pg_cron` extension in Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

2. Schedule the escalation function every 60 seconds:
```sql
SELECT cron.schedule(
    'aura-escalate-reminders',
    '* * * * *',           -- every 1 minute (cron minimum)
    $$ SELECT public.escalate_overdue_reminders(); $$
);
```

---

## Step 11 — Production Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel --prod
```

Set environment variables in Vercel Dashboard → Project → Settings → Environment Variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SENTRY_DSN` (optional)

### Netlify

```bash
npm run build
# Drag-and-drop the `dist/` folder to netlify.com/drop
```

Or connect your GitHub repo → Netlify auto-deploys on push.

---

## Security Checklist Before Going Live

- [ ] RLS is enabled on all tables (`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'`)
- [ ] Anon key in frontend is the **anon** key (not the `service_role` secret key)
- [ ] `.env` is in `.gitignore` and not committed
- [ ] Email confirmation is enabled in Supabase Auth settings
- [ ] HTTPS is enforced (automatic on Vercel/Netlify)
- [ ] Supabase project has a custom domain or RLS blocks cross-project access

---

## Entity Relationship Diagram

```
auth.users (Supabase managed)
     │
     │ 1:1 (trigger: handle_new_user)
     ▼
profiles ──────────── user_settings
     │  1:1
     │
     │ 1:N
     ▼
reminders ────────── notifications
     │  1:N               │  N:1
     │                    │
     │ 1:1 (optional)     │
     ▼                    │
calendar_events ◄─────────
```

---

## File Reference

| File | Purpose |
|---|---|
| [supabase_schema.sql](./supabase_schema.sql) | Run once in Supabase SQL Editor |
| [supabase_client.js](./supabase_client.js) | Import in app.js — auth, db, realtime |
| [.env.example](./.env.example) | Copy to `.env`, fill in keys |
| [app.js](./app.js) | Main app logic (wire in supabase_client.js) |
