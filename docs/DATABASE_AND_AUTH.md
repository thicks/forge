# Database & Authentication Options

## Database Options

### PostgreSQL

Uses Docker Compose for local PostgreSQL with Drizzle ORM.

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/)

```bash
pnpm dev new my-app --db postgres
cd my-app
docker compose up -d    # Start PostgreSQL
pnpm db:push            # Push schema
pnpm dev                # Start dev server
```

### Supabase

Uses Supabase CLI for local development (PostgreSQL, Auth, Storage, Realtime).

**Prerequisites:** [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`brew install supabase/tap/supabase`)

```bash
pnpm dev new my-app --db supabase
cd my-app
pnpm dev                # Starts Supabase + Next.js dev server
```

The `dev` script automatically starts Supabase via `supabase status || supabase start` before launching Next.js.

When combined with `--vercel`, Supabase is fully provisioned: project creation, readiness polling, linking, migrations, and `DATABASE_URL` configuration across all Vercel environments.

## Authentication Options

### Simple

Cookie-based session auth for prototyping. Accepts any username/password. Protected routes redirect to `/login`.

```bash
pnpm dev new my-app --auth simple
```

### WorkOS

Enterprise SSO via [WorkOS AuthKit](https://workos.com/docs/user-management). Supports SSO, SCIM, and directory sync.

```bash
pnpm dev new my-app --auth workos
```

Requires `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and `WORKOS_COOKIE_PASSWORD` (auto-generated during project creation). If you've configured WorkOS defaults via `forge config`, credentials are automatically populated in `.env.local`.

### Better Auth

Full-featured authentication via [Better Auth](https://better-auth.com). Supports email/password out of the box with a plugin ecosystem for 2FA, passkeys, magic links, organizations, and more.

```bash
# With local PostgreSQL
pnpm dev new my-app --auth better-auth --db postgres

# With local Supabase
pnpm dev new my-app --auth better-auth --db supabase

# With cloud Supabase
pnpm dev new my-app --auth better-auth --supabase
```

**Note:** Better Auth requires a database because it stores users, sessions, and accounts in PostgreSQL tables. The `--auth better-auth` flag must be combined with `--db postgres`, `--db supabase`, or `--supabase`.

Environment variables `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are auto-generated during project creation.
# Secrets and Reruns

Vercel authentication secrets are created as sensitive variables. Re-running Vercel setup preserves existing secrets and configured production URLs rather than rotating or replacing them with localhost placeholders.

WorkOS deployments must provide `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` in production. The development fallback is not available when `NODE_ENV=production`.
