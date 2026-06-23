# SYSTEM ANALYSIS AND DESIGN (SAD)

# AURA – AI Unified Reminder Assistant

Version: 1.0

Prepared By: Cheedella Bala Venkata Satya Yochit

Project Type: AI-Powered Voice Reminder Assistant

---

# CHAPTER 1: SYSTEM ANALYSIS

## 1.1 Introduction

AURA (AI Unified Reminder Assistant) is a voice-first intelligent reminder application designed to help users create, manage, and complete reminders using natural speech. The system eliminates manual typing by converting spoken commands into actionable reminders and calendar events.

The application combines Speech Recognition, Artificial Intelligence, Natural Language Processing, Reminder Scheduling, and Voice Notifications to provide a seamless productivity experience.

---

## 1.2 Existing System

Traditional reminder applications such as alarm apps and calendar apps require users to manually enter reminder details.

### Existing Process

1. Open reminder application
2. Create new reminder
3. Enter title
4. Select date
5. Select time
6. Save reminder

### Drawbacks

* Time-consuming
* Requires manual typing
* Easy to ignore notifications
* No intelligent follow-up
* No voice interaction
* No task completion tracking

---

## 1.3 Proposed System

AURA introduces a voice-driven reminder management system.

### Example

User says:

"Meeting tomorrow at 9 AM with project team."

AURA automatically:

* Converts speech into text
* Extracts event details
* Creates reminder
* Adds calendar event
* Schedules notifications
* Generates voice alerts

No manual typing is required.

---

## 1.4 Objectives

### Primary Objectives

* Enable voice-based reminder creation
* Improve task completion rates
* Reduce missed deadlines
* Provide intelligent notifications
* Simplify daily scheduling

### Secondary Objectives

* Calendar integration
* Smart reminder escalation
* Daily schedule briefing
* Personalized voice assistant

---

## 1.5 Feasibility Study

### Technical Feasibility

The project can be developed using:

* Flutter
* FastAPI
* Supabase
* Whisper API
* GPT API
* Firebase

Result:

Technically Feasible

---

### Economic Feasibility

Development tools:

* Flutter (Free)
* FastAPI (Free)
* Supabase (Free Tier)
* Firebase (Free Tier)

Result:

Economically Feasible

---

### Operational Feasibility

Users interact naturally through speech.

No technical expertise required.

Result:

Operationally Feasible

---

## 1.6 Functional Requirements

### FR-01

System shall capture voice input.

### FR-02

System shall convert speech into text.

### FR-03

System shall identify reminder title.

### FR-04

System shall identify date and time.

### FR-05

System shall create reminders automatically.

### FR-06

System shall schedule notifications.

### FR-07

System shall generate voice reminders.

### FR-08

System shall support reminder escalation.

### FR-09

System shall allow snooze operations.

### FR-10

System shall support multiple reminders.

### FR-11

System shall synchronize calendar events.

### FR-12

System shall provide daily briefings.

---

## 1.7 Non-Functional Requirements

### Performance

Response time less than 3 seconds.

### Reliability

99% reminder delivery.

### Security

Encrypted user data.

### Scalability

Support thousands of users.

### Availability

24×7 service availability.

---

# CHAPTER 2: SYSTEM DESIGN

## 2.1 System Architecture

User
↓
Voice Input
↓
Speech-to-Text Engine
↓
AI Intent Extraction
↓
Reminder Processing Engine
↓
Database
↓
Notification Scheduler
↓
Voice Notification Engine
↓
User Response Handler

---

## 2.2 High-Level Architecture

+--------------------+
| Mobile Application |
+--------------------+
|
v
+----------------------+
| Speech Recognition |
+----------------------+
|
v
+----------------------+
| AI Intent Analyzer |
+----------------------+
|
v
+----------------------+
| Reminder Manager |
+----------------------+
|
v
+----------------------+
| Notification Engine |
+----------------------+
|
v
+----------------------+
| Database |
+----------------------+

---

## 2.3 Smart Reminder Workflow

### Reminder Created

User:

"Meeting tomorrow at 9 AM"

System:

Creates reminder.

---

### Five Minutes Before

Voice Alert:

"You have a meeting in 5 minutes."

Options:

* Acknowledge
* Snooze
* Dismiss

---

### No Response

After 2 minutes:

"Reminder. Your meeting begins shortly."

---

### Repetition

8:55 AM

First Alert

8:57 AM

Second Alert

8:59 AM

Third Alert

9:01 AM

Final Alert

---

### Stop Conditions

* User acknowledges
* Event expires
* Retry limit reached

---

## 2.4 Reminder Priority Levels

### Low Priority

Single notification.

Example:

Drink Water

---

### Medium Priority

Reminder every 5 minutes.

Example:

Attend Class

---

### High Priority

Reminder every 2 minutes.

Example:

Project Submission

---

### Critical Priority

30 Minutes Before

15 Minutes Before

5 Minutes Before

Every 2 Minutes Until Acknowledged

Example:

Job Interview

---

## 2.5 Database Design

### Users Table

| Field  | Type   |
| ------ | ------ |
| UserID | UUID   |
| Name   | String |
| Email  | String |

---

### Reminders Table

| Field      | Type   |
| ---------- | ------ |
| ReminderID | UUID   |
| UserID     | UUID   |
| Title      | String |
| Category   | String |
| Date       | Date   |
| Time       | Time   |
| Priority   | String |
| Status     | String |

---

### Notifications Table

| Field          | Type      |
| -------------- | --------- |
| NotificationID | UUID      |
| ReminderID     | UUID      |
| AlertTime      | Timestamp |
| Acknowledged   | Boolean   |

---

### VoiceLogs Table

| Field     | Type      |
| --------- | --------- |
| LogID     | UUID      |
| InputText | Text      |
| Timestamp | Timestamp |

---

## 2.6 Use Case Diagram

Actor:

User

Use Cases:

* Record Voice
* Create Reminder
* View Reminders
* Edit Reminder
* Delete Reminder
* Snooze Reminder
* Acknowledge Reminder
* View Daily Briefing
* Calendar Synchronization

---

## 2.7 Activity Diagram

Start
↓
User Speaks
↓
Speech Recognition
↓
Intent Extraction
↓
Create Reminder
↓
Store in Database
↓
Schedule Notification
↓
Trigger Reminder
↓
User Response?
↓
Yes → Stop Reminder
↓
No → Escalate Reminder
↓
End

---

## 2.8 Sequence Diagram

User
↓
AURA App
↓
Speech Recognition
↓
AI Engine
↓
Database
↓
Notification System

Sequence:

1. User gives voice command.
2. App records speech.
3. Speech converted to text.
4. AI extracts reminder information.
5. Reminder stored in database.
6. Notification scheduled.
7. Reminder delivered.
8. User acknowledges reminder.

---

## 2.9 Technology Stack

### Frontend

Flutter

### Backend

FastAPI

### Database

Supabase PostgreSQL

### Authentication

Supabase Auth

### Speech Recognition

Whisper API

### AI Processing

OpenAI GPT

### Notifications

Firebase Cloud Messaging

### Voice Output

Text-to-Speech (TTS)

---

## 2.10 Enhancements

* Multi-language support
* AI daily planner
* AI personal secretary
* Offline speech recognition
* Productivity analytics dashboard

---

# Conclusion

AURA is a next-generation voice-first reminder assistant that combines Speech Recognition, Artificial Intelligence, Smart Notifications, and Calendar Integration to provide an intelligent and user-friendly productivity solution. The system minimizes manual effort, improves reminder effectiveness, and ensures important tasks are remembered and completed through persistent AI-powered follow-up mechanisms.
