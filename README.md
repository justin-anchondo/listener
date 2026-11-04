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
2. Then run `db/migrations/0004_logos_types_recent.sql` the same way (client logos, editable meeting types, recent meetings list).
3. In Vercel, add `ANTHROPIC_API_KEY` (Secret) with an API key from console.anthropic.com, then redeploy.

### 4. First sign in

Open the stable address on the iPhone, enter the access code once, and approve Face ID. After that it's Face ID only. The access code can't add another passkey once one exists.

## Daily use

Three tabs at the bottom: **Record**, **Meetings**, **Open items**. The small sun / moon button at the top of the Record screen switches light and dark mode; the phone remembers it.

1. **Record:** tap the client / project pill to choose (or add) a client, project, and meeting type in the sheet that slides up. The pencil next to **Client** opens the client page; the pencil next to **Meeting type** edits the types (name and what to watch for). `config.yaml` only provides the starting types. Your last choice is remembered. Tap the big button to start.
2. While recording, the transcript fills the screen and the bar at the bottom shows the timer and mic level. Tap **ⓘ** for connection details, **■** to stop.
3. **Meetings:** recent meetings across clients, with generated title, participants, client, project, and time. Tap a client chip to filter, then **Client page** for that client's projects and meetings. **+ New client** is at the end of the chips. The pencil on a client page edits the name and logo or deletes the client; the pencil on a project page renames or archives it.

After **Stop**, the summary and action items are generated automatically (usually under a minute). Tap **View** to open the meeting:

- Tick action items done, edit their text, owner, or due date, or add your own.
- Under **Speakers**, name the people on the call and pick which one is **Me**, then **Regenerate** for feedback on your own talk time.
- **Edit summary** saves a new version. Earlier versions are kept.

**Project brief:** open a project (Meetings tab) to write its brief. After each meeting, new lasting facts are added under **Updates** with the date and a link to the meeting. Your brief itself is never changed automatically. Dismiss an update with **×** (it stays in the history and can be restored), or add your own with **+ Note**.

**Open items** lists everything still open: **All clients** groups by due date (overdue, today, next 7 days, later, no date, snoozed); **By client** groups by client with open and overdue counts. Each item has a due date chip (red overdue, amber due soon); tap it to pick a date. Tap an item to edit it, snooze it a week, or open its meeting.

Transcripts are kept 30 days after the meeting ends, then deleted by a daily job. Summaries and action items are kept. Audio is never stored.

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
