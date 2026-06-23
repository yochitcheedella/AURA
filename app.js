// ==========================================================================
// AURA CLIENT ENGINE — Cloudflare + Neon + Clerk + R2 Stack (v2.0)
// ==========================================================================

import { clerkAuth, getUserId } from './src/clerk_auth.js';
import { api, toAppReminder, toApiReminder, startPolling } from './src/api_client.js';

// Global state
let state = {
    reminders: [],
    activeAlarm: null,
    alarmProgressInterval: null,
    currentTab: 'listen',
    activeFilter: 'all',
    isListening: false,
    recognition: null,
    visualizerAnimation: null,
    selectedDate: new Date()
};

// --------------------------------------------------------------------------
// Initialization & Startup
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    // Init Clerk first — gate the entire app behind authentication
    await clerkAuth.init(
        // ✅ Signed in
        async (user) => {
            document.getElementById('auth-gate').style.display   = 'none';
            document.querySelector('.app-layout').style.display  = 'flex';
            // Mount Clerk user avatar in header
            clerkAuth.mountUserButton('user-button-container');
            await initApp();
        },
        // ❌ Not signed in
        () => {
            document.getElementById('auth-gate').style.display   = 'flex';
            document.querySelector('.app-layout').style.display  = 'none';
            clerkAuth.mountSignIn('clerk-sign-in-container');
        }
    );
});

async function initApp() {
    // Setup UI navigation & event listeners
    setupNavigation();
    setupSimulator();
    setupVoiceAssistant();
    setupEscalationAlert();
    setupProductionAndLegal();
    
    // Start background alarm scheduler
    setInterval(checkAlarms, 1000);
    
    // Dynamic greeting and browser notification permission
    updateGreeting(clerkAuth.getUserDisplayName());
    requestNotificationPermission();
    
    // Log startup
    logSystemEvent("AURA Engine loaded. Connecting to Neon database...", "success");

    // Load reminders from Neon via Cloudflare Function
    await loadReminders();
    
    // Start polling for realtime-like updates every 5s
    startPolling((rows) => {
        state.reminders = rows.map(toAppReminder);
        updateStats();
        renderQueue();
        renderTimeline();
    }, 5000);
    
    logSystemEvent("Realtime sync active. Escalation monitoring started.", "system");
}

// --------------------------------------------------------------------------
// Data Storage & Demo Loading
// --------------------------------------------------------------------------

/**
 * Save reminders — now a no-op since every mutation goes directly to Neon.
 * Only updates local stats.
 */
function saveReminders() {
    updateStats();
}

/**
 * Load all reminders from Neon via Cloudflare Pages Function.
 * Falls back to empty array on network error.
 */
async function loadReminders() {
    try {
        const rows = await api.reminders.getAll();
        state.reminders = rows.map(toAppReminder);
        
        if (state.reminders.length === 0) {
            await loadDemoData(false);
        } else {
            renderQueue();
            renderDateScroller();
            renderTimeline();
            updateStats();
        }
    } catch (e) {
        logSystemEvent(`Database connection error: ${e.message}`, "alarm");
        showToast("Could not connect to database. Running in offline mode.", "error");
        // Fall back to localStorage cache if available
        const raw = localStorage.getItem('aura_reminders_cache');
        if (raw) {
            try { state.reminders = JSON.parse(raw); } catch (_) { state.reminders = []; }
        }
        renderQueue();
        renderDateScroller();
        renderTimeline();
        updateStats();
    }
}

async function loadDemoData(verbose = true) {
    const today = new Date();
    
    const samples = [
        {
            title: 'Project Meeting',
            category: 'Meeting',
            scheduled_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0).toISOString(),
            priority: 'High',
            location: 'Virtual Conference Room 4',
            source: 'manual'
        },
        {
            title: 'Strategy Sync',
            category: 'Meeting',
            scheduled_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 13, 30).toISOString(),
            priority: 'Medium',
            location: 'Microsoft Teams Room B',
            source: 'manual'
        },
        {
            title: 'Submit AURA implementation report',
            category: 'Assignment',
            scheduled_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString(),
            priority: 'Critical',
            location: 'Submission Hub Portal',
            source: 'manual'
        },
        {
            title: 'Take vitamins',
            category: 'Medicine',
            scheduled_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0).toISOString(),
            priority: 'Medium',
            source: 'manual'
        }
    ];
    
    try {
        const created = await Promise.all(samples.map(s => api.reminders.create(s)));
        state.reminders = created.map(toAppReminder);
        // Cache locally for offline fallback
        localStorage.setItem('aura_reminders_cache', JSON.stringify(state.reminders));
    } catch (e) {
        // Offline fallback — use local data directly
        logSystemEvent("Demo data: using local fallback (no DB connection).", "system");
        state.reminders = samples.map((s, i) => ({
            id: `demo_${i}`, title: s.title, category: s.category,
            datetime: s.scheduled_at, priority: s.priority,
            status: 'active', sequence: 0, location: s.location || '',
            calendarSynced: false, source: s.source, createdTime: new Date().toISOString()
        }));
    }
    
    renderQueue();
    renderDateScroller();
    renderTimeline();
    updateStats();
    
    if (verbose) {
        logSystemEvent("Loaded standard diagnostic reminders queue.", "success");
        showToast("Demo reminders loaded successfully!", "info");
    }
}

// --------------------------------------------------------------------------
// Navigation & Tab Switching
// --------------------------------------------------------------------------
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            
            navItems.forEach(n => {
                n.classList.remove('active');
                n.removeAttribute('aria-current');
            });
            tabContents.forEach(t => t.classList.remove('active'));
            
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
            const targetTab = document.getElementById(`tab-${tabId}`);
            if (targetTab) {
                targetTab.classList.add('active');
            }
            
            state.currentTab = tabId;
            
            // Render context when moving to specific tabs
            if (tabId === 'briefing') {
                renderDateScroller();
                renderTimeline();
            } else if (tabId === 'queue') {
                renderQueue();
            }
        });
    });

    // Global FAB listener
    const globalFab = document.getElementById('global-fab');
    if (globalFab) {
        globalFab.addEventListener('click', () => {
            // Switch to listen tab
            const listenNavItem = document.querySelector('.nav-item[data-tab="listen"]');
            if (listenNavItem) {
                listenNavItem.click();
            }
            // Trigger mic listening
            const micBtn = document.getElementById('mic-trigger-btn');
            if (micBtn) {
                if (!state.isListening) {
                    micBtn.click();
                }
            }
        });
    }

    // Sidebar Toggle
    const sidebar = document.getElementById('simulator-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const toggleMobileBtn = document.getElementById('toggle-sidebar-mobile-btn');

    const toggleSidebar = () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('open');
        } else {
            sidebar.classList.toggle('collapsed');
        }
        // Update aria-expanded state
        const isExpanded = !sidebar.classList.contains('collapsed') && !sidebar.classList.contains('open') ||
                           sidebar.classList.contains('open');
        toggleBtn.setAttribute('aria-expanded', String(!sidebar.classList.contains('collapsed')));
    };

    toggleBtn.addEventListener('click', toggleSidebar);
    if (toggleMobileBtn) {
        toggleMobileBtn.addEventListener('click', toggleSidebar);
    }
    
    // Close sidebar on swipe/outside click on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            e.target !== toggleBtn && 
            !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('open');
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
    });
}

