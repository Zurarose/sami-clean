# Sami Clean

Cleaning schedule dashboard with Telegram reminders (1 day before duty).

## Stack

- **Next.js** — dashboard + API
- **Prisma + SQLite** — users, places, assignments
- **grammY** — Telegram bot (register members, send @mentions)
- **node-cron** — daily reminder job (09:00 server time)

## Setup

1. Copy env file and fill values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | `file:./dev.db` (default) |
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_GROUP_CHAT_ID` | Supergroup ID (use `/chatid` in the group) |
| `CRON_SECRET` | Optional, for `/api/cron/reminders` |

2. Create DB:

```bash
npm run db:migrate
```

3. Run the bot (registers users on `/start` and when they join the group):

```bash
npm run bot
```

4. Run the dashboard:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Telegram

- Use a **supergroup** (not a broadcast channel).
- Add the bot as a member; it posts reminders to `TELEGRAM_GROUP_CHAT_ID`.
- Members run `/start` in DM or join the group to appear in the dashboard.
- Reminders mention users via `tg://user?id=…` (works without @username).

## Manual reminder test

```bash
npm run reminders
```

Or hit `GET /api/cron/reminders?secret=YOUR_CRON_SECRET` (for Vercel Cron / external scheduler).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dashboard |
| `npm run bot` | Bot + daily cron |
| `npm run reminders` | Send tomorrow's reminders once |
| `npm run db:studio` | Prisma Studio |
