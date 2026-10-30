# Listener: Private Meeting Scribe (Spec)

Revised 2026-10-30

## Mission

Listener is a private, always on scribe for one person's virtual meetings. It listens through an iPhone docked next to the desk speaker, transcribes live, suggests talking points during the call, recalls what was said in past meetings with the same client, and, after the call, produces feedback, a summary, and tracked action items.

Every meeting belongs to exactly one client and one project, chosen before or during the call. Each client's data is a fully separate data set.

Confidentiality outranks convenience. When a feature and the security rules in section 6 conflict, the security rule wins.

## 1. Scope

### In scope

- One user (the owner). No teams or sharing.
- Audio comes only from the iPhone microphone. The phone sits docked next to the computer speaker, so it hears both sides of a virtual call.
- An iPhone web app for capture and live help, and the same app in any browser for review and the dashboard. Nothing is installed on computers the owner does not manage.

### Out of scope

- Meeting bots, calendar bots, or anything that joins a call as a participant.
- Capturing system audio from a computer.
- Recording cellular calls.
- Storing audio.
- Multi user accounts, sharing, or exports to third parties (until a later spec revision).

## 2. Concepts

| Concept | Meaning |
| --- | --- |
| Client | An organization or person the owner works for. The top level boundary for data separation and encryption. |
| Project | A body of work under one client. Every meeting belongs to one project. |
| Meeting | One recording session, with a start, an end, a project, and an optional template. |
| Template | A meeting type such as discovery, status update, or sales call. Sets what the live assistant watches for and how the summary is structured. |
| Project brief | Short owner written context for a project: goals, stakeholders, sensitivities, open questions. Fed to the live assistant. |
| Transcript segment | A finalized chunk of transcribed speech with speaker label and timestamps. Short lived (section 5). |
| Summary | Post meeting output: summary, decisions, key quotes, feedback, tags. Long lived. |
| Action item | A commitment from a meeting: what, owner, due date, status, source quote, timestamp. Long lived. |

## 3. Capture and Live Transcription

### 3.1 Starting a meeting

- The owner picks a client and project (the most recent one is preselected) and optionally a template, then taps Start.
- Recording cannot start without a project. If the owner needs to start fast, they may pick an "Unsorted" project under a client and reassign it later. Reassignment between clients re-encrypts the data under the new client's key.
- Before the first recording for a client, the app shows a one time reminder that recording consent laws may apply. The owner acknowledges once per client.

### 3.2 Audio path

- The phone captures microphone audio and streams it directly to the transcription vendor over an encrypted WebSocket, using a short lived token issued by the Listener server.
- Audio never passes through or is stored by the Listener server.
- The transcription vendor's model improvement or training program is opted out on every request.

### 3.3 Live transcript

- Interim and final results stream back to the phone with speaker labels.
- Final segments are sent to the server as text, encrypted, and stored with an expiry (section 5).
- Target latency from speech to a visible final segment: under 1.5 seconds on a normal connection.
- The screen stays awake while recording. The app shows an obvious recording indicator and elapsed time.

### 3.4 Resilience

- If the WebSocket drops, the app reconnects automatically with a new token and marks the gap in the transcript.
- If the microphone stops delivering audio (for example after an iOS interruption), the app detects silence at the stream level within the configured window, alerts the owner on screen, and offers one tap to resume.
- Transcript segments not yet sent to the server are buffered in memory only and flushed on reconnect. They are not written to local storage.

### 3.5 Speakers

- The vendor's diarization labels speakers as Speaker 0, Speaker 1, and so on.
- After the meeting, the owner can map labels to names. "Me" is a reserved label for the owner, used by the feedback step.
- Speaker labels are per meeting only. Listener never creates, stores, or requests voiceprints or any other biometric identifier, and never recognizes speakers across meetings by voice. Name mapping is manual.

## 4. Assistance

### 4.1 Live talking points

- During the meeting the live assistant reads the rolling transcript, the project brief, the template, open action items for the project, and recent summaries for the project.
- It runs on a fixed cadence (config) and immediately when a trigger fires: a question directed at the owner, a mention of a deadline or commitment, or a topic in the project brief's open questions.
- It produces at most a few short suggestions at a time: a talking point, a question to ask, a reminder of a prior commitment, or a flag that an agenda item has not come up yet.
- Suggestions appear as cards that can be dismissed or pinned. Pinned cards are kept with the summary.

### 4.2 Live recall

- The owner can type or tap a question during the meeting ("what did we agree on pricing last time?").
- Recall searches only the current client's data: summaries, action items, project briefs, and transcripts still inside the retention window.
- Answers cite the meeting and date they came from. If the answer is not in the data, the assistant says so rather than guessing.

