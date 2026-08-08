# Forge ⚔️

A CLI tool that scaffolds standardized applications with configurable database, authentication, Git, and Vercel deployment options.

## Features

- **Standalone or Monorepo**: Create standalone apps or apps within a Turborepo monorepo (monorepo mode is experimental)
- **Database Options**: PostgreSQL (with Docker) or Supabase (with Supabase CLI)
- **Authentication Options**: WorkOS (enterprise SSO), Better Auth (email/password with plugins), or Simple (cookie-based dev auth)
- **UI Components**: shadcn/ui pre-configured with button, input, card, label, avatar, dropdown-menu, separator
- **Testing**: Vitest with React Testing Library, factories, and CI workflows
- **Analytics**: PostHog integration (graceful when keys are missing)
- **Logging**: Structured client/server logger utilities
- **AI Integration**: Claude Code skills installed via declarative manifest (typecheck, test, git-pr, code-review, commit-helper, agent-browser, db-migrate) with support for custom manifests
- **Git Integration**: Initialize repos, create GitHub remotes under your configured org
- **Vercel Deployment**: Link projects, connect Git, provision databases, configure env vars
- **Migrate from Replit**: Convert Replit Express + Vite + React apps to Next.js
- **Code Standards**: Biome (lint + format), Tailwind CSS v4, TypeScript strict mode

## Quick Start

If you just want to create a new app quickly, copy/paste these commands in Terminal:

1. Install `forge`:

```bash
curl -fsSL https://gist.githubusercontent.com/thicks/a49946b2471acb374b2821ee8fb651e9/raw/public-bootstrap.sh | bash
```

1. Run first-time setup:

```bash
forge config
```

1. Create your app:

```bash
forge new my-test-app
```

Then open `my-test-app` in Claude or Cursor and start building.

If step 1 fails, ask your team for the latest `forge` install link.

## Documentation

- [docs/INSTALLATION.md](docs/INSTALLATION.md) — detailed install options, system requirements, config file, and first-time setup
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — fixes for common install and CLI errors
- [docs/CLI_COMMANDS.md](docs/CLI_COMMANDS.md) — full reference for every `forge` subcommand and its options
- [docs/DATABASE_AND_AUTH.md](docs/DATABASE_AND_AUTH.md) — PostgreSQL/Supabase and Simple/WorkOS/Better Auth options
- [docs/GENERATED_APP.md](docs/GENERATED_APP.md) — structure, scripts, and stack of a generated app
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — working on the `forge` CLI source itself

## License

MIT