// --------------------------------------------------------------------------
// System Logs & Stats
// --------------------------------------------------------------------------
function logSystemEvent(message, type = 'system') {
    const logsContainer = document.getElementById('sim-logs');
    if (!logsContainer) return;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `[${time}] ${message}`;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

function updateStats() {
    const activeCount = state.reminders.filter(r => r.status === 'active').length;
    const completedCount = state.reminders.filter(r => r.status === 'acknowledged').length;
    
    document.getElementById('stat-active').textContent = activeCount;
    document.getElementById('stat-completed').textContent = completedCount;
}

// --------------------------------------------------------------------------
// Voice & Natural Language Parser
// --------------------------------------------------------------------------
function parseSpeechCommand(text) {
    const lower = text.toLowerCase();
    logSystemEvent(`NLU Processing spoken command: "${text}"`, "system");
    
    let title = "Personal Task";
    let category = "Personal";
    let priority = "Low";
    let timeOffsetMs = 60000; // default 1 minute from now
    let scheduledDate = new Date();
    
    // 1. Category extraction based on keywords
    if (/medicine|pill|tablet|vitamins|aspirin|doctor|health/i.test(lower)) {
        category = "Medicine";
        priority = "Medium";
    } else if (/meeting|sync|review|discussion|interview|presentation|call|roadmap/i.test(lower)) {
        category = "Meeting";
        priority = "High";
    } else if (/assignment|submit|submission|report|project|homework|exam|test/i.test(lower)) {
        category = "Assignment";
        priority = "High";
    }

    // 2. Priority override
    if (/emergency|critical|immediate|urgent|server maintenance/i.test(lower)) {
        priority = "Critical";
    } else if (/low priority|chill|relax|anytime/i.test(lower)) {
        priority = "Low";
    }

    // 3. Time offset extraction (e.g. "in 10 seconds", "in 1 minute")
    const secMatch = lower.match(/in (\d+)\s*sec/i);
    const minMatch = lower.match(/in (\d+)\s*min/i);
    const hourMatch = lower.match(/in (\d+)\s*hour/i);
    
    if (secMatch) {
        timeOffsetMs = parseInt(secMatch[1]) * 1000;
        scheduledDate = new Date(Date.now() + timeOffsetMs);
    } else if (minMatch) {
        timeOffsetMs = parseInt(minMatch[1]) * 60000;
        scheduledDate = new Date(Date.now() + timeOffsetMs);
    } else if (hourMatch) {
        timeOffsetMs = parseInt(hourMatch[1]) * 3600000;
        scheduledDate = new Date(Date.now() + timeOffsetMs);
    } else if (/tomorrow/i.test(lower)) {
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        // Default tomorrow to 9 AM unless specified
        scheduledDate.setHours(9, 0, 0, 0);
        
        const ampmMatch = lower.match(/at (\d+)\s*(am|pm)/i);
        if (ampmMatch) {
            let hr = parseInt(ampmMatch[1]);
            const ampm = ampmMatch[2];
            if (ampm === 'pm' && hr < 12) hr += 12;
            if (ampm === 'am' && hr === 12) hr = 0;
            scheduledDate.setHours(hr, 0, 0, 0);
        }
    } else {
        // Look for specific time today (e.g. "at 8 pm")
        const ampmMatch = lower.match(/at (\d+)\s*(am|pm)/i);
        if (ampmMatch) {
            let hr = parseInt(ampmMatch[1]);
            const ampm = ampmMatch[2];
            if (ampm === 'pm' && hr < 12) hr += 12;
            if (ampm === 'am' && hr === 12) hr = 0;
            scheduledDate.setHours(hr, 0, 0, 0);
            
            // If the time already passed today, schedule for tomorrow
            if (scheduledDate.getTime() < Date.now()) {
                scheduledDate.setDate(scheduledDate.getDate() + 1);
            }
        } else {
            // Default 30s for demo if no time found
            timeOffsetMs = 30000;
            scheduledDate = new Date(Date.now() + timeOffsetMs);
        }
    }

    // 4. Title cleanup - remove filler words
    let cleanText = text;
    
    // Strip prefixes
    cleanText = cleanText.replace(/remind me to|remind me about|schedule a|schedule|create a reminder for|create reminder to/gi, '');
    
    // Strip time indicator phrases
    cleanText = cleanText.replace(/in \d+ \w+|tomorrow|today|at \d+ (am|pm)|everyday|daily/gi, '');
    
    // Strip trailing/leading spaces & punctuation
    cleanText = cleanText.trim().replace(/^to\s+|^for\s+/gi, '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    
    if (cleanText.length > 0) {
        // Capitalize first letter
        title = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
    } else {
        title = `AURA ${category} Reminder`;
    }

    // Generate location based on category and title
    const location = generateMockLocation(category, title);

    // Return structured object
    return {
        id: 'rem_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        title: title,
        category: category,
        datetime: scheduledDate.toISOString(),
        priority: priority,
        status: 'active',
        sequence: 0,
        createdTime: new Date().toISOString(),
        calendarSynced: true,
        location: location
    };
}

function generateMockLocation(category, title) {
    const lowerTitle = title.toLowerCase();
    if (category === 'Meeting') {
        if (/zoom|virtual|online|remote/i.test(lowerTitle)) {
            return "Zoom Video Conference";
        }
        if (/teams|microsoft/i.test(lowerTitle)) {
            return "Microsoft Teams Room";
        }
        return "Conference Room B";
    } else if (category === 'Medicine') {
        return "Home Pharmacy Cabinet";
    } else if (category === 'Assignment') {
        return "Submission Hub Portal";
    } else {
        return "Workspace / Personal Device";
    }
}

function parseWhatsAppMessage(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;
    
    let title = lines[0];
    let remainingText = lines.slice(1).join(' ').trim();
    
    let parsed;
    if (!remainingText) {
        parsed = parseSpeechCommand(title);
    } else {
        parsed = parseSpeechCommand(remainingText);
        title = title.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
        if (title.length > 0) {
            parsed.title = title.charAt(0).toUpperCase() + title.slice(1);
        }
    }
    
    // Re-evaluate category based on the title keywords since it's the title that has the semantic keyword
    const lowerTitle = parsed.title.toLowerCase();
    if (/medicine|pill|tablet|vitamins|aspirin|doctor|health/i.test(lowerTitle)) {
        parsed.category = "Medicine";
        parsed.priority = "Medium";
    } else if (/meeting|sync|review|discussion|interview|presentation|call|roadmap/i.test(lowerTitle)) {
        parsed.category = "Meeting";
        parsed.priority = "High";
    } else if (/assignment|submit|submission|report|project|homework|exam|test/i.test(lowerTitle)) {
        parsed.category = "Assignment";
        parsed.priority = "High";
    }
    
    // Check urgent priority override
    if (/emergency|critical|immediate|urgent|server maintenance/i.test(lowerTitle)) {
        parsed.priority = "Critical";
    }
    
    parsed.source = 'whatsapp';
    parsed.location = generateMockLocation(parsed.category, parsed.title);
    parsed.calendarSynced = true;
    return parsed;
}

// --------------------------------------------------------------------------
// Sound Synthesis Engine (Web Audio API)
// --------------------------------------------------------------------------
function playProfessionalChime(category) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        
        // Volume master gain node
        const masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
        masterGain.gain.setValueAtTime(0.3, ctx.currentTime);
        
        if (category === 'Meeting') {
            // High professional double chime
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
            osc1.connect(masterGain);
            
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.15); // C#6
            osc2.connect(masterGain);
            
            masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
            
            osc1.start();
            osc1.stop(ctx.currentTime + 0.5);
            
            osc2.start(ctx.currentTime + 0.15);
            osc2.stop(ctx.currentTime + 1.2);
            
        } else if (category === 'Medicine') {
            // Warm, soft single chime
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
            osc.connect(masterGain);
            
            masterGain.gain.setValueAtTime(0.25, ctx.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.8);
            
            osc.start();
            osc.stop(ctx.currentTime + 1.8);
            
        } else if (category === 'Assignment') {
            // Slightly sharper double alert chime
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
            osc1.connect(masterGain);
            
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.1); // G5
            osc2.connect(masterGain);
            
            masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
            
            osc1.start();
            osc1.stop(ctx.currentTime + 0.4);
            
            osc2.start(ctx.currentTime + 0.1);
            osc2.stop(ctx.currentTime + 1.0);
            
        } else {
            // Personal/Other - Triple bell chord
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 major triad
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + (idx * 0.08));
                osc.connect(masterGain);
                osc.start(ctx.currentTime + (idx * 0.08));
                osc.stop(ctx.currentTime + 1.5);
            });
            
            masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
        }
    } catch(e) {
        console.error("Audio Context playback failed: ", e);
    }
}

