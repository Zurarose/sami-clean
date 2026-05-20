# Sami Clean

Cleaning schedule dashboard with Telegram reminders for **today** and **tomorrow**.

## Stack

- **Next.js** — dashboard + API
- **Prisma + PostgreSQL** (Vercel Postgres) — users, places, assignments
- **grammY** — Telegram bot (group membership sync only)
- **Vercel Cron** — daily reminders at 09:00 JST (`vercel.json`; `0 0 * * *` UTC)

## Features

- Monthly calendar with assignments per day
- Assign a group member to a place (one assignment per place per day)
- Add / remove places
- Person dropdown lists only **active group members** (`inGroup`)
- Telegram reminders with @mentions (`tg://user?id=…`)

## Local development

### 1. Environment

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL URL (Vercel `POSTGRES_URL` or local Postgres) |
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_GROUP_CHAT_ID` | Supergroup ID (`/chatid` in the group) |
| `CRON_SECRET` | Secret for `/api/cron/reminders` |

### 2. Database

Apply migrations to your Postgres database:

```bash
npm install
npm run db:deploy
```

Create a new migration after schema changes:

```bash
npm run db:migrate
```

### 3. Run services

**Dashboard** (terminal 1):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Bot (local polling)** — optional for local dev:

```bash
npm run bot
```

In production, use the Vercel webhook (`npm run bot:webhook` after deploy). The bot marks users as active when they post in the group or join.

## Telegram setup

- Use a **supergroup** (not a broadcast channel).
- Add the bot to the group and make it an **admin** (needed for join/leave updates).
- Set `TELEGRAM_GROUP_CHAT_ID` to the group ID from `/chatid`.
- Reminders are sent to that group chat.

## Reminders

- **Today** — assignments for the current day (manual/cron run; does not set `reminded`)
- **Tomorrow** — assignments for the next day (sets `reminded` after send)
- Only users with `inGroup: true` are included

**Manual test:**

```bash
npm run reminders
```

**HTTP trigger:**

```http
GET /api/cron/reminders?secret=YOUR_CRON_SECRET
```

Header alternative: `Authorization: Bearer YOUR_CRON_SECRET`

## Deploy to Vercel

### Web app + database

1. Push the repo to GitHub and import the project in [Vercel](https://vercel.com).
2. Add **Vercel Postgres** (Storage → Create database → connect to project).
3. Set environment variables:
   - `DATABASE_URL` = `POSTGRES_URL` from the Vercel Postgres integration
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_GROUP_CHAT_ID`
   - `CRON_SECRET` (required in production)
4. Deploy. The build runs `prisma migrate deploy` via `vercel.json`.

Cron runs at **09:00 Japan time (JST)** daily — Vercel uses UTC, so the schedule is `0 0 * * *` (00:00 UTC). Set `CRON_SECRET` in Vercel env — Vercel sends it as `Authorization: Bearer <CRON_SECRET>` automatically.

Do **not** enable a second cron in the bot process; that would send duplicate reminders.

### Telegram bot (webhook on Vercel)

Long-running `bot.start()` polling does **not** work on Vercel. Use a **webhook** instead — Telegram POSTs updates to your app.

1. Add env vars on Vercel:
   - `WEBHOOK_BASE_URL` — `https://your-app.vercel.app` (no trailing slash)
   - `TELEGRAM_WEBHOOK_SECRET` — random secret string
2. Deploy the app (includes `app/api/telegram/webhook`).
3. Register the webhook once:

```bash
WEBHOOK_BASE_URL=https://your-app.vercel.app TELEGRAM_WEBHOOK_SECRET=your-secret npm run bot:webhook
```

| Runs on Vercel | Local dev only |
|----------------|----------------|
| Dashboard + API | `npm run bot` (polling) |
| `/api/telegram/webhook` | — |
| `/api/cron/reminders` | — |

**Alternative:** run `npm run bot` on Railway/Render if you prefer polling instead of webhooks.

### Webhook troubleshooting

Check what Telegram sees:

```bash
npm run bot:webhook:info
```

Look at `last_error_message`. Common issues:

| Error | Fix |
|-------|-----|
| `404 Not Found` | Redeploy Vercel — `/api/telegram/webhook` is not live yet |
| `401` / `403` | `TELEGRAM_WEBHOOK_SECRET` must match on Vercel and when you ran `bot:webhook` |
| No `url` in output | Run `npm run bot:webhook` again |

After a new deploy, re-register the webhook:

```bash
npm run bot:webhook
```

**Test in Telegram:** use `/chatid` in the group (easier than `/start`). In groups you may need `/chatid@YourBotUsername`.

**Note:** `npm run bot:webhook` only registers the URL — it does not deploy code. Push to git → Vercel deploy → then `bot:webhook`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dashboard (dev) |
| `npm run build` | Production build |
| `npm run start` | Start dashboard (prod) |
| `npm run bot` | Telegram bot, polling (local dev) |
| `npm run bot:webhook` | Register Telegram webhook (production) |
| `npm run reminders` | Send today + tomorrow reminders once |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
