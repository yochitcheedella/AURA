-- ===========================================================================
-- AURA – AI Unified Reminder Assistant
-- Supabase PostgreSQL Schema (v1.0)
-- Run this entire file in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ===========================================================================


-- ===========================================================================
-- EXTENSIONS
-- ===========================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ===========================================================================
-- 1. PROFILES TABLE
--    Extends Supabase auth.users. One row per registered user.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       TEXT        NOT NULL DEFAULT '',
    email           TEXT        NOT NULL DEFAULT '',
    avatar_url      TEXT,
    timezone        TEXT        NOT NULL DEFAULT 'UTC',
    notification_preference TEXT NOT NULL DEFAULT 'all'  -- 'all' | 'critical_only' | 'none'
                              CHECK (notification_preference IN ('all', 'critical_only', 'none')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Extended user profile data beyond auth.users';


-- ===========================================================================
-- 2. REMINDERS TABLE
--    Core reminder / task records created via voice or manual input.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.reminders (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

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
    recurrence      TEXT        CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    recurrence_end  TIMESTAMPTZ,

    -- Status & Escalation
    status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'acknowledged', 'snoozed', 'expired')),
    sequence        INTEGER     NOT NULL DEFAULT 0,        -- escalation counter
    snoozed_until   TIMESTAMPTZ,

    -- Integration flags
    calendar_synced BOOLEAN     NOT NULL DEFAULT FALSE,
    calendar_event_id TEXT,                               -- Google / Outlook event ID
    source          TEXT        NOT NULL DEFAULT 'manual' -- 'manual' | 'voice' | 'whatsapp'
                                CHECK (source IN ('manual', 'voice', 'whatsapp')),

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.reminders IS 'All reminders/tasks created by users via voice or manual entry';

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_reminders_user_id         ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_at    ON public.reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status          ON public.reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_user_scheduled  ON public.reminders(user_id, scheduled_at)
    WHERE status = 'active';


-- ===========================================================================
-- 3. NOTIFICATIONS TABLE
--    Log of all alarm events fired and their delivery status.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reminder_id     UUID        REFERENCES public.reminders(id) ON DELETE SET NULL,

    title           TEXT        NOT NULL,
    body            TEXT        NOT NULL,
    type            TEXT        NOT NULL DEFAULT 'alarm'
                                CHECK (type IN ('alarm', 'escalation', 'system', 'summary')),
    is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS 'Alarm delivery log and read-status tracking per user';

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread      ON public.notifications(user_id, is_read)
    WHERE is_read = FALSE;


-- ===========================================================================
-- 4. USER_SETTINGS TABLE
--    Per-user application preferences (API keys, theme, etc.)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Third-party integration tokens (encrypted at rest via Supabase Vault ideally)
    sentry_dsn      TEXT,
    calendar_token  TEXT,       -- OAuth token for Google/Outlook calendar
    calendar_type   TEXT        CHECK (calendar_type IN ('google', 'outlook', 'none')),

    -- App preferences
    theme           TEXT        NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    voice_language  TEXT        NOT NULL DEFAULT 'en-US',
    escalation_interval_minutes INTEGER NOT NULL DEFAULT 5,
    daily_briefing_time TIME    DEFAULT '08:00',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_settings IS 'Per-user application configuration and integration tokens';


-- ===========================================================================
-- 5. CALENDAR_EVENTS TABLE
--    Mirror of synced calendar events for cross-reference.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reminder_id     UUID        REFERENCES public.reminders(id) ON DELETE SET NULL,

    external_id     TEXT        NOT NULL,        -- Google/Outlook event ID
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_cal_external_user ON public.calendar_events(user_id, external_id);


-- ===========================================================================
-- 6. TRIGGERS — auto-update `updated_at` timestamps
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['profiles', 'reminders', 'user_settings']
    LOOP
        EXECUTE format(
            'CREATE OR REPLACE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON public.%s
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            t, t
        );
    END LOOP;
END;
$$;


-- ===========================================================================
-- 7. TRIGGER — auto-create profile + settings on new user signup
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create profile row
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;

    -- Create default settings row
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===========================================================================
-- 8. FUNCTION — Escalate overdue active reminders
--    Called by a pg_cron job (or Edge Function) every 60 seconds.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.escalate_overdue_reminders()
RETURNS INTEGER AS $$
DECLARE
    escalated_count INTEGER := 0;
BEGIN
    UPDATE public.reminders
    SET
        sequence   = sequence + 1,
        -- High/Critical escalate every 2 min, others every 5 min
        scheduled_at = NOW() + CASE
            WHEN priority IN ('Critical', 'High') THEN INTERVAL '2 minutes'
            ELSE INTERVAL '5 minutes'
        END,
        updated_at = NOW()
    WHERE
        status       = 'active'
        AND scheduled_at <= NOW()
        AND sequence    < 10;  -- hard cap at 10 escalations

    GET DIAGNOSTICS escalated_count = ROW_COUNT;
    RETURN escalated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.escalate_overdue_reminders IS
    'Bump sequence and reschedule overdue active reminders. Run via pg_cron every minute.';


-- ===========================================================================
-- 9. FUNCTION — fetch today's schedule for a user
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_todays_schedule(p_user_id UUID)
RETURNS SETOF public.reminders AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.reminders
    WHERE
        user_id = p_user_id
        AND DATE(scheduled_at AT TIME ZONE 'UTC') = CURRENT_DATE
    ORDER BY scheduled_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===========================================================================
-- 10. ROW LEVEL SECURITY — Enable on all tables
-- ===========================================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events  ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- 11. RLS POLICIES
-- ===========================================================================

-- ---- profiles ----
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);


-- ---- reminders ----
DROP POLICY IF EXISTS "Users can view own reminders"   ON public.reminders;
DROP POLICY IF EXISTS "Users can insert own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;

CREATE POLICY "Users can view own reminders"
    ON public.reminders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders"
    ON public.reminders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
    ON public.reminders FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders"
    ON public.reminders FOR DELETE
    USING (auth.uid() = user_id);


-- ---- notifications ----
DROP POLICY IF EXISTS "Users can view own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);


-- ---- user_settings ----
DROP POLICY IF EXISTS "Users can view own settings"   ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;

CREATE POLICY "Users can view own settings"
    ON public.user_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
    ON public.user_settings FOR UPDATE
    USING (auth.uid() = user_id);


-- ---- calendar_events ----
DROP POLICY IF EXISTS "Users can view own calendar events"   ON public.calendar_events;
DROP POLICY IF EXISTS "Users can insert own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can update own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can delete own calendar events" ON public.calendar_events;

CREATE POLICY "Users can view own calendar events"
    ON public.calendar_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar events"
    ON public.calendar_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar events"
    ON public.calendar_events FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar events"
    ON public.calendar_events FOR DELETE
    USING (auth.uid() = user_id);


-- ===========================================================================
-- 12. REALTIME — Enable publication for live sync
-- ===========================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ===========================================================================
-- DONE
-- ===========================================================================
-- Tables:      profiles, reminders, notifications, user_settings, calendar_events
-- Triggers:    set_updated_at, handle_new_user (auto-profile on signup)
-- Functions:   escalate_overdue_reminders(), get_todays_schedule(uuid)
-- RLS:         Enabled on all tables — users access only their own rows
-- Realtime:    reminders + notifications published for live subscriptions
-- ===========================================================================
