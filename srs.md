# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

# AURA – AI Unified Reminder Assistant

Version: 1.0

Prepared By: Cheedella Bala Venkata Satya Yochit

Project Type: AI-Powered Voice Reminder Assistant

---

# 1. Introduction

## 1.1 Purpose

The purpose of this Software Requirements Specification (SRS) document is to define the functional and non-functional requirements of AURA (AI Unified Reminder Assistant).

AURA is a voice-first reminder management system that enables users to create reminders through natural speech, receive intelligent voice notifications, and track task completion through AI-powered follow-up mechanisms.

The document serves as a reference for developers, testers, project evaluators, and future stakeholders.

---

## 1.2 Scope

AURA provides:

* Voice-based reminder creation
* Automatic speech recognition
* AI-powered intent extraction
* Reminder scheduling
* Smart notifications
* Voice announcements
* Calendar integration
* Task completion tracking
* Multiple reminder management
* Intelligent reminder escalation

The application is intended for students, professionals, business users, and elderly individuals.

---

## 1.3 Definitions

| Term           | Description                                   |
| -------------- | --------------------------------------------- |
| AURA           | AI Unified Reminder Assistant                 |
| STT            | Speech-to-Text                                |
| TTS            | Text-to-Speech                                |
| NLP            | Natural Language Processing                   |
| Reminder       | Scheduled task notification                   |
| Escalation     | Repeated reminder alerts until acknowledgment |
| Acknowledgment | User confirmation of notification             |
| Snooze         | Temporary postponement of reminder            |

---

# 2. Overall Description

## 2.1 Product Perspective

AURA is a standalone mobile application that acts as a personal reminder assistant.

The application uses:

* Voice Input
* Speech Recognition
* AI Processing
* Notification Scheduling
* Text-to-Speech

to provide an intelligent reminder ecosystem.

---

## 2.2 Product Functions

The major functions of the system include:

### Voice Reminder Creation

Users create reminders through speech.

Example:

"Meeting tomorrow at 9 AM."

---

### Reminder Scheduling

Automatically schedule reminders.

---

### Calendar Event Creation

Generate calendar events automatically.

---

### Voice Notifications

Provide spoken reminders.

Example:

"You have a meeting in 5 minutes."

---

### Smart Escalation

Repeat reminders if ignored.

---

### Follow-Up Confirmation

Ask whether a task was completed.

---

### Daily Briefing

Provide summary of daily schedules.

---

### Smart Learning

Suggest recurring reminders based on behavior.

---

## 2.3 User Classes

### Student

Uses assignment reminders and exam schedules.

---

### Professional

Uses meeting reminders and project schedules.

---

### Elderly User

Uses medicine reminders and appointment tracking.

---

### General User

Uses daily task and personal reminders.

---

## 2.4 Operating Environment

### Mobile Platform

Android 10+

Future:

iOS Support

---

### Development Environment

Frontend:

Flutter

Backend:

FastAPI

Database:

Supabase PostgreSQL

---

## 2.5 Constraints

* Internet required for AI processing.
* Speech recognition accuracy depends on audio quality.
* Notification permissions must be granted.
* Calendar permissions required for event creation.

---

# 3. System Features

---

# Feature 1: Voice Reminder Creation

## Description

Users create reminders using natural speech.

Example:

"Remind me to submit my project tomorrow at 10 AM."

---

## Functional Requirements

FR-01

System shall record voice input.

FR-02

System shall convert speech to text.

FR-03

System shall extract title.

FR-04

System shall extract date.

FR-05

System shall extract time.

FR-06

System shall create reminder automatically.

---

# Feature 2: Speech-to-Text Processing

## Description

Convert spoken audio into text.

Input:

Voice

Output:

Text

Example:

Input:

Meeting tomorrow at 9 AM

Output:

Meeting tomorrow at 9 AM

---

# Feature 3: AI Intent Extraction

## Description

Identify user intention and reminder details.

Example:

Input:

Meeting tomorrow at 9 AM.

Output:

{
Title: "Project Meeting",
Date: "Tomorrow",
Time: "9:00 AM"
}

---

# Feature 4: Reminder Scheduling

## Description

Schedule notifications according to reminder time.

Requirements:

FR-07

System shall save reminder.

FR-08

System shall schedule notification.

FR-09

System shall trigger reminder on time.

---

# Feature 5: Voice Notifications

## Description

Generate spoken reminders.

Example:

"You have a project review meeting in 5 minutes."

Requirements:

FR-10

