# Listener

A private meeting scribe that runs on an iPhone docked by your desk speaker. It transcribes virtual calls live, suggests talking points, recalls past discussions with the same client, and tracks action items across every client and project.

- **SPEC.md**: what it does and the security and retention rules.
- **BUILD_PLAN.md**: architecture, data model, and build phases.
- **config.yaml**: every parameter, including retention windows.
- **CLAUDE.md**: rules for building it with Claude Code.
- **docs/REFERENCES.md**: similar projects and what was borrowed.
- **docs/phase1-results.md**: test log for the iPhone capture spike.

Status: Phase 2 built. Face ID sign in, clients and projects, and encrypted transcript storage with 30 day expiry.

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

### 4. First sign in

Open the stable address on the iPhone, enter the access code once, and approve Face ID. After that it's Face ID only. The access code can't add another passkey once one exists.

## Daily use

1. Pick the client, project, and meeting type (the last choice is remembered). Use **+** to add one on the spot, or **Manage** to rename, archive, write a project brief, or delete a client.
2. Tap **Start**. The bar under the status shows the client and project and whether lines are saving.
3. Tap **Stop**. It saves the last lines, then shows **Saved**.

Transcripts are kept 30 days after the meeting ends, then deleted by a daily job. Audio is never stored.

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