### 4.3 Post meeting outputs

Generated when the owner taps End, in this order:

1. Summary: purpose, main points, decisions.
2. Action items: each with what, owner (me, them, or a named person), due date if stated, source quote, and timestamp.
3. Key quotes: short verbatim excerpts worth keeping after the transcript expires. Commitments, numbers, and dates are prioritized.
4. Feedback for the owner: talk time ratio, questions asked versus answered, commitments made, agenda items or brief questions not covered, and two or three concrete suggestions for next time.
5. Tags: from a controlled list plus up to a few free form tags.

The owner reviews and can edit everything before it is saved as final. Edits are saved as a new version. Earlier versions are kept.

## 5. Data Retention

| Data | Retention | Notes |
| --- | --- | --- |
| Audio | Never stored | Section 3.2 |
| Transcript segments | 30 days from meeting end (config) | Hard deleted by a scheduled purge job |
| Summaries, key quotes, feedback, tags | Kept until the owner deletes them | Encrypted |
| Action items | Kept until the owner deletes them | Encrypted text, plaintext status and dates |
| Project briefs | Kept until the owner deletes them | Encrypted |
| Live suggestion cards | Deleted with the transcript, except pinned cards | Pinned cards follow the summary |
| Audit log | 365 days (config) | Ids and event types only, no content |

Rules:

- Every transcript segment is stored with an `expires_at` computed at write time from config.
- The purge job runs daily and hard deletes every expired row. It writes a count only to the audit log.
- The owner can delete a meeting, a project, or a whole client at any time. Deleting a client destroys its data key (section 6.2), which makes any remaining copies, including those in database backups, unreadable.
- Database backups extend the effective life of deleted rows by the backup retention period. The deployed backup retention must be documented in BUILD_PLAN and kept as short as the hosting plan allows.

## 6. Security

### 6.1 Access

- Single owner account. Public sign up is disabled.
- Sign in with a passkey (Face ID or Touch ID). Sessions expire after the configured idle time.
- The database enforces row level security. Server routes use the owner's session, not a service key, except for the purge job.

### 6.2 Encryption

- Transport: TLS everywhere.
- At rest: the hosting provider's disk encryption, plus application layer encryption for all sensitive text.
- Each client has its own data encryption key. Data keys are stored only in wrapped form, encrypted by a master key held in the server environment, never in the database.
- Sensitive fields: transcript text, summaries, key quotes, feedback, action item text and source quotes, project briefs, pinned cards, client and project names.
- Plaintext metadata is limited to ids, timestamps, durations, statuses, due dates, and tags from the controlled list.
- Algorithm: AES-256-GCM with a unique nonce per field.

### 6.3 Isolation

- Every table holding client data carries `client_id`. Every query filters on it, enforced in the data access layer and by database policy.
- Prompts sent to the model contain data from exactly one client. The consolidated open items view is built from action item fields and is never sent to a model with other clients' data in the same request.

### 6.4 Vendors and keys

- Approved data processors: transcription vendor, model provider, database host, web host. Nothing else receives client data.
- Vendor keys stay on the server. The phone gets short lived tokens scoped to transcription only.
- Before production use, the owner confirms each vendor's current data retention and training terms. Opt outs are applied where offered.

### 6.5 Logging

- Logs, traces, and error reports never contain transcript, summary, quote, brief, or action item text.
- A redaction function runs on every log call and error report. It has unit tests.

## 7. Dashboard

- Client and project navigation showing meetings, summaries, and action items for that project only.
- Meeting detail: summary, decisions, key quotes, feedback, action items, and the transcript while it is still retained (with a visible "expires in N days" label).
- Consolidated open items: all open action items across every client and project, filterable by client, project, owner, and due date. Items can be marked done, snoozed, or reassigned to a due date.
- Search within one client at a time.

## 8. Later: Workflows

Not built until the spec is revised to include them in detail. Intended direction:

- Reminders for action items with due dates, by web push and email.
- Follow up notices ("you said you'd send the proposal by Friday").
- A daily or weekly digest of open items across all clients.
- Pre meeting briefing: open items, last summary, and brief for the project about to be discussed.
- Any message that leaves the system goes to the owner only, unless a later spec revision says otherwise.

## 9. Success Criteria for the First Usable Version

- A 60 minute docked call records without the audio stopping, or recovers within the configured window with the gap marked.
- Speech appears on screen within 1.5 seconds.
- Summary and action items are ready within 60 seconds of tapping End.
- No client's data ever appears in another client's view, prompt, or recall answer.
- Expired transcripts are gone from the database within 24 hours of expiry.
- No transcript text appears in any log.