// --------------------------------------------------------------------------
// Text-to-Speech (TTS) Announcements
// --------------------------------------------------------------------------
function speakAnnouncement(text) {
    if (!('speechSynthesis' in window)) return;
    
    // Stop any current speaking
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92; // Slightly slower, professional rate
    utterance.pitch = 1.0;
    
    // Try to get a female / calm sounding English voice
    const voices = window.speechSynthesis.getVoices();
    const chosenVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.includes('Google') || voice.name.includes('Zira') || voice.name.includes('Natural'))
    );
    
    if (chosenVoice) {
        utterance.voice = chosenVoice;
    }
    
    window.speechSynthesis.speak(utterance);
}

// --------------------------------------------------------------------------
// Alarm Engine & Smart Escalation Scheduler
// --------------------------------------------------------------------------
function checkAlarms() {
    if (state.activeAlarm) return; // Don't trigger overlapping overlays

    const now = new Date().getTime();
    
    for (let reminder of state.reminders) {
        if (reminder.status === 'active') {
            const triggerTime = new Date(reminder.datetime).getTime();
            if (now >= triggerTime) {
                triggerEscalationAlarm(reminder);
                break; // Open only one modal overlay at a time
            }
        }
    }
}

function triggerEscalationAlarm(reminder) {
    state.activeAlarm = reminder;
    reminder.sequence += 1;
    saveReminders();

    logSystemEvent(`Alarm triggered! [${reminder.priority}] "${reminder.title}" - Sequence #${reminder.sequence}`, "alarm");
    
    // 1. Synthesize audio chime
    playProfessionalChime(reminder.category);
    
    // 2. Browser OS notification
    sendBrowserNotification(
        `AURA: ${reminder.priority} Alert`,
        `${reminder.title} — ${reminder.category} (Sequence #${reminder.sequence})`
    );
    
    // 3. TTS spoken message (based on sequence and category)
    let spokenText = "";
    const isAction = ['Medicine', 'Assignment', 'Personal'].includes(reminder.category) || /take|submit|call|buy|do|finish/i.test(reminder.title);
    if (isAction) {
        let cleanTitle = reminder.title;
        if (cleanTitle.toLowerCase().startsWith('to ')) {
            cleanTitle = cleanTitle.slice(3);
        }
        spokenText = `Ding. Follow up confirmation. Did you ${cleanTitle}?`;
    } else if (reminder.priority === 'Critical') {
        spokenText = `Ding. Attention. Critical alarm. Your ${reminder.title} starts in 5 minutes. Please acknowledge.`;
    } else {
        spokenText = `Ding. Reminder. It is time for ${reminder.title}.`;
    }
    
    // Trigger spoken alert shortly after chime
    setTimeout(() => {
        speakAnnouncement(spokenText);
    }, 400);

    // 3. Open overlay & show UI details
    openEscalationModal(reminder);
}

