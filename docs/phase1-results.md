# Phase 1 Results: Capture Spike

Fill this in from real calls on the docked iPhone. Use the Details panel on the capture screen for the numbers. Do not paste any transcript text here.

## Setup

| Item | Value |
| --- | --- |
| iPhone model |  |
| iOS version |  |
| Network (Wi-Fi or cellular) |  |
| Speaker and distance from phone |  |
| Auto-Lock setting |  |

## Automated checks (done in the build environment)

Run on 2026-10-30 in desktop Chromium with a simulated microphone and a stand-in for Deepgram. These prove the app logic, not iPhone behavior.

| Check | Result |
| --- | --- |
| Unit tests (`npm test`) | 38 passed |
| Token route without a session | 401 |
| Wrong access code | 401 |
| Session cookie | httpOnly, SameSite=Strict |
| Token route error response contains API key | No |
| Socket parameters | nova-3, diarize, `mip_opt_out=true`, linear16 at 16 kHz |
| Audio streamed | ~1.6 s of audio in the first 1.5 s, in 100 ms chunks |
| Interim and final results shown with speaker labels | Yes |
| Socket dropped mid call | Reconnected, gap marked in transcript, audio resumed |
| Unreachable transcription service | Retried on the configured backoff, then showed Resume |
| Stop sends CloseStream | Yes |
| Browser storage after a session | Empty |
| Server log content | Status codes only |

## Test 1: Safari tab, 60 minute call

| Measure | Result |
| --- | --- |
| Date |  |
| Duration recorded |  |
| Mic stopped alerts (count, cause if known) |  |
| Reconnects |  |
| Gaps in transcript (total seconds) |  |
| Median delay (ms) |  |
| Max delay (ms) |  |
| Screen awake stayed "on" |  |
| Speakers separated correctly (yes, mostly, no) |  |
| Pass |  |

## Test 2: Home Screen app, 60 minute call

Add to Home Screen from Safari's share menu, open it from the icon, and repeat.

| Measure | Result |
| --- | --- |
| Date |  |
| Duration recorded |  |
| Mic stopped alerts (count, cause if known) |  |
| Reconnects |  |
| Gaps in transcript (total seconds) |  |
| Median delay (ms) |  |
| Max delay (ms) |  |
| Screen awake stayed "on" |  |
| Speakers separated correctly (yes, mostly, no) |  |
| Pass |  |

## Interruption checks (either mode)

| Action during recording | Recovered on its own | Recovered after Resume | Did not recover |
| --- | --- | --- | --- |
| Notification banner arrives |  |  |  |
| Open and close Control Center |  |  |  |
| Lock and unlock the phone |  |  |  |
| Switch to another app and back |  |  |  |
| Wi-Fi drops for 10 seconds |  |  |  |

## Mic settings tried

`config.yaml` > `capture`: echo cancellation, noise suppression, auto gain. Note which combination gave the clearest transcript of the far side of the call.

| echo_cancellation | noise_suppression | auto_gain_control | Notes |
| --- | --- | --- | --- |
| false | false | true | default |

## Decision

- [ ] Web app holds a 60 minute call. Proceed to Phase 2.
- [ ] Web app does not hold. Wrap with Capacitor before Phase 2 (BUILD_PLAN section 4).
