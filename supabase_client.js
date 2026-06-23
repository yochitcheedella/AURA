// =============================================================================
// AURA – Supabase Client & Data Layer (v1.3)
//
// This file replaces the localStorage-only data operations in app.js
// with real Supabase database reads/writes + Realtime subscriptions.
//
// HOW TO USE:
//   1. Run `npm install @supabase/supabase-js` in your project
//   2. Add your keys to .env (copy from .env.example)
//   3. Import this module at the top of app.js:
//        import { db, auth, subscribeToReminders } from './supabase_client.js';
//   4. Replace localStorage calls with the db.* methods below
// =============================================================================

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// 1. Initialize Supabase client
// ---------------------------------------------------------------------------
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.error(
        '[AURA] Supabase credentials missing. ' +
        'Create a .env file from .env.example and restart the dev server.'
    );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true        // handles OAuth redirects
    },
    realtime: {
        params: { eventsPerSecond: 10 }
    }
});


// =============================================================================
// 2. AUTH — sign up, sign in, sign out, password reset, session
// =============================================================================
export const auth = {

    /**
     * Sign up a new user with email + password.
     * Supabase will automatically send a confirmation email.
     * The `handle_new_user` DB trigger creates profile + settings rows.
     */
    async signUp(email, password, fullName) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        return data;
    },

    /**
     * Sign in with email + password.
     */
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    /**
     * Sign in with Google OAuth.
     * Configure the Google provider in Supabase Dashboard → Auth → Providers.
     */
    async signInWithGoogle() {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
        if (error) throw error;
        return data;
    },

    /**
     * Sign out the current user.
     */
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    /**
     * Send a password reset email.
     */
    async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) throw error;
    },

    /**
     * Get the currently authenticated user (null if not logged in).
     */
    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    /**
     * Get the current session.
     */
    async getSession() {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    /**
     * Listen for auth state changes (login, logout, token refresh).
     * @param {Function} callback - receives (event, session)
     */
    onAuthChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    }
};