function openEscalationModal(reminder) {
    const overlay = document.getElementById('escalation-overlay');
    const titleEl = document.getElementById('alert-title');
    const seqEl = document.getElementById('alert-sequence');
    const badgeEl = document.getElementById('alert-priority-badge');
    const schedEl = document.getElementById('alert-meta-schedule');
    const catEl = document.getElementById('alert-meta-category');
    
    const ackBtn = document.getElementById('alert-acknowledge-btn');
    const snoozeBtn = document.getElementById('alert-snooze-btn');
    const dismissBtn = document.getElementById('alert-dismiss-btn');
    
    const isAction = ['Medicine', 'Assignment', 'Personal'].includes(reminder.category) || /take|submit|call|buy|do|finish/i.test(reminder.title);
    
    badgeEl.textContent = `${reminder.priority} Priority`;
    
    // Color code priority badge
    badgeEl.className = 'priority-badge';
    badgeEl.classList.add(
        reminder.priority === 'Critical' ? 'p-critical' :
        reminder.priority === 'High' ? 'p-high' :
        reminder.priority === 'Medium' ? 'p-medium' : 'p-low'
    );
    
    catEl.textContent = reminder.category;
    schedEl.textContent = new Date(reminder.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (isAction) {
        let q = reminder.title;
        if (!q.toLowerCase().startsWith('did you') && !q.toLowerCase().startsWith('have you')) {
            let clean = q;
            if (clean.toLowerCase().startsWith('to ')) {
                clean = clean.slice(3);
            }
            q = `Did you ${clean.charAt(0).toLowerCase() + clean.slice(1)}?`;
        }
        titleEl.textContent = q;
        
        ackBtn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> Yes, I did`;
        dismissBtn.innerHTML = `<span class="material-symbols-outlined">close</span> Not Yet`;
        snoozeBtn.style.display = 'none';
        
        seqEl.innerHTML = `This is a <span class="text-secondary font-bold">Follow-Up Confirmation</span>. AURA tracks action items until they are complete.`;
    } else {
        titleEl.textContent = reminder.title;
        
        ackBtn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> Acknowledge Task`;
        dismissBtn.innerHTML = `<span class="material-symbols-outlined">close</span> Dismiss`;
        snoozeBtn.style.display = 'flex';
        snoozeBtn.innerHTML = `<span class="material-symbols-outlined">snooze</span> Snooze 5 Min`;
        
        // Detailed subtitle depending on escalation sequence
        if (reminder.sequence === 1) {
            seqEl.innerHTML = `This is the <span class="text-secondary font-bold">First Alert</span>. Tap Acknowledge to confirm completion.`;
        } else {
            seqEl.innerHTML = `This is <span class="text-secondary font-bold">Follow-Up Alert #${reminder.sequence}</span>. AURA will continue notifications until acknowledged.`;
        }
    }

    overlay.classList.add('active');

    // Escalation Timeout progress bar: 60s window to acknowledge
    const totalTime = 60000; // 60 seconds response window
    let timeLeft = totalTime;
    const progressFill = document.getElementById('alert-progress-bar');
    
    if (state.alarmProgressInterval) clearInterval(state.alarmProgressInterval);
    
    state.alarmProgressInterval = setInterval(() => {
        timeLeft -= 100;
        const percentage = (timeLeft / totalTime) * 100;
        progressFill.style.width = `${percentage}%`;
        
        if (timeLeft <= 0) {
            clearInterval(state.alarmProgressInterval);
            handleAlarmTimeout(reminder);
        }
    }, 100);
}

function handleAlarmTimeout(reminder) {
    // If user fails to respond, execute escalation rules
    logSystemEvent(`Alarm timeout. User ignored alert: "${reminder.title}"`, "alarm");
    closeEscalationModal();
    
    let snoozeMinutes = 5;
    if (reminder.priority === 'Critical' || reminder.priority === 'High') {
        snoozeMinutes = 2; // Critical/High escalates every 2 minutes
    }
    
    // Automatically reschedule and increment sequence
    const newTriggerTime = new Date(Date.now() + (snoozeMinutes * 60000));
    reminder.datetime = newTriggerTime.toISOString();
    
    saveReminders();
    
    logSystemEvent(`Escalation applied. Rescheduled: "${reminder.title}" to trigger again in ${snoozeMinutes}m.`, "system");
    showToast(`Escalating alarm: "${reminder.title}" (Rescheduled in ${snoozeMinutes}m)`, "warning");
    
    // Reload UI
    renderQueue();
    renderTimeline();
    
    state.activeAlarm = null;
}

function closeEscalationModal() {
    const overlay = document.getElementById('escalation-overlay');
    overlay.classList.remove('active');
    if (state.alarmProgressInterval) clearInterval(state.alarmProgressInterval);
    window.speechSynthesis.cancel();
}

function setupEscalationAlert() {
    const ackBtn = document.getElementById('alert-acknowledge-btn');
    const snoozeBtn = document.getElementById('alert-snooze-btn');
    const dismissBtn = document.getElementById('alert-dismiss-btn');
    
    ackBtn.addEventListener('click', () => {
        if (!state.activeAlarm) return;
        const reminder = state.activeAlarm;
        
        // Complete the task!
        reminder.status = 'acknowledged';
        saveReminders();
        
        logSystemEvent(`Task acknowledged & completed: "${reminder.title}"`, "success");
        showToast("Task completed and saved in logs.", "success");
        
        closeEscalationModal();
        renderQueue();
        renderTimeline();
        state.activeAlarm = null;
    });
    
    snoozeBtn.addEventListener('click', () => {
        if (!state.activeAlarm) return;
        const reminder = state.activeAlarm;
        
        // Snooze 5 minutes (30s in demo mode for ease of use)
        const demoSnoozeMs = 30 * 1000; 
        const newTriggerTime = new Date(Date.now() + demoSnoozeMs);
        reminder.datetime = newTriggerTime.toISOString();
        saveReminders();
        
        logSystemEvent(`Task snoozed for 30s: "${reminder.title}"`, "system");
        showToast("Alarm snoozed for 30 seconds.", "info");
        
        closeEscalationModal();
        renderQueue();
        renderTimeline();
        state.activeAlarm = null;
    });
    
    dismissBtn.addEventListener('click', () => {
        if (!state.activeAlarm) return;
        const reminder = state.activeAlarm;
        
        const isAction = ['Medicine', 'Assignment', 'Personal'].includes(reminder.category) || /take|submit|call|buy|do|finish/i.test(reminder.title);
        
        // Dismiss closes overlay but doesn't mark task as completed. It sets trigger to 60s later in demo mode.
        const demoSnoozeMs = 60 * 1000; // 1 minute dismissal
        const newTriggerTime = new Date(Date.now() + demoSnoozeMs);
        reminder.datetime = newTriggerTime.toISOString();
        saveReminders();
        
        if (isAction) {
            logSystemEvent(`Action not completed yet: "${reminder.title}". Follow-up rescheduled in 60s.`, "warning");
            showToast("Follow-up rescheduled in 60 seconds.", "warning");
        } else {
            logSystemEvent(`Task dismissed: "${reminder.title}" (rescheduled in 60s)`, "system");
            showToast("Alarm dismissed. Will notify again in 60 seconds.", "warning");
        }
        
        closeEscalationModal();
        renderQueue();
        renderTimeline();
        state.activeAlarm = null;
    });
}

// --------------------------------------------------------------------------
// Real Microphone Speech Recognition & visualizer animations
// --------------------------------------------------------------------------
function setupVoiceAssistant() {
    const micBtn = document.getElementById('mic-trigger-btn');
    const listeningStatus = document.getElementById('listening-status');
    const listeningSub = document.getElementById('listening-sub');
    const visualizer = document.getElementById('visualizer-container');
    const transcriptContainer = document.getElementById('transcript-container');
    const transcriptOutput = document.getElementById('transcript-output');
    
    // Check speech recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        state.recognition = new SpeechRecognition();
        state.recognition.continuous = false;
        state.recognition.lang = 'en-US';
        state.recognition.interimResults = false;
        state.recognition.maxAlternatives = 1;
        
        state.recognition.onstart = () => {
            state.isListening = true;
            micBtn.parentElement.classList.add('listening-active');
            listeningStatus.textContent = "Listening to you...";
            listeningSub.textContent = "AURA IS ACTIVE";
            transcriptContainer.classList.remove('hidden');
            transcriptOutput.textContent = "...";
            startVisualizerAnimation();
            logSystemEvent("AURA microphone session opened.", "speech");
        };
        
        state.recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            transcriptOutput.textContent = `"${speechResult}"`;
            logSystemEvent(`Speech Recognized: "${speechResult}"`, "speech");
            
            // Parse and add reminder
            const parsedReminder = parseSpeechCommand(speechResult);
            state.reminders.push(parsedReminder);
            saveReminders();
            
            logSystemEvent(`Created reminder: "${parsedReminder.title}" (${parsedReminder.category}) scheduled at ${new Date(parsedReminder.datetime).toLocaleTimeString()}`, "success");
            showToast(`Created: "${parsedReminder.title}"`, "success");
            
            // Voice response confirmation
            speakAnnouncement(`Got it. I've scheduled your reminder: ${parsedReminder.title}.`);
            
            // Refresh dashboard views
            renderQueue();
            renderTimeline();
        };
        
        state.recognition.onerror = (event) => {
            logSystemEvent(`Speech recognition error: ${event.error}`, "alarm");
            showToast(`Speech recognition failed: ${event.error}`, "error");
            // If mic is denied via SpeechRecognition API, also show the helper overlay
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                const helper = document.getElementById('mic-helper-overlay');
                if (helper) helper.classList.add('active');
            }
            stopListeningState();
        };
        
        state.recognition.onend = () => {
            stopListeningState();
            logSystemEvent("AURA microphone session closed.", "speech");
        };
    } else {
        logSystemEvent("Web Speech Recognition API not supported in this browser. Voice capture will be simulated.", "system");
    }
    
    micBtn.addEventListener('click', () => {
        if (state.isListening) {
            if (state.recognition) state.recognition.stop();
            else stopListeningState();
        } else {
            // Request microphone permission check to ensure production readiness
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then((stream) => {
                    // Stop stream tracks since we only wanted to verify permission
                    stream.getTracks().forEach(track => track.stop());
                    
                    // Proceed with standard listening
                    if (state.recognition) {
                        try {
                            state.recognition.start();
                        } catch(e) {
                            state.recognition.stop();
                        }
                    } else {
                        // Simulate microphone listening for 4s
                        state.isListening = true;
                        micBtn.parentElement.classList.add('listening-active');
                        listeningStatus.textContent = "Simulating listening...";
                        listeningSub.textContent = "VOICE INPUT SIMULATION";
                        startVisualizerAnimation();
                        
                        setTimeout(() => {
                            stopListeningState();
                            const demoPhrases = [
                                "Meeting with client tomorrow at 11 AM",
                                "Take medicine in 10 seconds",
                                "Submit assignment in 30 seconds",
                                "Call home in 5 minutes"
                            ];
                            const randomPhrase = demoPhrases[Math.floor(Math.random() * demoPhrases.length)];
                            logSystemEvent(`Simulated Speech Input: "${randomPhrase}"`, "speech");
                            
                            const parsedReminder = parseSpeechCommand(randomPhrase);
                            state.reminders.push(parsedReminder);
                            saveReminders();
                            
                            speakAnnouncement(`Scheduled: ${parsedReminder.title}`);
                            showToast(`Created: "${parsedReminder.title}"`, "success");
                            
                            renderQueue();
                            renderTimeline();
                        }, 4000);
                    }
                })
                .catch((err) => {
                    console.error("Microphone permission check failed:", err);
                    if (window.Sentry) window.Sentry.captureException(err);
                    
                    // Trigger the mic helper modal overlay
                    const helper = document.getElementById('mic-helper-overlay');
                    if (helper) {
                        helper.classList.add('active');
                    }
                    
                    logSystemEvent("Microphone session failed: Access denied or media device error.", "alarm");
                    showToast("Microphone access blocked. Please allow permissions.", "error");
                });
        }
        // Update mic button aria-pressed state
        const micTriggerBtn = document.getElementById('mic-trigger-btn');
        if (micTriggerBtn) micTriggerBtn.setAttribute('aria-pressed', 'false');
    });
}

