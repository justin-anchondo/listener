# Listener

A private meeting scribe that runs on an iPhone docked by your desk speaker. It transcribes virtual calls live, suggests talking points, recalls past discussions with the same client, and tracks action items across every client and project.

- **SPEC.md**: what it does and the security and retention rules.
- **BUILD_PLAN.md**: architecture, data model, and build phases.
- **config.yaml**: every parameter, including retention windows.
- **CLAUDE.md**: rules for building it with Claude Code.
- **docs/REFERENCES.md**: similar projects and what was borrowed.
- **docs/phase1-results.md**: test log for the iPhone capture spike.

Status: Phase 1 (capture spike) built. Live transcription only; nothing is stored.

## Deploy to Vercel (one time)

1. Sign in at vercel.com with GitHub and choose **Add New › Project**. Import `listener`.
2. Under **Environment Variables**, add:
   - `DEEPGRAM_API_KEY`: your Deepgram key. It needs permission to create temporary tokens (Member role or higher).
   - `LISTENER_ACCESS_CODE`: a long passphrase you choose, at least 12 characters. A few random words works well.
3. Deploy. Vercel gives you an `https://` address.
4. To deploy this branch before it is merged, open the project's **Deployments** tab and use the preview deployment for `claude/intelligent-knuth-94w2ki`.

## Use it on the iPhone

1. Open the Vercel address in Safari and enter the access code.
2. Optional: Share › **Add to Home Screen** for an app icon. Phase 1 tests both ways.
3. Set **Settings › Display & Brightness › Auto-Lock** to Never while docked, or keep the app open so it can hold the screen awake.
4. Tap **Start** when the call begins. Allow the microphone when asked.
5. Tap **Details** to see delay, reconnects, and mic level. Record results in `docs/phase1-results.md`.

## Develop locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

```bash
npm test
```

Microphone access needs `https` or `localhost`, so test on the phone through the Vercel deployment.
