# Studyclay

An AI study planner. It builds a realistic weekly study plan around your school
timetable, tracks what you actually study, prepares you for exams, and adapts
the plan whenever something changes.

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. The app starts with an example student so you can
look around. When you are ready, go to **Settings → Clear sample data and start
fresh**, then add your subjects and timetable.

No setup is needed for the database: by default everything is saved to a local
database in `~/.studyclay/data` on your computer.

## Connect Claude (optional, recommended)

The planner schedules and adapts your week by itself. A Claude API key adds:

- the **AI Study Assistant** chat, which changes your plan when you tell it things;
- **Claude-designed plans** (it picks the topic and study method for each session);
- written **recommendations** on the dashboard;
- **timetable upload** from a photo, PDF, Word document or text file.

1. Create a key at https://console.anthropic.com/settings/keys
2. Copy the example settings file:

   ```bash
   cp .env.example .env.local
   ```

3. Put the key in `.env.local`:

   ```
   ANTHROPIC_API_KEY=your-key-here
   ```

4. Restart `npm run dev`.

The key is only read on the server (`src/lib/ai/client.ts`). It is never sent to
the browser. To use a different model, set `ANTHROPIC_MODEL` (default
`claude-opus-5-5`).

## Put it online (optional)

Hosting services such as Vercel cannot keep a local database file, so give the
app a Postgres database:

1. Create a Postgres database (a free Supabase project works: Project Settings →
   Database → Connection string → URI).
2. In your host's environment variables set:
   - `DATABASE_URL` = that connection string
   - `ANTHROPIC_API_KEY` = your Claude key
   - `APP_PASSWORD` = a password of your choice. **Set this.** Without it anyone
     with the link can see your data and use your Claude key.
3. Deploy. Tables are created automatically in their own `study_planner` schema.

If `DATABASE_URL` is missing on a host that cannot write files, the app still
runs but shows a red warning that data is held in memory only.

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Planning engine | `src/lib/engine.ts` | Pure functions. Works out free time, a per-day and per-week ceiling, how much each subject needs (exam dates, confidence, missed and extra study), then makes the smallest set of changes to the upcoming plan. |
| Actions | `src/lib/service.ts` | Every change (from a button or from Claude) is validated here, saved in a transaction, and followed by a re-plan. |
| Claude | `src/lib/ai/` | Chat with tools, plan design, timetable extraction. Claude proposes; the engine and the actions validate before anything is saved. |
| Database | `src/lib/db.ts`, `src/lib/store.ts` | One Postgres schema used by both the local database and a hosted one. |
| Interface | `src/app/`, `src/components/` | Dashboard, timetable, planner, log, exams, calendar, assistant, settings. |

Safeguards:

- Completed, partly done and missed sessions and all study logs are never
  changed by planning. Only future sessions that are still "planned" can move.
- Sessions you place or move yourself are fixed; the planner works around them.
- Sessions cannot overlap classes, commitments, days off or each other.
- Every automatic change is listed on the Study Planner page with its reason,
  and the most recent one can be undone.
- Settings has a one-click backup download and restore.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | TypeScript check |
| `npm test` | Planning engine tests |
