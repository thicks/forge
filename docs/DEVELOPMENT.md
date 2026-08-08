# Development

## Maintainers: Publish the Public Installer (Gist)

This repo stays private. The public entrypoint is `public-bootstrap.sh` published as a public gist.

Create a new public gist:

```bash
pnpm run publish:installer:gist
```

Update an existing gist (recommended so URL stays stable):

```bash
FORGE_GIST_ID=<gist-id> pnpm run publish:installer:gist
```

The workflow at `.github/workflows/publish-installer-gist.yml` auto-updates the same gist on `main` when `public-bootstrap.sh` changes.
Set repository secret `FORGE_GIST_ID` once to enable it.

## Build & Quality

```bash
pnpm build        # Build with tsup
pnpm lint         # Lint with ESLint
pnpm format       # Format with Biome
pnpm typecheck    # Type check with TypeScript
```

### Dev Scripts

Convenience scripts for testing different configurations. All output to `test-working-dir/` (gitignored).

```bash
# Create standalone apps
pnpm dev:app                    # basic app
pnpm dev:app:remote             # with GitHub remote
pnpm dev:app:postgres           # with Postgres
pnpm dev:app:supabase           # with Supabase

# Setup commands (run on existing test-working-dir/test-app)
pnpm dev:setup-git              # create/link GitHub remote
pnpm dev:setup-vercel           # create Vercel project
pnpm dev:setup-vercel:postgres  # Vercel + Postgres
pnpm dev:setup-vercel:supabase  # Vercel + Supabase
```

## Project Structure (forge source)

```
src/
├── index.ts                    # CLI entry (Commander)
├── commands/
│   ├── config.ts               # Credential and defaults configuration
│   ├── config-push.ts          # Push config to remote servers
│   ├── new.ts                  # Main scaffolding orchestration
│   ├── setup-git.ts            # GitHub repo setup
│   ├── setup-vercel.ts         # Vercel deployment setup
│   ├── clean.ts                # Tear down GitHub + Vercel
│   └── migrate.ts              # Replit migration
├── types/
│   └── config.ts               # ForgeConfig type definitions
├── migrate/                    # Migration analyzers and converters
├── templates/
│   ├── standalone/             # Single-app configs (package.json, tsconfig, etc.)
│   ├── monorepo/               # Turborepo configs
│   ├── app/                    # Layout, page, hero, footer, CSS
│   ├── auth/
│   │   ├── workos/             # WorkOS auth templates
│   │   └── simple/             # Simple auth templates
│   ├── db/                     # Drizzle client, config, schema
│   ├── docker/                 # docker-compose.yml
│   ├── supabase/               # Supabase config and seed
│   ├── ui/                     # shadcn/ui components.json, lib/utils
│   ├── test/                   # Vitest config, setup, mocks, factories
│   ├── analytics/              # PostHog provider and server
│   ├── lib/                    # Logger utilities
│   ├── github/                 # GitHub Actions workflows
│   ├── vscode/                 # VSCode settings and extensions
│   ├── cursor/                 # Cursor settings and rules templates
│   ├── claude/                 # Claude Code skills and settings templates
│   ├── root/                   # biome/eslint config, CLAUDE.md, FORGE_RECOMMENDATIONS.md
│   └── setup/                  # Setup scripts
└── utils/
    ├── config-manager.ts       # Load/save ~/.forge.json
    ├── token-validator.ts      # GitHub, Vercel, Supabase token validation
    ├── exec.ts                 # Shell commands (git, gh, vercel, supabase, pnpm)
    ├── fs.ts                   # File operations
    ├── logger.ts               # Colored console output
    ├── spinner.ts              # Ora progress spinners
    └── prompts.ts              # Interactive prompts
```
