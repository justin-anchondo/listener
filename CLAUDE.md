# Project rules for Claude Code

Project: Listener, a private meeting scribe that runs on my iPhone. SPEC.md is the source of truth; BUILD_PLAN.md is the build order.

## Non negotiable rules

1. Audio is never persisted. No audio bytes go to disk, the database, object storage, logs, or any service other than the configured transcription vendor.
2. Transcript, summary, and action item text is never logged, never sent to analytics or error trackers, and never included in error messages. Log ids and counts only.
3. Every read and write of client data is scoped by `client_id`. The only cross client view is the consolidated open items list, and it reads only action item fields.
4. Every security, scoping, and retention rule lives in `src/lib/policy` as a pure function with unit tests. No prompt, route handler, or UI component may contain or bypass one.
5. Sensitive text is encrypted at the application layer with the client's data key before it reaches the database (SPEC section 6).
6. All limits, retention windows, model names, and parameters come from `config.yaml`. No hardcoded values elsewhere.
7. Never change a retention window or security setting in `config.yaml` unless I explicitly ask in this session.
8. Vendor API keys live on the server only. The phone receives short lived tokens, never a key.
9. Do not add a new third party that receives client data (vendor, SDK, analytics, model provider) without asking me first.
10. Build only the current phase. Stop and summarize when its Done criteria are met.
11. Every new rule or fix gets a test before it is considered done.
12. If SPEC.md and BUILD_PLAN.md disagree, stop and ask me. Do not pick one silently.