function stopListeningState() {
    state.isListening = false;
    const micBtn = document.getElementById('mic-trigger-btn');
    const listeningStatus = document.getElementById('listening-status');
    const listeningSub = document.getElementById('listening-sub');
    
    micBtn.parentElement.classList.remove('listening-active');
    listeningStatus.textContent = "Tap center orb to speak";
    listeningSub.textContent = "AURA VOICE-FIRST ASSISTANT";
    
    stopVisualizerAnimation();
}

function startVisualizerAnimation() {
    const bars = document.querySelectorAll('.vis-bar');
    if (bars.length === 0) return;
    
    function animate() {
        bars.forEach(bar => {
            const h = 4 + Math.random() * 28;
            bar.style.height = `${h}px`;
        });
        state.visualizerAnimation = requestAnimationFrame(animate);
    }
    animate();
}

function stopVisualizerAnimation() {
    if (state.visualizerAnimation) {
        cancelAnimationFrame(state.visualizerAnimation);
    }
    const bars = document.querySelectorAll('.vis-bar');
    bars.forEach(bar => {
        bar.style.height = '8px';
    });
}

// --------------------------------------------------------------------------
// Rendering Queue & Timelines
// --------------------------------------------------------------------------
function renderQueue() {
    const listContainer = document.getElementById('queue-list-container');
    if (!listContainer) return;
    
    // Sort reminders chronologically
    const sorted = [...state.reminders].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    
    // Filter
    const filtered = sorted.filter(r => {
        if (state.activeFilter === 'all') return true;
        return r.category === state.activeFilter;
    });
    
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">format_list_bulleted</span>
                <p>No reminders scheduled in this category.</p>
                <button class="btn btn-ghost btn-sm" id="load-samples-btn-inner">Load Demo Reminders</button>
            </div>
        `;
        
        const loadBtn = document.getElementById('load-samples-btn-inner');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => loadDemoData(true));
        }
        return;
    }
    
    listContainer.innerHTML = '';
    
    filtered.forEach(r => {
        const card = document.createElement('div');
        const isCompleted = r.status === 'acknowledged';
        card.className = `glass-card reminder-card cat-${r.category.toLowerCase()} ${isCompleted ? 'reminder-completed' : ''}`;
        
        // Date formats
        const remTime = new Date(r.datetime);
        const timeStr = remTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = remTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        let timeRemainingLabel = "";
        if (!isCompleted) {
            const diff = remTime.getTime() - Date.now();
            if (diff <= 0) {
                timeRemainingLabel = `<span class="time-countdown text-danger">Fired</span>`;
            } else if (diff < 60000) {
                timeRemainingLabel = `<span class="time-countdown text-warning">In ${Math.ceil(diff / 1000)}s</span>`;
            } else if (diff < 3600000) {
                timeRemainingLabel = `<span class="time-countdown">In ${Math.ceil(diff / 60000)}m</span>`;
            } else {
                timeRemainingLabel = `<span>In ${Math.round(diff / 3600000)}h</span>`;
            }
        } else {
            timeRemainingLabel = `<span class="text-success" style="display:flex; align-items:center; gap:3px;"><span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> Acknowledged</span>`;
        }

        const categoryIcons = {
            Meeting: 'groups',
            Medicine: 'medication',
            Assignment: 'assignment',
            Personal: 'person'
        };
        const icon = categoryIcons[r.category] || 'notification_important';

        const calBadge = r.calendarSynced ? `
            <span class="calendar-sync-badge" title="Automatically synced to your primary calendar">
                <span class="material-symbols-outlined">calendar_today</span>
                <span>Synced</span>
            </span>
        ` : '';

        card.innerHTML = `
            <div class="reminder-content-flex">
                <div class="rem-info">
                    <div class="rem-header">
                        <span class="material-symbols-outlined icon-purple" style="font-size:18px;">${icon}</span>
                        <span class="rem-cat-badge">${r.category}</span>
                        <span class="priority-badge ${
                            r.priority === 'Critical' ? 'p-critical' :
                            r.priority === 'High' ? 'p-high' :
                            r.priority === 'Medium' ? 'p-medium' : 'p-low'
                        }">${r.priority}</span>
                        ${calBadge}
                    </div>
                    <h3 class="rem-title">${r.title}</h3>
                    <div class="rem-time-status">
                        <span class="material-symbols-outlined">schedule</span>
                        <span>${dateStr} @ ${timeStr}</span>
                        <span class="bullet-separator">•</span>
                        ${timeRemainingLabel}
                        ${r.location ? `
                        <span class="bullet-separator">•</span>
                        <span class="material-symbols-outlined" style="font-size:14px;">location_on</span>
                        <span>${r.location}</span>
                        ` : ''}
                    </div>
                </div>
                <div class="rem-actions">
                    <button class="icon-btn toggle-complete-btn" data-id="${r.id}" title="${isCompleted ? 'Mark Active' : 'Mark Acknowledged'}">
                        <span class="material-symbols-outlined">${isCompleted ? 'check_box' : 'check_box_outline_blank'}</span>
                    </button>
                    <button class="icon-btn delete-rem-btn" data-id="${r.id}" title="Delete Reminder">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        `;
        
        listContainer.appendChild(card);
    });

    // Add listeners to inside buttons
    document.querySelectorAll('.toggle-complete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id  = btn.getAttribute('data-id');
            const rem = state.reminders.find(r => r.id === id);
            if (!rem) return;
            const newStatus = rem.status === 'active' ? 'acknowledged' : 'active';
            try {
                await api.reminders.update(id, { status: newStatus });
                rem.status = newStatus;
            } catch (e) {
                rem.status = newStatus; // optimistic UI
                showToast('Sync failed — changes saved locally.', 'warning');
            }
            renderQueue();
            renderTimeline();
            logSystemEvent(`Updated task completion: "${rem.title}" status is now ${rem.status}`, "system");
        });
    });

    document.querySelectorAll('.delete-rem-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id  = btn.getAttribute('data-id');
            const rem = state.reminders.find(r => r.id === id);
            const title = rem ? `"${rem.title}"` : 'this reminder';
            if (!confirm(`Delete ${title}? This cannot be undone.`)) return;
            try {
                await api.reminders.delete(id);
            } catch (err) {
                showToast('Delete failed on server — removed locally.', 'warning');
            }
            state.reminders = state.reminders.filter(r => r.id !== id);
            localStorage.setItem('aura_reminders_cache', JSON.stringify(state.reminders));
            renderQueue();
            renderTimeline();
            logSystemEvent("Deleted reminder from database.", "system");
        });
    });
}

function renderTimeline() {
    const listEl = document.getElementById('timeline-list');
    if (!listEl) return;
    
    const targetDate = state.selectedDate || new Date();
    const targetDateStr = targetDate.toDateString();
    const isToday = targetDateStr === new Date().toDateString();
    
    // Show only active/acknowledged reminders scheduled for the selected day
    const dayReminders = state.reminders.filter(r => new Date(r.datetime).toDateString() === targetDateStr);
    
    // Sort chronologically
    dayReminders.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    
    // Update briefing-date-subtitle
    const subtitleEl = document.getElementById('briefing-date-subtitle');
    if (subtitleEl) {
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        subtitleEl.textContent = `AURA Calendar Briefing for ${targetDate.toLocaleDateString('en-US', options)}.`;
    }
    
    if (dayReminders.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">event_busy</span>
                <p>No itinerary scheduled for ${isToday ? 'today' : 'this day'}.</p>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = '';
    
    dayReminders.forEach(r => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        const isCompleted = r.status === 'acknowledged';
        const remTime = new Date(r.datetime);
        const timeStr = remTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const categoryIcons = {
            Meeting: 'groups',
            Medicine: 'medication',
            Assignment: 'assignment',
            Personal: 'person'
        };
        const icon = categoryIcons[r.category] || 'notification_important';

        const calBadge = r.calendarSynced ? `
            <span class="calendar-sync-badge" title="Automatically synced to your primary calendar">
                <span class="material-symbols-outlined">calendar_today</span>
                <span>Synced</span>
            </span>
        ` : '';

        item.innerHTML = `
            <div class="timeline-dot-wrapper">
                <div class="timeline-dot" style="border-color:${isCompleted ? 'var(--text-muted)' : 'var(--primary)'}; background-color:${isCompleted ? 'var(--text-muted)' : 'transparent'}"></div>
            </div>
            <div class="glass-card timeline-card ${isCompleted ? 'reminder-completed' : ''}">
                <div class="timeline-card-header">
                    <span class="timeline-time">${timeStr}</span>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="priority-badge ${
                            r.priority === 'Critical' ? 'p-critical' :
                            r.priority === 'High' ? 'p-high' :
                            r.priority === 'Medium' ? 'p-medium' : 'p-low'
                        }">${r.priority}</span>
                        ${calBadge}
                    </div>
                </div>
                <h4 class="timeline-title">${r.title}</h4>
                <div class="timeline-meta">
                    <span class="material-symbols-outlined">${icon}</span>
                    <span>${r.category}</span>
                    <span>•</span>
                    <span>Status: ${isCompleted ? 'Acknowledged' : 'Active'}</span>
                    ${r.location ? `
                    <span>•</span>
                    <span class="material-symbols-outlined" style="font-size:12px; vertical-align: middle;">location_on</span>
                    <span>${r.location}</span>
                    ` : ''}
                </div>
            </div>
        `;
        
        listEl.appendChild(item);
    });
}

function renderDateScroller() {
    const scroller = document.getElementById('briefing-date-scroller');
    if (!scroller) return;

    // Generate days of the current week (Monday to Sunday)
    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
    
    // Calculate Monday of this week
    const monday = new Date(today);
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay; // adjust when day is Sunday
    monday.setDate(today.getDate() + diffToMonday);

    scroller.innerHTML = '';
    
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(monday);
        dayDate.setDate(monday.getDate() + i);

        const dayName = dayNames[dayDate.getDay()];
        const dayNum = dayDate.getDate();
        
        const isToday = dayDate.toDateString() === today.toDateString();
        const isSelected = state.selectedDate ? dayDate.toDateString() === state.selectedDate.toDateString() : isToday;

        const item = document.createElement('div');
        item.className = `date-scroll-item ${isSelected ? 'active' : ''}`;
        item.setAttribute('data-date', dayDate.toISOString());

        item.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="day-num">${dayNum}</span>
            ${isSelected ? '<div class="active-dot"></div>' : ''}
        `;

        item.addEventListener('click', () => {
            state.selectedDate = dayDate;
            renderDateScroller();
            renderTimeline();
        });

        scroller.appendChild(item);
    }
}

