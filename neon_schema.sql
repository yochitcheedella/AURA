-- ===========================================================================
-- AURA – AI Unified Reminder Assistant
-- Neon PostgreSQL Schema (v2.0)
--
-- Stack: Cloudflare Pages + Neon (PostgreSQL) + Cloudflare R2 + Clerk Auth
--
-- Run this in: Neon Console → SQL Editor
-- Or via:  psql $DATABASE_URL -f neon_schema.sql
-- ===========================================================================

-- Extension: UUID generation (available by default in Neon)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================================================
-- NOTE ON AUTH
-- Users are identified by their Clerk user_id (text, e.g. "user_2abc123...")
-- There is NO auth.users table — Clerk manages authentication externally.
-- Row ownership is enforced in the API layer (Cloudflare Pages Functions)
-- by verifying the Clerk JWT and injecting the userId server-side.
-- ===========================================================================


-- ===========================================================================
-- 1. PROFILES TABLE
-- ===========================================================================
CREATE TABLE IF NOT EXISTS profiles (
    clerk_user_id       TEXT        PRIMARY KEY,
    full_name           TEXT        NOT NULL DEFAULT '',
    email               TEXT        NOT NULL DEFAULT '',
    avatar_url          TEXT,
    timezone            TEXT        NOT NULL DEFAULT 'UTC',
    notification_pref   TEXT        NOT NULL DEFAULT 'all'
                                    CHECK (notification_pref IN ('all', 'critical_only', 'none')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'User profile data keyed by Clerk user ID';


-- ===========================================================================
-- 2. REMINDERS TABLE
-- ===========================================================================
CREATE TABLE IF NOT EXISTS reminders (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   TEXT        NOT NULL REFERENCES profiles(clerk_user_id) ON DELETE CASCADE,

    -- Content
    title           TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
    category        TEXT        NOT NULL DEFAULT 'Personal'
                                CHECK (category IN ('Meeting', 'Medicine', 'Assignment', 'Personal')),
    priority        TEXT        NOT NULL DEFAULT 'Low'
                                CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    location        TEXT,
    notes           TEXT,

    -- Scheduling
    scheduled_at    TIMESTAMPTZ NOT NULL,
    recurrence      TEXT        DEFAULT 'none'
                                CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    recurrence_end  TIMESTAMPTZ,

    -- Status & Escalation
    status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'acknowledged', 'snoozed', 'expired')),
    sequence        INTEGER     NOT NULL DEFAULT 0,
    snoozed_until   TIMESTAMPTZ,

    -- Integrations
    calendar_synced     BOOLEAN NOT NULL DEFAULT FALSE,
    calendar_event_id   TEXT,
    r2_attachment_key   TEXT,       -- Cloudflare R2 object key (voice recording etc.)
    source              TEXT        NOT NULL DEFAULT 'manual'
                                    CHECK (source IN ('manual', 'voice', 'whatsapp')),

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reminders_user        ON reminders(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled   ON reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status      ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_active_user ON reminders(clerk_user_id, scheduled_at)
    WHERE status = 'active';


-- ===========================================================================
-- 3. NOTIFICATIONS TABLE
-- ===========================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   TEXT        NOT NULL REFERENCES profiles(clerk_user_id) ON DELETE CASCADE,
    reminder_id     UUID        REFERENCES reminders(id) ON DELETE SET NULL,

    title           TEXT        NOT NULL,
    body            TEXT        NOT NULL,
    type            TEXT        NOT NULL DEFAULT 'alarm'
                                CHECK (type IN ('alarm', 'escalation', 'system', 'summary')),
    is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user        ON notifications(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread      ON notifications(clerk_user_id, is_read)
    WHERE is_read = FALSE;


-- ===========================================================================
-- 4. USER_SETTINGS TABLE
-- ===========================================================================
CREATE TABLE IF NOT EXISTS user_settings (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id               TEXT        UNIQUE NOT NULL
                                            REFERENCES profiles(clerk_user_id) ON DELETE CASCADE,
    theme                       TEXT        NOT NULL DEFAULT 'dark'
                                            CHECK (theme IN ('dark', 'light')),
    voice_language              TEXT        NOT NULL DEFAULT 'en-US',
    escalation_interval_minutes INTEGER     NOT NULL DEFAULT 5,
    daily_briefing_time         TIME        DEFAULT '08:00',
    calendar_type               TEXT        CHECK (calendar_type IN ('google', 'outlook', 'none')),
    calendar_token              TEXT,
    r2_voice_storage_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ===========================================================================
-- 5. CALENDAR_EVENTS TABLE
-- ===========================================================================
CREATE TABLE IF NOT EXISTS calendar_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   TEXT        NOT NULL REFERENCES profiles(clerk_user_id) ON DELETE CASCADE,
    reminder_id     UUID        REFERENCES reminders(id) ON DELETE SET NULL,

    external_id     TEXT        NOT NULL,
    calendar_type   TEXT        NOT NULL CHECK (calendar_type IN ('google', 'outlook')),
    title           TEXT        NOT NULL,
    start_at        TIMESTAMPTZ NOT NULL,
    end_at          TIMESTAMPTZ,
    location        TEXT,
    sync_status     TEXT        NOT NULL DEFAULT 'synced'
                                CHECK (sync_status IN ('synced', 'pending', 'failed')),
    last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cal_external_user
    ON calendar_events(clerk_user_id, external_id);


-- ===========================================================================
-- 6. R2 ATTACHMENTS TABLE (tracks files uploaded to Cloudflare R2)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS r2_attachments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   TEXT        NOT NULL REFERENCES profiles(clerk_user_id) ON DELETE CASCADE,
    reminder_id     UUID        REFERENCES reminders(id) ON DELETE CASCADE,
    r2_key          TEXT        NOT NULL UNIQUE,   -- e.g. "user_abc/voice/2026-06-23-123.webm"
    file_name       TEXT,
    content_type    TEXT,
    size_bytes      BIGINT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ===========================================================================
-- 7. TRIGGERS — auto-update updated_at
-- ===========================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['profiles', 'reminders', 'user_settings']
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_updated ON %s;
             CREATE TRIGGER trg_%s_updated
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            t, t, t, t
        );
    END LOOP;
END;
$$;


-- ===========================================================================
-- 8. HELPER FUNCTIONS
-- ===========================================================================

-- Returns today's schedule for a user
CREATE OR REPLACE FUNCTION get_todays_schedule(p_user_id TEXT)
RETURNS SETOF reminders AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM reminders
    WHERE clerk_user_id = p_user_id
      AND DATE(scheduled_at AT TIME ZONE 'UTC') = CURRENT_DATE
    ORDER BY scheduled_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Escalate overdue active reminders (called by cron / scheduled worker)
CREATE OR REPLACE FUNCTION escalate_overdue_reminders()
RETURNS INTEGER AS $$
DECLARE escalated INTEGER := 0;
BEGIN
    UPDATE reminders
    SET
        sequence     = sequence + 1,
        scheduled_at = NOW() + CASE
            WHEN priority IN ('Critical', 'High') THEN INTERVAL '2 minutes'
            ELSE INTERVAL '5 minutes'
        END,
        updated_at   = NOW()
    WHERE
        status       = 'active'
        AND scheduled_at <= NOW()
        AND sequence    < 10;   -- hard cap

    GET DIAGNOSTICS escalated = ROW_COUNT;
    RETURN escalated;
END;
$$ LANGUAGE plpgsql;

-- Auto-provision profile + settings for a new Clerk user
-- Called from Clerk webhook handler (Cloudflare Pages Function)
CREATE OR REPLACE FUNCTION provision_new_user(
    p_clerk_user_id TEXT,
    p_full_name     TEXT,
    p_email         TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO profiles (clerk_user_id, full_name, email)
    VALUES (p_clerk_user_id, p_full_name, p_email)
    ON CONFLICT (clerk_user_id) DO NOTHING;

    INSERT INTO user_settings (clerk_user_id)
    VALUES (p_clerk_user_id)
    ON CONFLICT (clerk_user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;


-- ===========================================================================
-- DONE
-- Tables:     profiles, reminders, notifications, user_settings,
--             calendar_events, r2_attachments
-- Triggers:   set_updated_at on profiles, reminders, user_settings
-- Functions:  get_todays_schedule, escalate_overdue_reminders,
--             provision_new_user
-- NOTE:       No RLS needed — row ownership is enforced in the API layer
--             (Cloudflare Pages Functions verify the Clerk JWT server-side)
-- ===========================================================================