// =============================================================================
// 3. DATABASE — reminders CRUD
// =============================================================================
export const db = {

    // -------------------------------------------------------------------------
    // REMINDERS
    // -------------------------------------------------------------------------

    /**
     * Fetch all reminders for the current user, sorted by scheduled_at.
     */
    async getReminders() {
        const { data, error } = await supabase
            .from('reminders')
            .select('*')
            .order('scheduled_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    /**
     * Fetch reminders for a specific date (user's local date).
     */
    async getRemindersForDate(dateStr) {
        // dateStr: 'YYYY-MM-DD'
        const start = new Date(dateStr + 'T00:00:00Z').toISOString();
        const end   = new Date(dateStr + 'T23:59:59Z').toISOString();
        const { data, error } = await supabase
            .from('reminders')
            .select('*')
            .gte('scheduled_at', start)
            .lte('scheduled_at', end)
            .order('scheduled_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    /**
     * Fetch active reminders that are overdue (scheduled_at <= now).
     */
    async getOverdueReminders() {
        const { data, error } = await supabase
            .from('reminders')
            .select('*')
            .eq('status', 'active')
            .lte('scheduled_at', new Date().toISOString())
            .order('scheduled_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    /**
     * Create a new reminder.
     * @param {Object} reminder - fields matching the reminders table
     */
    async createReminder(reminder) {
        const user = await auth.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('reminders')
            .insert({
                user_id:     user.id,
                title:       reminder.title,
                category:    reminder.category    || 'Personal',
                priority:    reminder.priority    || 'Low',
                scheduled_at: reminder.datetime   || reminder.scheduled_at,
                location:    reminder.location    || null,
                notes:       reminder.notes       || null,
                source:      reminder.source      || 'manual',
                calendar_synced: reminder.calendarSynced || false,
                status:      'active',
                sequence:    0
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Update a reminder by ID.
     */
    async updateReminder(id, updates) {
        const { data, error } = await supabase
            .from('reminders')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Mark a reminder as acknowledged (completed).
     */
    async acknowledgeReminder(id) {
        return db.updateReminder(id, { status: 'acknowledged' });
    },

    /**
     * Snooze a reminder by N minutes.
     */
    async snoozeReminder(id, minutes = 5) {
        const newTime = new Date(Date.now() + minutes * 60000).toISOString();
        return db.updateReminder(id, {
            status:       'snoozed',
            snoozed_until: newTime,
            scheduled_at: newTime
        });
    },

    /**
     * Delete a reminder permanently.
     */
    async deleteReminder(id) {
        const { error } = await supabase
            .from('reminders')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // -------------------------------------------------------------------------
    // NOTIFICATIONS
    // -------------------------------------------------------------------------

    /**
     * Log a notification event (called when an alarm fires).
     */
    async logNotification(reminderId, title, body, type = 'alarm') {
        const user = await auth.getCurrentUser();
        if (!user) return;

        const { error } = await supabase
            .from('notifications')
            .insert({
                user_id:     user.id,
                reminder_id: reminderId,
                title,
                body,
                type
            });
        if (error) console.error('[AURA] Failed to log notification:', error.message);
    },

    /**
     * Fetch unread notifications for the current user.
     */
    async getUnreadNotifications() {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('is_read', false)
            .order('delivered_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data;
    },

    /**
     * Mark a notification as read.
     */
    async markNotificationRead(id) {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    /**
     * Mark ALL notifications as read for the current user.
     */
    async markAllNotificationsRead() {
        const user = await auth.getCurrentUser();
        if (!user) return;
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('is_read', false);
        if (error) throw error;
    },

    // -------------------------------------------------------------------------
    // PROFILE & SETTINGS
    // -------------------------------------------------------------------------

    /**
     * Get the current user's profile.
     */
    async getProfile() {
        const user = await auth.getCurrentUser();
        if (!user) return null;
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Update the current user's profile.
     */
    async updateProfile(updates) {
        const user = await auth.getCurrentUser();
        if (!user) throw new Error('Not authenticated');
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Get user settings.
     */
    async getSettings() {
        const user = await auth.getCurrentUser();
        if (!user) return null;
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Update user settings.
     */
    async updateSettings(updates) {
        const user = await auth.getCurrentUser();
        if (!user) throw new Error('Not authenticated');
        const { data, error } = await supabase
            .from('user_settings')
            .update(updates)
            .eq('user_id', user.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // -------------------------------------------------------------------------
    // GDPR — Data Export & Erasure
    // -------------------------------------------------------------------------

    /**
     * Export all user data as a JSON blob (GDPR Article 15 — Right of Access).
     */
    async exportUserData() {
        const [profile, reminders, notifications, settings] = await Promise.all([
            db.getProfile(),
            db.getReminders(),
            db.getUnreadNotifications(),
            db.getSettings()
        ]);
        return { profile, reminders, notifications, settings, exported_at: new Date().toISOString() };
    },

    /**
     * Delete all user data + auth account (GDPR Article 17 — Right to Erasure).
     * This calls a Supabase Edge Function that handles cascaded deletion.
     */
    async eraseAccount() {
        const { error } = await supabase.functions.invoke('erase-account');
        if (error) throw error;
    }
};


// =============================================================================
// 4. REALTIME SUBSCRIPTIONS
// =============================================================================

/**
 * Subscribe to live changes on the reminders table for the current user.
 * Returns the channel (call channel.unsubscribe() to clean up).
 *
 * Usage in app.js:
 *   const channel = await subscribeToReminders(({ event, reminder }) => {
 *       if (event === 'INSERT' || event === 'UPDATE') { ... }
 *       if (event === 'DELETE') { ... }
 *   });
 */
export async function subscribeToReminders(onChangeCallback) {
    const user = await auth.getCurrentUser();
    if (!user) return null;

    const channel = supabase
        .channel(`reminders:${user.id}`)
        .on(
            'postgres_changes',
            {
                event:  '*',
                schema: 'public',
                table:  'reminders',
                filter: `user_id=eq.${user.id}`
            },
            (payload) => {
                onChangeCallback({
                    event:    payload.eventType,    // INSERT | UPDATE | DELETE
                    reminder: payload.new || payload.old
                });
            }
        )
        .subscribe();

    return channel;
}

/**
 * Subscribe to live notification events for the current user.
 */
export async function subscribeToNotifications(onNotificationCallback) {
    const user = await auth.getCurrentUser();
    if (!user) return null;

    const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
            'postgres_changes',
            {
                event:  'INSERT',
                schema: 'public',
                table:  'notifications',
                filter: `user_id=eq.${user.id}`
            },
            (payload) => {
                onNotificationCallback(payload.new);
            }
        )
        .subscribe();

    return channel;
}


// =============================================================================
// 5. UTILITY — map Supabase reminder row → app.js state shape
// =============================================================================

/**
 * Convert a Supabase DB row to the shape used internally by app.js.
 */
export function toAppReminder(row) {
    return {
        id:             row.id,
        title:          row.title,
        category:       row.category,
        priority:       row.priority,
        datetime:       row.scheduled_at,   // legacy key used in app.js
        status:         row.status,
        sequence:       row.sequence,
        location:       row.location  || '',
        calendarSynced: row.calendar_synced,
        source:         row.source,
        createdTime:    row.created_at
    };
}

/**
 * Convert the app.js internal reminder shape back to a Supabase insert/update object.
 */
export function toDbReminder(appReminder) {
    return {
        title:          appReminder.title,
        category:       appReminder.category,
        priority:       appReminder.priority,
        scheduled_at:   appReminder.datetime,
        status:         appReminder.status,
        sequence:       appReminder.sequence,
        location:       appReminder.location || null,
        calendar_synced: appReminder.calendarSynced || false,
        source:         appReminder.source || 'manual'
    };
}