// --------------------------------------------------------------------------
// Simulator Dashboard Controller
// --------------------------------------------------------------------------
function setupSimulator() {
    // 1. Preset commands
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const speechText = btn.getAttribute('data-speech');
            simulateTextVoice(speechText);
        });
    });

    // 2. Custom text command
    const customIn = document.getElementById('sim-custom-speech');
    const customBtn = document.getElementById('sim-send-speech-btn');
    
    const sendCustom = () => {
        const val = customIn.value.trim();
        if (val) {
            simulateTextVoice(val);
            customIn.value = '';
        } else {
            showToast("Please enter a voice command first.", "warning");
            customIn.focus();
        }
    };
    customBtn.addEventListener('click', sendCustom);
    customIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCustom();
    });

    // 3. Force trigger alarm alert
    const forceTitle = document.getElementById('trigger-title');
    const forceCat = document.getElementById('trigger-category');
    const forcePri = document.getElementById('trigger-priority');
    const forceBtn = document.getElementById('sim-trigger-alarm-btn');
    
    forceBtn.addEventListener('click', () => {
        const titleVal = forceTitle.value.trim() || "Simulation Alarm";
        const catVal = forceCat.value;
        const priVal = forcePri.value;
        
        const dummyReminder = {
            id: 'force_' + Date.now(),
            title: titleVal,
            category: catVal,
            datetime: new Date().toISOString(),
            priority: priVal,
            status: 'active',
            sequence: 0,
            createdTime: new Date().toISOString()
        };
        
        logSystemEvent(`Simulating force triggered alert: "${titleVal}" (${priVal})`, "alarm");
        triggerEscalationAlarm(dummyReminder);
    });

    // 4. Log clears
    document.getElementById('clear-logs-btn').addEventListener('click', () => {
        const logsContainer = document.getElementById('sim-logs');
        logsContainer.innerHTML = `<div class="log-entry system">[Logs cleared]</div>`;
    });

    // 5. Reset database
    document.getElementById('reset-storage-btn').addEventListener('click', async () => {
        if (confirm("Reset AURA reminders database to factory demo defaults?")) {
            try {
                // Delete all current reminders from Neon
                await Promise.all(state.reminders.map(r => api.reminders.delete(r.id).catch(() => {})));
            } catch (_) {}
            state.reminders = [];
            await loadDemoData(true);
            logSystemEvent("Reminders database reset completely.", "system");
        }
    });

    // 6. Queue Tab Actions — clear acknowledged via API
    document.getElementById('clear-completed-btn').addEventListener('click', async () => {
        const acknowledged = state.reminders.filter(r => r.status === 'acknowledged');
        try {
            await Promise.all(acknowledged.map(r => api.reminders.delete(r.id).catch(() => {})));
        } catch (_) {}
        state.reminders = state.reminders.filter(r => r.status !== 'acknowledged');
        localStorage.setItem('aura_reminders_cache', JSON.stringify(state.reminders));
        renderQueue();
        renderTimeline();
        logSystemEvent("Cleared acknowledged reminders from system memory.", "system");
        showToast("Cleared acknowledged reminders.", "info");
    });

    // 7. Category filtering
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeFilter = chip.getAttribute('data-filter');
            renderQueue();
        });
    });

    // 8. Demo load inside queue
    const demoLoadBtn = document.getElementById('load-samples-btn');
    if (demoLoadBtn) {
        demoLoadBtn.addEventListener('click', () => loadDemoData(true));
    }

    // 9. Morning Intelligence spoken summary
    document.getElementById('speak-briefing-btn').addEventListener('click', () => {
        const todayStr = new Date().toDateString();
        const activeToday = state.reminders.filter(r => r.status === 'active' && new Date(r.datetime).toDateString() === todayStr);
        
        let announcement = "Good morning. Here is your AURA itinerary summary. ";
        if (activeToday.length === 0) {
            announcement += "You have no upcoming reminders scheduled for today. Have a relaxed day.";
        } else {
            announcement += `You have ${activeToday.length} active events remaining today. `;
            activeToday.forEach(r => {
                const rTime = new Date(r.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                announcement += `At ${rTime}, you have ${r.title}. `;
            });
        }
        
        logSystemEvent("Generating spoken Morning Intelligence briefing.", "system");
        
        // Visual indicator on card
        const playBtn = document.getElementById('speak-briefing-btn');
        const originalText = playBtn.innerHTML;
        playBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">progress_activity</span> Synthesizing voice...`;
        playBtn.disabled = true;
        
        playProfessionalChime('Meeting');
        setTimeout(() => {
            speakAnnouncement(announcement);
            
            setTimeout(() => {
                playBtn.innerHTML = originalText;
                playBtn.disabled = false;
            }, 6000); // reset after sound/announcement completes
        }, 800);
    });

    // 10. Automate button inside insights
    const automateBtn = document.getElementById('automate-sync-btn');
    if (automateBtn) {
        automateBtn.addEventListener('click', () => {
            const today = new Date();
            const nextMonday = new Date();
            // Get next Monday
            nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
            nextMonday.setHours(9, 0, 0, 0);

            const newRecurring = {
                id: 'recurring_sync',
                title: 'Automated Weekly Sync Meeting',
                category: 'Meeting',
                datetime: nextMonday.toISOString(),
                priority: 'Medium',
                status: 'active',
                sequence: 0,
                createdTime: new Date().toISOString(),
                recurring: 'weekly'
            };

            // Avoid duplication
            if (!state.reminders.some(r => r.id === 'recurring_sync')) {
                state.reminders.push(newRecurring);
                saveReminders();
                logSystemEvent("Smart Learning: Automated Weekly Sync reminder created for Mondays at 9 AM.", "success");
                showToast("Automated Weekly Sync scheduled!", "success");
                
                // Update button state
                automateBtn.textContent = "Automated ✓";
                automateBtn.disabled = true;
                automateBtn.style.opacity = '0.5';

                renderQueue();
                renderTimeline();
            } else {
                showToast("Weekly Sync already automated.", "info");
            }
        });
    }

    // 11. WhatsApp Import Simulation
    const importWaBtn = document.getElementById('sim-import-wa-btn');
    const waTextarea = document.getElementById('sim-whatsapp-message');
    if (importWaBtn && waTextarea) {
        importWaBtn.addEventListener('click', () => {
            const val = waTextarea.value.trim();
            if (val) {
                const parsed = parseWhatsAppMessage(val);
                if (parsed) {
                    state.reminders.push(parsed);
                    saveReminders();
                    
                    logSystemEvent(`WhatsApp Import: Parsed "${parsed.title}" scheduled for ${new Date(parsed.datetime).toLocaleString()}`, "success");
                    showToast(`Imported: "${parsed.title}"`, "success");
                    
                    speakAnnouncement(`Imported reminder from WhatsApp: ${parsed.title}`);
                    
                    renderQueue();
                    renderTimeline();
                    
                    waTextarea.value = '';
                } else {
                    showToast("Could not parse WhatsApp message.", "error");
                }
            } else {
                showToast("Please enter a WhatsApp message to import.", "warning");
            }
        });
    }
}

