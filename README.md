# Listener

A private meeting scribe that runs on an iPhone docked by your desk speaker. It transcribes virtual calls live, suggests talking points, recalls past discussions with the same client, and tracks action items across every client and project.

- **SPEC.md**: what it does and the security and retention rules.
- **BUILD_PLAN.md**: architecture, data model, and build phases.
- **config.yaml**: every parameter, including retention windows.
- **CLAUDE.md**: rules for building it with Claude Code.
- **docs/REFERENCES.md**: similar projects and what was borrowed.
- **docs/phase1-results.md**: test log for the iPhone capture spike.

Status: Phase 3 built. Summaries, action items, feedback, meeting history per project, and open items across all clients.

## One time setup

### 1. Generate secrets

Open the app's address once the new deployment is live. Until everything is configured it shows a setup screen listing what's missing, with freshly generated values for `LISTENER_MASTER_KEY`, `CRON_SECRET`, and the database password. They're made in your browser and never sent anywhere. **Save `LISTENER_MASTER_KEY` in your password manager.** If it's lost, stored data can't be decrypted.

### 2. Create the database (Supabase)

1. At supabase.com, create a project. Pick the **US East** region (closest to Vercel's default). Save the database password it gives you.
2. Open **SQL Editor**, paste the whole of `db/migrations/0001_init.sql`, and run it.
3. In a new query, run this with the generated database password:
   ```sql
   alter role listener_app password 'PASTE_GENERATED_PASSWORD';
   ```
4. Click **Connect**, choose **Transaction pooler**, and copy the connection string. It looks like `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`. Change `postgres.abcdefgh` to `listener_app.abcdefgh` (keep your project's code after the dot) and put the generated password in place of `[YOUR-PASSWORD]`. That's your `DATABASE_URL`.

### 3. Add settings in Vercel

Settings › Environment Variables, all environments checked:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | From step 2 |
| `LISTENER_MASTER_KEY` | From step 1 |
| `CRON_SECRET` | From step 1 |
| `LISTENER_ACCESS_CODE` | Already set. Now only used once, to set up Face ID |
| `DEEPGRAM_API_KEY` | Already set |
| `LISTENER_ORIGIN` | Your stable address, e.g. `https://listener-yourname.vercel.app` |

Then redeploy. Passkeys belong to one web address, so always use the stable one.

### 3b. Phase 3 additions

1. In Supabase **SQL Editor › + New query**, paste all of `db/migrations/0002_summaries.sql` and run it. Then do the same with `db/migrations/0003_brief_amendments.sql`.
2. Then run `db/migrations/0004_logos_types_recent.sql` the same way (client logos, editable meeting types, recent meetings list), then `db/migrations/0005_live_suggestions.sql` (live tips), then `db/migrations/0006_live_follow.sql` (desktop live view), and then `db/migrations/0007_device_pairing.sql` (computer sign in from the phone).
3. In Vercel, add `ANTHROPIC_API_KEY` (Secret) with an API key from console.anthropic.com, then redeploy.

### 4. First sign in

Open the stable address on the iPhone, enter the access code once, and approve Face ID. After that it's Face ID only. The access code can't add another passkey once one exists.

## Daily use

Three tabs at the bottom: **Record**, **Meetings**, **Open items**. The small sun / moon button at the top of the Record screen switches light and dark mode; the phone remembers it.

1. **Record:** tap the client / project pill to choose (or add) a client, project, and meeting type in the sheet that slides up. The pencil next to **Client** opens the client page; the pencil next to **Meeting type** edits the types (name and what to watch for). `config.yaml` only provides the starting types. Your last choice is remembered. Tap the big button to start.
2. While recording, the transcript fills the screen and the bar at the bottom shows the timer and mic level. Tap **ⓘ** for connection details, **■** to stop.
   - **Live tips** are off for every meeting unless you turn them on: tap **Live tips off** under the meeting type before you start, or **Tips** at the top during the call (the top bar stays pinned while the transcript scrolls). Each new meeting starts with them off again. When on, a card appears at the top only when something is worth interrupting you for: something to say, a question to ask, a reminder from earlier meetings, or a brief item that hasn't come up. Checks run every 90 seconds, and sooner (no closer than 30 seconds apart) when someone asks you a question, a commitment or date comes up, or a brief topic is mentioned. Swipe or use the arrows for older ones, **pin** a card to keep it with the summary, **×** to dismiss.
   - If no one has spoken for a minute, a prompt asks **Is the call over?** with **End recording** and **Keep going** (it won't ask again for 2 minutes). Both times are in `config.yaml` (`capture.silence_prompt_seconds`, `silence_snooze_seconds`). The desktop live view shows the same notice; end the recording on the phone.
   - **?** opens **Ask**: questions about this client ("what did we agree on pricing?"), answered only from this client's meetings, briefs, and action items, with the meetings it used. It says when the answer isn't there.
3. **Meetings:** recent meetings across clients, with generated title, participants, client, project, and time. Tap a client chip to filter, then **Client page**. Swipe a meeting left (or use the trash icon on a computer) to delete it; you're asked to confirm, and its transcript, summary, action items, brief notes, and tips go with it. A client page shows that client's meetings with its projects as chips: tap one to see its brief and meetings right there; the small **+** adds a project, and the pencils edit the client or the selected project.

After **Stop**, the summary and action items are generated automatically (usually under a minute). Tap **View** to open the meeting:

- Only your own commitments become action items. What other people committed to is listed on the summary under **Others committed to** (set `assist.only_my_action_items` to false in `config.yaml` to track everyone's).
- Tick action items done, edit their text, owner, or due date, or add your own.
- Under **Speakers**, name the people on the call and pick which one is **Me**, then **Regenerate** for feedback on your own talk time.
- **Edit summary** saves a new version. Earlier versions are kept.
- **Merge** (the icon at the top right) joins this meeting with another recording of the same call, for when you got disconnected and started again. It lists this client's recordings within a few hours (config `storage.merge_window_hours`). The two become one meeting under the earlier recording, the transcript is joined in order, and the summary is rebuilt. Completed and edited action items, pinned tips, and brief notes carry over. Both transcripts must still be kept (30 days).

**On a computer:** wide screens get a desktop layout: a sidebar (Live, Meetings, Open items, and your clients), meeting pages with action items beside the summary, client and project pages in two columns, and meeting lists as a table. Opening the app on a computer goes to Live, since the phone is the microphone. Click an action item to edit it.

**Desktop live view:** keep recording on the phone, and open `/live` (or **Live view** at the top of the Record screen on a computer) in a desktop browser. To sign in there, the computer goes straight to **Sign in with your phone** and shows a code and a QR code (phones still get Face ID). Scan it with the iPhone (or open `/pair` on the phone and type the code), check the code matches, and tap **Approve with Face ID**. The computer signs in within a few seconds; codes expire after 2 minutes and work once. On the phone, the **computer icon** at the top of the Record screen opens a built-in scanner (or type the code). After the first time, the Live page offers **Set up Windows Hello** (or Touch ID on a Mac): then the computer signs in with one click and your PIN or fingerprint, and the phone is only needed if that ever fails. (If the computer allows Bluetooth, the browser's own **Use a phone or tablet** passkey option works too.) The page picks up the recording within a few seconds and shows the transcript on the left and live tips on the right. **Live tips on/off** works from either screen; pins and dismissals sync both ways. **Ask** works here too. **Alerts** turns on desktop notifications for new tips (they can show on a shared screen, so leave them off when presenting).

**Project brief:** open a project (Meetings tab) to write its brief (up to 40,000 characters), or tap **Upload .md** in the editor to load a Markdown or text file (on a computer you can also drop the file on the text box). The file's text goes into the editor for you to check before saving; the file itself isn't stored. After each meeting, new lasting facts are added under **Updates** with the date and a link to the meeting. Your brief itself is never changed automatically. Dismiss an update with **×** (it stays in the history and can be restored), or add your own with **+ Note**.

**Open items** lists everything still open: **All clients** groups by due date (overdue, today, next 7 days, later, no date, snoozed); **By client** groups by client with open and overdue counts. Each item has a due date chip (red overdue, amber due soon); tap it to pick a date. Tap an item to edit it, snooze it a week, or open its meeting.

Transcripts and unpinned live tips are kept 30 days after the meeting ends, then deleted by a daily job. Summaries, action items, and pinned tips are kept. Audio is never stored.

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

Database tests run when `TEST_DATABASE_URL` (as `listener_app`) and `TEST_DATABASE_ADMIN_URL` (owner) point at a Postgres with the migrations applied. Otherwise they're skipped.
