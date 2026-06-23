# AURA – AI Unified Reminder Assistant

## Project Vision

AURA is a voice-first intelligent reminder assistant that transforms natural human speech into actionable reminders, schedules, and notifications without requiring any manual typing.

The goal of AURA is to function like a personal secretary that listens, understands, schedules, reminds, follows up, and ensures important tasks are not forgotten.

Unlike traditional reminder applications that only send a single notification, AURA actively interacts with the user and continues providing reminders until the task is acknowledged or completed.

---

# Core Concept

The user interacts with AURA naturally using voice commands.

Example:

User says:

"Meeting tomorrow at 9 AM with project team."

AURA automatically:

✓ Converts speech to text

✓ Extracts date and time

✓ Creates reminder

✓ Creates calendar event

✓ Stores reminder

✓ Schedules notifications

✓ Generates voice alerts

No manual typing is required.

---

# Working Example

User speaks:

"Remind me to submit my project report tomorrow at 10 AM."

AURA processes the command and extracts:

{
Title: "Project Report Submission",
Date: "Tomorrow",
Time: "10:00 AM"
}

The reminder is automatically saved and scheduled.

---

# Intelligent Reminder Flow

Traditional reminder apps generally notify once and stop.

AURA follows a smart reminder strategy.

## T - 5 Minutes

Soft notification sound plays.

Voice Message:

"You have a project team meeting in 5 minutes."

User Options:

• Acknowledge

• Snooze 5 Minutes

• Dismiss

---

## If User Acknowledges

The reminder is marked as acknowledged.

No further notifications are sent.

---

## If User Does Not Respond

AURA waits for 2 minutes.

It then sends another reminder.

Voice Message:

"Reminder. Your project team meeting starts in 3 minutes."

---

## Continued Follow-Up

If there is still no response:

8:55 AM → First Reminder

8:57 AM → Second Reminder

8:59 AM → Third Reminder

9:01 AM → Final Reminder

The cycle continues until:

• User acknowledges

• Event time expires

• Maximum retry limit is reached

This ensures important events are not accidentally missed.

---

# Human-Like Notification System

Most reminder applications use loud alarm sounds that can become irritating.

AURA uses human-friendly notification styles.

Instead of:

✗ Alarm sirens

✗ Loud ringtones

✗ Emergency sounds

AURA uses:

✓ Soft professional chimes

✓ Office assistant sounds

✓ Gentle attention tones

✓ AI-generated voice reminders

Example:

"Ding"

"Good morning. You have a meeting in 5 minutes."

This creates a professional and non-intrusive experience.

---

# Reminder Categories

Different reminder types have different tones and voice messages.

## Meeting Reminder

Professional chime

"You have a meeting in 5 minutes."

---

## Medicine Reminder

Gentle health notification

"It's time for your medicine."

---

## Assignment Reminder

Study notification tone

"Your assignment deadline is today."

---

## Personal Reminder

Friendly notification

"Don't forget Mom's birthday today."

---

# Multiple Reminder Management

Users can create unlimited reminders.

Examples:

• Project Meeting – 9 AM

• Lunch Break – 1 PM

• Doctor Appointment – 5 PM

• Assignment Submission – 8 PM

AURA maintains a reminder queue and schedules each reminder independently.

---

# Smart Escalation System

AURA classifies reminders based on priority levels.

## Low Priority

One notification only.

Examples:

• Drink water

• Read a book

---

## Medium Priority

Reminder repeats every 5 minutes.

Examples:

• Attend class

• Call friend

---

## High Priority

Reminder repeats every 2 minutes.

Examples:

• Project meeting

• Assignment submission

---

## Critical Priority

Multi-stage reminder strategy.

Example:

"Interview tomorrow at 10 AM."

AURA generates:

30 Minutes Before

15 Minutes Before

5 Minutes Before

Every 2 Minutes Until Acknowledged

This minimizes the possibility of missing important events.

---

# AI Voice Assistant

Instead of generic notifications like:

"You have a reminder."

AURA generates context-aware reminders.

Example:

"Your Cyber Knights project review meeting starts in 5 minutes."

This provides meaningful information without opening the application.

---

# Follow-Up Confirmation System

AURA focuses on task completion rather than simple notification delivery.

Example:

User says:

"Remind me to submit project report tomorrow at 10 AM."

At 10 AM:

AURA asks:

"Did you submit the project report?"

Options:

✓ Yes

✗ Not Yet

If the user selects "Not Yet":

AURA automatically reschedules the reminder.

This creates an action-completion workflow.

---

# AI Daily Briefing

Every morning AURA generates a daily overview.

Example:

Good Morning.

Today's Schedule:

• Project Meeting – 9 AM

• Assignment Deadline – 5 PM

• E-Cell Event – 6 PM

This helps users prepare for the day.

---

# Calendar Integration

User says:

"Meeting tomorrow at 9 AM."

AURA automatically:

✓ Creates reminder

✓ Stores reminder

✓ Adds event to calendar

✓ Schedules notifications

This ensures synchronization across devices.

---

# WhatsApp Reminder Import

Users can forward messages directly to AURA.

Example Message:

Project Review

Tomorrow 9 AM

AURA automatically extracts:

• Event Title

• Date

• Time

and creates a reminder.

---

# Smart Learning System

AURA learns recurring user behavior.

Example:

Every Monday → E-Cell Meeting

Every Wednesday → Project Review

After observing patterns, AURA suggests:

"Would you like to make this a recurring reminder?"

This reduces repetitive setup.

---

# Why AURA Is Different

Traditional Reminder Apps:

✗ Require typing

✗ Manual setup

✗ Easy to ignore

✗ Single notification

✗ No follow-up

AURA:

✓ Voice-first

✓ Conversational

✓ AI-powered

✓ Persistent but non-annoying

✓ Context-aware

✓ Action-oriented

✓ Completion-focused

✓ Intelligent follow-up system

AURA is not simply a reminder application. It is an AI-powered personal assistant designed to ensure that important tasks are remembered, acknowledged, and completed.
