# Sami Clean

Cleaning schedule dashboard with Telegram reminders for **today** and **tomorrow**.

## Stack

- **Next.js** — dashboard + API
- **Prisma + PostgreSQL** (Vercel Postgres) — users, places, assignments
- **grammY** — Telegram bot (group membership sync only)
- **Vercel Cron** — daily reminders at 09:00 UTC (`vercel.json`)

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

**Bot** (terminal 2 — required for group member sync):

```bash
npm run bot
```

The bot marks users as active when they post in the group or join. `/start` in DM registers the user but does not add them to the assign list until they are in the group.

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

Cron runs at **09:00 UTC** daily (`vercel.json`). Set `CRON_SECRET` in Vercel env — Vercel sends it as `Authorization: Bearer <CRON_SECRET>` automatically.

Do **not** enable a second cron in the bot process; that would send duplicate reminders.

### Telegram bot (separate host)

The bot **cannot** run on Vercel (long-running process). Run it on Railway, Render, Fly.io, or a VPS with the **same** env vars:

```bash
npm run bot
```

| Runs on Vercel | Runs elsewhere |
|----------------|----------------|
| Dashboard + API | `npm run bot` (membership sync only) |
| Daily reminders via `/api/cron/reminders` | — |

If the bot is not deployed, reminders still work via Vercel Cron, but group membership will not stay in sync.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dashboard (dev) |
| `npm run build` | Production build |
| `npm run start` | Start dashboard (prod) |
| `npm run bot` | Telegram bot (membership sync) |
| `npm run reminders` | Send today + tomorrow reminders once |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
