# CLI Commands

### `config`

Configure shared credentials and defaults stored in `~/.forge.json`. These defaults are used by `new` and other commands.

```bash
pnpm dev config
pnpm dev config --refresh          # Refresh tokens, keep existing metadata
pnpm dev config -o ./custom.json   # Custom output path
```


| Option                | GIDescription                          |
| --------------------- | -------------------------------------- |
| `-o, --output <path>` | Output path for config file            |
| `--refresh`           | Refresh tokens, keep existing metadata |


The config wizard collects:

- **GitHub**: Token (auto-detected from `gh` CLI or env), org, git email/name
- **Vercel**: Token (auto-detected from Vercel CLI or env), team slug
- **Database**: PostgreSQL (local Docker or Vercel Postgres) or Supabase (local Docker + Vercel integration)
- **Supabase** (if selected): Access token (auto-detected from CLI/keychain), org, region
- **WorkOS** (optional): Shared `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` defaults for new projects
- **Custom env vars** (optional): Key/value pairs with environment targeting and sensitivity flags

When you run `new --auth workos`, the WorkOS credentials from your config are automatically populated in the generated `.env.local`.

### `config-push <ssh-host>`

Push your config file to a remote server via SSH (e.g. for CI or shared dev environments).

```bash
pnpm dev config-push user@hostname
pnpm dev config-push user@hostname -c ./custom.json
```

### `new <app-name>`

Scaffold a new app. Git is always initialized with an initial commit.

```bash
# Standalone app
pnpm dev new my-app

# With database
pnpm dev new my-app --db postgres
pnpm dev new my-app --db supabase

# With authentication
pnpm dev new my-app --auth simple
pnpm dev new my-app --auth workos
pnpm dev new my-app --auth better-auth --db postgres
pnpm dev new my-app --auth better-auth --db supabase

# With GitHub remote (creates <org>/<app-name>)
pnpm dev new my-app --github

# With Vercel deployment setup
pnpm dev new my-app --github --vercel

# Monorepo (creates ./my-platform with app at apps/web) — experimental
pnpm dev new web --monorepo ./my-platform

# Combine options
pnpm dev new my-app --db supabase --auth workos --github --vercel
```


| Option               | Values                 | Description                                                  |
| -------------------- | ---------------------- | ------------------------------------------------------------ |
| `--monorepo <path>`  | path                   | Create a Turborepo monorepo at the given path (experimental) |
| `--db <type>`        | `postgres`, `supabase` | Database type                                                |
| `--auth <type>`      | `workos`, `simple`, `better-auth` | Authentication type (better-auth requires --db)              |
| `--github`           | —                      | Create/link GitHub remote under your configured org          |
| `--vercel`           | —                      | Configure Vercel project and deployment                      |
| `--supabase`         | —                      | Provision a Supabase cloud project (implies `--db supabase`) |
| `--ci`               | —                      | Non-interactive mode: skip prompts, auto-overwrite dirs      |
| `--ai-skills <path>` | path                   | Path to a custom skills.json manifest (default: built-in)    |


### `update <path>`

Update an existing project with database configuration, GitHub remote, Vercel setup, and/or AI scaffold files.

```bash
# Add database to existing project
pnpm dev update ./my-app --db postgres
pnpm dev update ./my-app --db supabase

# Set up GitHub remote
pnpm dev update ./my-app --github

# Set up Vercel deployment
pnpm dev update ./my-app --vercel

# Update AI scaffold files (CLAUDE.md, skills, Cursor rules)
pnpm dev update ./my-app --ai

# Use a custom skills manifest
pnpm dev update ./my-app --ai --ai-skills ./custom-skills.json

# Combine options
pnpm dev update ./my-app --db postgres --github --vercel --ai
```

| Option               | Values                 | Description                                               |
| -------------------- | ---------------------- | ----------------------------------------------------------- |
| `--db <type>`        | `postgres`, `supabase` | Add/configure database                                    |
| `--github`           | —                      | Set up and link GitHub remote repository (idempotent)     |
| `--vercel`           | —                      | Set up Vercel deployment and repository connection        |
| `--auth <type>`      | `workos`, `simple`, `better-auth` | Auth context for Vercel env var configuration             |
| `--ai`               | —                      | Update AI scaffold files (skips unchanged files)          |
| `--ai-skills <path>` | path                   | Path to a custom skills.json manifest (default: built-in) |

### `setup-git <path>`

Configure a GitHub repository for an existing project. The project must already be a git repo.

```bash
pnpm dev setup-git ./my-app
```

### `setup-vercel <path>`

Configure Vercel deployment for an existing project.

```bash
pnpm dev setup-vercel ./my-app
pnpm dev setup-vercel ./my-app --db supabase --auth workos
```


| Option              | Values                     | Description                          |
| ------------------- | -------------------------- | ------------------------------------- |
| `--auth <type>`     | `workos`, `simple`, `none` | Auth type for env var configuration  |
| `--db <type>`       | `postgres`, `supabase`     | Database type for provisioning       |
| `--app-name <name>` | name                       | App name in monorepo (monorepo mode) |


### `clean <project-path>`

Tear down a project's GitHub repo and Vercel project.

```bash
pnpm dev clean ./my-app
```

### `migrate <source-dir> <target-dir>`

Migrate a Replit Express + Vite + React app to a Next.js app.

```bash
pnpm dev migrate ./replit-app ./new-app --dry-run      # Analyze only
pnpm dev migrate ./replit-app ./new-app                 # Migrate with defaults
pnpm dev migrate ./replit-app ./new-app --db postgres --auth workos --verbose
```


| Option          | Values                   | Default    | Description                     |
| --------------- | ------------------------ | ---------- | -------------------------------- |
| `--db <type>`   | `supabase`, `postgres`   | `supabase` | Target database                 |
| `--auth <type>` | `workos`, `demo`, `none` | `demo`     | Target auth                     |
| `--dry-run`     | —                        | —          | Analyze source only             |
| `--verbose`     | —                        | `false`    | Show detailed conversion output |
# Safety and Automation Notes

- `forge new --ci` refuses to replace the current directory, ancestors, protected home directories, or symlinked targets.
- `forge clean` refuses protected paths and paths that resolve through symlinks outside the home directory.
- GitHub setup never force-pushes. Reconcile divergent remote history manually before retrying.
- `setup-vercel --auth` accepts `workos`, `simple`, `better-auth`, or `none`.
- Cloud Supabase and Vercel setup fail rather than prompt when called from `--ci`.