System shall play notification sound.

FR-11

System shall generate voice output.

FR-12

System shall display reminder details.

---

# Feature 6: Smart Escalation Engine

## Description

Provide repeated notifications when reminders are ignored.

Example:

8:55 AM

Reminder

8:57 AM

Reminder Again

8:59 AM

Reminder Again

Requirements:

FR-13

System shall repeat reminders.

FR-14

System shall stop reminders when acknowledged.

FR-15

System shall follow escalation rules.

---

# Feature 7: Multiple Reminder Support

## Description

Support unlimited reminders.

Requirements:

FR-16

System shall store multiple reminders.

FR-17

System shall execute reminders independently.

FR-18

System shall manage notification queues.

---

# Feature 8: Reminder Categories

Categories:

* Meetings
* Assignments
* Medicine
* Birthdays
* Bills
* Personal
* Custom

Requirements:

FR-19

System shall categorize reminders.

FR-20

System shall use category-specific voice messages.

---

# Feature 9: Follow-Up Confirmation

## Description

Track completion of tasks.

Example:

"Did you submit the project report?"

Options:

* Yes
* Not Yet

Requirements:

FR-21

System shall ask completion status.

FR-22

System shall reschedule incomplete tasks.

FR-23

System shall update reminder status.

---

# Feature 10: Daily Briefing

## Description

Generate daily schedule summary.

Example:

Good Morning.

Today's Schedule:

• Meeting at 9 AM

• Assignment at 5 PM

• Event at 6 PM

Requirements:

FR-24

System shall generate daily summary.

FR-25

System shall display upcoming reminders.

---

# Feature 11: Calendar Integration

Requirements:

FR-26

System shall create calendar events.

FR-27

System shall synchronize reminder information.

---

# Feature 12: Smart Learning

Requirements:

FR-28

System shall analyze recurring reminders.

FR-29

System shall suggest recurring schedules.

FR-30

System shall learn user patterns.

---

# 4. External Interface Requirements

## User Interface

### Home Screen

Displays:

* Upcoming reminders
* Quick voice button
* Daily briefing

---

### Voice Recording Screen

Functions:

* Start recording
* Stop recording
* Process command

---

### Reminder Dashboard

Displays:

* Reminder list
* Categories
* Completion status

---

## Hardware Interface

Supported Devices:

* Android Smartphones
* Tablets

Microphone required.

Speaker required.

---

## Software Interface

### Supabase

Authentication

Database Storage

Cloud Sync

---

### Whisper API

Speech Recognition

---

### GPT API

Intent Extraction

Natural Language Understanding

---

### Firebase

Push Notifications

---

# 5. Non-Functional Requirements

## Performance

Voice processing:

< 3 seconds

Reminder creation:

< 5 seconds

---

## Reliability

Reminder delivery rate:

99%

---

## Availability

24×7 operation

---

## Security

Encrypted data storage

Secure authentication

Protected API communication

---

## Scalability

Support thousands of users.

---

## Maintainability

Modular architecture.

Independent services.

---

# 6. System Workflow

User Speaks
↓
Microphone Input
↓
Speech-to-Text Engine
↓
AI Intent Extraction
↓
Reminder Generation
↓
Database Storage
↓
Notification Scheduling
↓
Voice Reminder Delivery
↓
User Response
↓
Completion Tracking

---

# 7. Database Design

Users

* UserID
* Name
* Email

Reminders

* ReminderID
* UserID
* Title
* Category
* Date
* Time
* Priority
* Status

Notifications

* NotificationID
* ReminderID
* AlertTime
* Acknowledged

VoiceLogs

* LogID
* InputText
* Timestamp

CalendarEvents

* EventID
* ReminderID
* CalendarStatus

---

# 8.  Enhancements

Multi-Language Support

---

# 9. Acceptance Criteria

The system shall be considered successful when:

✓ Users can create reminders using voice.

✓ Reminders are scheduled automatically.

✓ Voice notifications are delivered correctly.

✓ Escalation reminders work as expected.

✓ Calendar events are generated automatically.

✓ Follow-up confirmations are recorded.

✓ Multiple reminders are handled simultaneously.

✓ Daily briefing is generated successfully.

---

# 10. Conclusion

AURA is an intelligent voice-first reminder assistant designed to simplify reminder creation, improve task completion rates, and reduce missed events through AI-powered speech understanding and persistent notification mechanisms. The system combines speech recognition, natural language processing, reminder automation, and smart follow-up strategies to deliver a next-generation productivity experience.
