# TGW Operations Platform

Enterprise-grade operations platform for glazing company.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- TailwindCSS
- ShadCN UI
- Drizzle ORM
- Supabase
- Zod
- Zustand
- React Query

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Run the development server:
```bash
npm run dev
```

## Database

- Generate migrations: `npm run db:generate`
- Push migrations: `npm run db:push`
- Open Drizzle Studio: `npm run db:studio`

## Email configuration

- Set `RESEND_API_KEY` on the server.
- Set defaults with `COMM_DEFAULT_FROM_EMAIL`, `COMM_DEFAULT_FROM_NAME`, and optional `COMM_DEFAULT_REPLY_TO`.
- Restrict sender domains with `COMM_ALLOWED_FROM_DOMAINS` (comma-separated, e.g. `easyflowops.com.au,clientcustomdomain.com`).
- In the app, go to Settings > Communications to set org sender identity, edit templates, and test sending.

## Automations

- Automations live in Settings > Automations and are scoped per org.
- Templates provide a starter configuration. Rules are stored as trigger, conditions, and actions.
- Dispatch queued actions by calling `POST /api/automations/dispatch` on a cron (every 1-5 minutes).
- Use `POST /api/automations/test` with a mock event payload to see which rules would run (admin only).
- Set `AUTOMATIONS_ENABLED=false` to disable evaluation globally.