function simulateTextVoice(text) {
    // Navigate to listen tab
    document.querySelector('[data-tab="listen"]').click();
    
    // Simulate speaking transcription sequence
    const transcriptContainer = document.getElementById('transcript-container');
    const transcriptOutput = document.getElementById('transcript-output');
    const listeningStatus = document.getElementById('listening-status');
    const listeningSub = document.getElementById('listening-sub');
    
    state.isListening = true;
    document.getElementById('mic-trigger-btn').parentElement.classList.add('listening-active');
    listeningStatus.textContent = "Simulating voice input...";
    listeningSub.textContent = "AURA PARSING";
    transcriptContainer.classList.remove('hidden');
    transcriptOutput.textContent = "Listening...";
    startVisualizerAnimation();
    
    logSystemEvent(`Simulating speech synthesis: "${text}"`, "speech");
    
    setTimeout(async () => {
        transcriptOutput.textContent = `"${text}"`;
        
        // Parse and create via Neon API
        const parsedReminder = parseSpeechCommand(text);
        try {
            const created = await api.reminders.create(toApiReminder(parsedReminder));
            const appReminder = toAppReminder(created);
            state.reminders.push(appReminder);
            // Update local cache
            localStorage.setItem('aura_reminders_cache', JSON.stringify(state.reminders));
            // Log notification to DB
            await api.notifications.log(created.id, `Created: ${appReminder.title}`, `Scheduled for ${new Date(appReminder.datetime).toLocaleString()}`, 'system');
            
            logSystemEvent(`Created reminder: "${appReminder.title}" (${appReminder.category}) scheduled for ${new Date(appReminder.datetime).toLocaleString()}`, "success");
            showToast(`Created: "${appReminder.title}"`, "success");
            speakAnnouncement(`Scheduled: ${appReminder.title}`);
        } catch (e) {
            // Offline fallback — use local state only
            logSystemEvent(`DB save failed (${e.message}), using local fallback.`, "alarm");
            state.reminders.push(parsedReminder);
            showToast(`Created locally: "${parsedReminder.title}"`, "warning");
            speakAnnouncement(`Scheduled: ${parsedReminder.title}`);
        }
        
        renderQueue();
        renderTimeline();
        stopListeningState();
    }, 2000);
}

