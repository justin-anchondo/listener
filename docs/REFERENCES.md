# Prior Art

Similar projects reviewed on 2026-10-30, and what Listener borrows from each. None of them fit as is: they are desktop apps that capture system audio, while Listener runs on an iPhone and listens through the room mic.

| Project | What it is | Borrowed |
| --- | --- | --- |
| [Unseen](https://github.com/repowise-dev/unseen) | Electron meeting copilot. Deepgram Nova-3 with diarization, pluggable LLMs, overlay with talking points. | Trigger engine (questions, requests, keywords) plus an "ask now" button; YAML profiles that set prompt and triggers per meeting type (our `templates`); prompt caching of memory context; distilling raw logs into durable facts. |
| [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) | Tauri, Rust, and Next.js local first meeting assistant using Whisper or Parakeet and Ollama. | Privacy first defaults; one interface for model providers. Not borrowed: storing raw audio for reprocessing, which conflicts with our retention rules. |
| Hyprnote / anarlog | Open source local first notetakers that don't join calls as a bot; local SQLite; summaries, action items, cross meeting questions. | Cross meeting questions scoped to context; no bot approach. |
| [AWS Live Meeting Assistant](https://aihub.hkuspace.hku.hk/?p=2073) | AWS sample with live transcription and an agent assist backed by a knowledge base. | The "assist from your own knowledge during the call" pattern (our live recall). |
| Amurex | Self hostable meeting capture and follow up. AGPL. | Follow up tasks as a later workflow (SPEC 8). |
| [Vexa](https://awesome.ecosyste.ms/projects/github.com%2FVexa-ai%2Fvexa) | Transcription API for bots and direct streaming. | Nothing yet; bots are out of scope. |

## Technical references

- [Deepgram token based authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication): server calls `/auth/grant`, browser opens `/v1/listen` with the short lived token. The token only needs to be valid when the socket opens.
- [Deepgram Model Improvement Partnership Program](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program): `mip_opt_out=true` per request. Opting out removes the plan discount.
- WebKit microphone bugs in iOS web apps: [208209](https://bugs.webkit.org/show_bug.cgi?id=208209), [226620](https://bugs.webkit.org/show_bug.cgi?id=226620), [233629](https://bugs.webkit.org/show_bug.cgi?id=233629), [236509](https://bugs.webkit.org/show_bug.cgi?id=236509). Behavior differs between Safari tabs and Home Screen apps; see BUILD_PLAN section 4.
