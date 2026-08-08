# Generated App

## Generated Project Structure

### Standalone

```
my-app/
├── app/
│   ├── _components/
│   │   ├── hero.tsx
│   │   └── footer.tsx
│   ├── login/                  # if --auth
│   │   └── page.tsx
│   ├── api/auth/               # if --auth
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── providers/
│   │   └── posthog.tsx         # PostHog analytics provider
│   └── ui/                     # shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── avatar.tsx
│       ├── dropdown-menu.tsx
│       └── separator.tsx
├── lib/
│   ├── utils.ts                # cn() class merge utility
│   ├── posthog.ts              # PostHog server client
│   └── logger/
│       ├── client.ts
│       └── server.ts
├── db/                         # if --db
│   ├── schema.ts               # Drizzle schema
│   ├── client.ts               # Supabase browser client (if supabase)
│   ├── server.ts               # Supabase server client (if supabase)
│   ├── middleware.ts            # Supabase middleware client (if supabase)
│   └── index.ts                # Postgres client (if postgres)
├── __tests__/
│   ├── unit/
│   │   └── utils.test.ts
│   ├── components/
│   ├── integration/
│   ├── factories/
│   │   └── user.ts
│   └── utils/
│       ├── mocks.ts
│       └── render.tsx
├── public/
│   └── forge-logo.png
├── scripts/
│   └── setup                   # Setup script
├── supabase/                   # if --db supabase
│   ├── config.toml
│   ├── seed.sql
│   └── migrations/
├── docker-compose.yml          # if --db postgres
├── drizzle.config.ts           # if --db (loads .env.local)
├── middleware.ts                # if --auth
├── .env.example
├── .env.local
├── .github/workflows/
│   ├── checks.yml              # Lint, format, typecheck
│   └── test.yml                # Vitest
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── .cursor/
│   ├── settings.json
│   └── rules/
│       ├── project-context.mdc
│       ├── typescript-standards.mdc
│       ├── testing.mdc
│       ├── git-workflow.mdc
│       └── comment-style.mdc
├── .claude/
│   ├── settings.json
│   └── skills/
│       ├── typecheck/
│       ├── test/
│       ├── db-migrate/         # if --db
│       ├── git-pr/
│       ├── code-review/
│       ├── commit-helper/
│       └── agent-browser/
├── CLAUDE.md
├── FORGE_RECOMMENDATIONS.md
├── components.json             # shadcn/ui config
├── vitest.config.mts
├── vitest.setup.ts
├── biome.json
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
└── .gitignore
```

## Generated App Scripts


| Script                    | Command                                                    |
| -------------------------- | ------------------------------------------------------------ |
| `dev`                     | `next dev` (or `supabase:start && next dev` with Supabase) |
| `build`                   | `next build`                                               |
| `start`                   | `next start`                                               |
| `lint` / `lint:fix`       | `eslint .`                                                 |
| `format` / `format:check` | `biome format`                                             |
| `typecheck`               | `tsc --noEmit`                                             |
| `test`                    | `vitest run`                                               |
| `test:watch`              | `vitest`                                                   |
| `test:coverage`           | `vitest run --coverage`                                    |
| `env:pull`                | `vercel env pull .env.local`                               |
| `app:setup`               | `./scripts/setup`                                          |
| `db:generate`             | `drizzle-kit generate` (if `--db`)                         |
| `db:migrate`              | `drizzle-kit migrate` (if `--db`)                          |
| `db:push`                 | `drizzle-kit push` (if `--db`)                             |
| `db:studio`               | `drizzle-kit studio` (if `--db`)                           |
| `supabase:start`          | Start Supabase (if `--db supabase`)                        |
| `supabase:stop`           | Stop Supabase (if `--db supabase`)                         |


## Generated Stack

- **Next.js** ^16 with **React** ^19
- **Tailwind CSS** v4 via PostCSS
- **shadcn/ui** with Radix primitives and `class-variance-authority`
- **ESLint** for linting
- **Biome** for formatting
- **Vitest** with React Testing Library and jsdom
- **PostHog** analytics (client + server, graceful when unconfigured)
- **Drizzle ORM** ^0.45 with PostgreSQL driver (when `--db`)
- **Supabase** client + SSR ^2.99 / ^0.9 (when `--db supabase`)
- **WorkOS AuthKit** ^2.15 (when `--auth workos`)
- **Better Auth** ^1.4 (when `--auth better-auth`)
- **GitHub Actions** CI (checks + test workflows)
- **Claude Code** integration with skills for typecheck, test, db-migrate, git-pr, code-review, commit-helper, and agent-browser
- **Cursor** integration with project rules and editor settings
- **pnpm** package manager
- **Turborepo** (when `--monorepo`)
# Migration Behavior

Migrated apps preserve nested Drizzle migration paths and load `.env.local` for database commands. Unknown authentication middleware and protected pages migrated with `--auth none` fail closed instead of becoming public. Generated migration apps use Biome for linting and formatting.