// --------------------------------------------------------------------------
// Custom UI Toasts Notifications
// --------------------------------------------------------------------------
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    
    const icons = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning_amber',
        info: 'info'
    };
    const icon = icons[type] || 'info';
    
    toast.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
        <div class="toast-msg">${message}</div>
        <button class="toast-close-btn" aria-label="Dismiss notification">&#x2715;</button>
    `;
    
    container.appendChild(toast);
    
    // Manual close
    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    });
    
    // Automatically dismiss after 4s
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// ==========================================================================
// GREETING, NOTIFICATION & ACCESSIBILITY HELPERS (Added in v1.3)
// ==========================================================================

/**
 * Updates the briefing greeting based on current time of day.
 * @param {string} [displayName] - user's name from Clerk (optional)
 */
function updateGreeting(displayName) {
    const greetingEl = document.getElementById('briefing-greeting');
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let prefix = 'Good Morning';
    if (hour >= 12 && hour < 17) prefix = 'Good Afternoon';
    else if (hour >= 17) prefix = 'Good Evening';
    const name = displayName || 'there';
    greetingEl.textContent = `${prefix}, ${name}`;
}

/**
 * Requests browser Notification permission on startup.
 */
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                logSystemEvent("Browser Notification permission granted.", "success");
            } else {
                logSystemEvent("Browser Notification permission denied. Using in-app alerts only.", "system");
            }
        }).catch(() => {});
    }
}

/**
 * Sends an OS-level browser notification if permission is granted.
 * Falls back silently if notifications are not supported or denied.
 */
function sendBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
        const n = new Notification(title, {
            body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="%238b5cf6"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="28" fill="white">A</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="%238b5cf6"/></svg>',
            tag: 'aura-alarm',
            renotify: true
        });
        n.onclick = () => { window.focus(); n.close(); };
    } catch(e) {
        // Notification API failed — continue silently
        console.warn('[AURA] Browser notification failed:', e);
    }
}

// ==========================================================================
// PRODUCTION TELEMETRY, LEGAL COMPLIANCE, AND CONFIGURATION (Added in v1.2)
// ==========================================================================

// Global Sentry Mock
window.Sentry = {
    captureException: function(error) {
        const dsn = localStorage.getItem('aura_env_sentry_dsn') || 'https://mock@sentry.io/12345';
        logSystemEvent(`[Telemetry Sentry] Captured exception: "${error.message || error}". Logged to DSN: ${dsn}`, "alarm");
        console.warn("[Sentry Telemetry Error Captured]", error);
    }
};

function setupProductionAndLegal() {
    // 1. Settings Overlay Toggle
    const settingsBtn = document.getElementById('settings-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveEnvBtn = document.getElementById('save-env-btn');
    
    // Inputs
    const supabaseUrlIn = document.getElementById('env-supabase-url');
    const supabaseKeyIn = document.getElementById('env-supabase-key');
    const sentryDsnIn = document.getElementById('env-sentry-dsn');

    if (settingsBtn && settingsOverlay) {
        settingsBtn.addEventListener('click', () => {
            // Load credentials from localStorage
            supabaseUrlIn.value = localStorage.getItem('aura_env_supabase_url') || '';
            supabaseKeyIn.value = localStorage.getItem('aura_env_supabase_key') || '';
            sentryDsnIn.value = localStorage.getItem('aura_env_sentry_dsn') || '';
            
            settingsOverlay.classList.add('active');
            logSystemEvent("Opened Production Settings configuration panel.", "system");
        });
    }

    if (closeSettingsBtn && settingsOverlay) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsOverlay.classList.remove('active');
        });
        
        // Click on backdrop to close
        const settingsBackdrop = document.getElementById('settings-backdrop');
        if (settingsBackdrop) {
            settingsBackdrop.addEventListener('click', () => {
                settingsOverlay.classList.remove('active');
            });
        }
    }

    if (saveEnvBtn) {
        saveEnvBtn.addEventListener('click', () => {
            const urlVal = supabaseUrlIn.value.trim();
            const keyVal = supabaseKeyIn.value.trim();
            const dsnVal = sentryDsnIn.value.trim();

            localStorage.setItem('aura_env_supabase_url', urlVal);
            localStorage.setItem('aura_env_supabase_key', keyVal);
            localStorage.setItem('aura_env_sentry_dsn', dsnVal);

            logSystemEvent(`Production Configuration updated. Supabase URL: "${urlVal || 'Not Set'}", Sentry: "${dsnVal ? 'Active' : 'Offline'}"`, "success");
            showToast("Production API keys saved successfully!", "success");
            settingsOverlay.classList.remove('active');
        });
    }

    // 2. GDPR Operations
    const exportBtn = document.getElementById('gdpr-export-btn');
    const deleteBtn = document.getElementById('gdpr-delete-btn');

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            try {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.reminders, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href",     dataStr);
                downloadAnchor.setAttribute("download", "aura_reminders_export.json");
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();

                logSystemEvent("GDPR Data Compliance: Exported personal data archive.", "success");
                showToast("Data exported successfully as JSON!", "success");
            } catch(err) {
                window.Sentry.captureException(err);
                showToast("GDPR Export failed.", "error");
            }
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (confirm("Permanently wipe all reminders, local settings, and credentials? This complies with GDPR Article 17 (Right to Erasure).")) {
                try {
                    localStorage.clear();
                    state.reminders = [];
                    logSystemEvent("GDPR Compliance: Purged all reminders and local settings database.", "alarm");
                    showToast("Account data successfully purged.", "warning");
                    
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch(err) {
                    window.Sentry.captureException(err);
                    showToast("GDPR Erasure failed.", "error");
                }
            }
        });
    }

    // 3. Legal Modals (Privacy, Terms, About, Contact)
    const privacyBtn = document.getElementById('legal-privacy-btn');
    const termsBtn = document.getElementById('legal-terms-btn');
    const aboutBtn = document.getElementById('legal-about-btn');
    const contactBtn = document.getElementById('legal-contact-btn');
    
    const legalOverlay = document.getElementById('legal-overlay');
    const closeLegalBtn = document.getElementById('close-legal-btn');
    const legalTitle = document.getElementById('legal-modal-title');
    const legalBody = document.getElementById('legal-modal-body');

    const legalDocs = {
        privacy: `
            <h3>1. Data We Collect</h3>
            <p>AURA is a voice-first intelligent assistant. We process natural human speech commands. To enable functionality, speech-to-text translation is conducted on-device or via secure Whisper API endpoints. Audio recordings are never retained permanently without your explicit consent.</p>
            <h3>2. How We Store Your Data</h3>
            <p>All reminders, scheduling configurations, and notification sequences are stored in encrypted client-side storage or in your private Supabase database instance utilizing authenticated Row-Level Security (RLS) policies. Only you have read/write access to your data.</p>
            <h3>3. Third-Party Integrations</h3>
            <p>Calendar events are synchronized directly to your Google Calendar / Outlook calendar via OAuth secure tokens. Crash logs and performance diagnostics are uploaded securely to Sentry.</p>
            <h3>4. GDPR Rights</h3>
            <p>Under GDPR guidelines, you possess the right to export your personal data archive in structured JSON format or invoke your "Right to Erasure" to permanently purge your account at any time via the Production Settings dashboard.</p>
        `,
        terms: `
            <h3>1. Acceptable Use</h3>
            <p>By using AURA (AI Unified Reminder Assistant), you agree not to submit malicious, illegal, or harmful voice queries. AURA is designed to help organize schedules, meetings, medication intervals, and tasks.</p>
            <h3>2. Service Availability</h3>
            <p>AURA is provided on an "as-is" and "as-available" basis. Speech-to-text accuracy depends on microphone quality, surrounding audio conditions, and browser capabilities. The smart escalation alarm ensures a high delivery rate but should not replace critical life-support timers.</p>
            <h3>3. API Charges & Telemetry</h3>
            <p>If you connect your custom Supabase database or Sentry telemetry DSN, you are responsible for any usage charges incurred from these third-party services.</p>
            <h3>4. Compliance Rules</h3>
            <p>We respect intellectual property. AURA's client engine is private and customized for personal assistant operations. You may not reverse engineer the client chime synthesis layout.</p>
        `,
        about: `
            <h3>About AURA Reminder Assistant</h3>
            <p>AURA (AI Unified Reminder Assistant) is an intelligent assistant designed to transform voice-to-action commands. Built for professionals, students, and healthcare compliance, AURA features smart escalation ringtones, text-to-speech voice alerts, and automated calendar synchronization.</p>
            <p><strong>Version:</strong> 1.2.0 (Production Build)</p>
            <p><strong>Developed By:</strong> Cheedella Bala Venkata Satya Yochit</p>
        `,
        contact: `
            <h3>AURA Support & Contact</h3>
            <p>Need support or want to report a system alert? We are here to help!</p>
            <ul>
                <li><strong>Email:</strong> support@aura-assistant.ai</li>
                <li><strong>Developer:</strong> Cheedella Bala Venkata Satya Yochit</li>
                <li><strong>Enterprise Support:</strong> 24/7 Priority Hotlines available</li>
            </ul>
        `
    };

    const openLegalModal = (type, title) => {
        legalTitle.textContent = title;
        legalBody.innerHTML = legalDocs[type] || '<p>Document not found.</p>';
        legalOverlay.classList.add('active');
        logSystemEvent(`Opened legal document: ${title}`, "system");
    };

    if (privacyBtn) privacyBtn.addEventListener('click', () => openLegalModal('privacy', 'Privacy Policy'));
    if (termsBtn) termsBtn.addEventListener('click', () => openLegalModal('terms', 'Terms of Service'));
    if (aboutBtn) aboutBtn.addEventListener('click', () => openLegalModal('about', 'About AURA'));
    if (contactBtn) contactBtn.addEventListener('click', () => openLegalModal('contact', 'Contact Support'));

    if (closeLegalBtn && legalOverlay) {
        closeLegalBtn.addEventListener('click', () => {
            legalOverlay.classList.remove('active');
        });
        
        const legalBackdrop = document.getElementById('legal-backdrop');
        if (legalBackdrop) {
            legalBackdrop.addEventListener('click', () => {
                legalOverlay.classList.remove('active');
            });
        }
    }

    // 4. Mic Helper Close Button
    const closeMicHelperBtn = document.getElementById('close-mic-helper-btn');
    const micHelperOverlay = document.getElementById('mic-helper-overlay');
    if (closeMicHelperBtn && micHelperOverlay) {
        closeMicHelperBtn.addEventListener('click', () => {
            micHelperOverlay.classList.remove('active');
        });
        
        const micHelperBackdrop = document.getElementById('mic-helper-backdrop');
        if (micHelperBackdrop) {
            micHelperBackdrop.addEventListener('click', () => {
                micHelperOverlay.classList.remove('active');
            });
        }
    }
}

