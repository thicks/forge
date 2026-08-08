# Installation

## Detailed install options (macOS)

If you are working directly in this repo and need local bootstrap:

```bash
bash ./public-bootstrap.sh
```

Install from a specific branch/tag/commit:

```bash
bash ./public-bootstrap.sh --branch <git-ref>
```

Using the gist installer with a specific branch/tag/commit:

```bash
curl -fsSL https://gist.githubusercontent.com/thicks/a49946b2471acb374b2821ee8fb651e9/raw/public-bootstrap.sh | bash -s -- --branch <git-ref>
```

If you've already cloned `forge`, this also works:

```bash
./bootstrap.sh
```

You can also target a specific ref from a local clone:

```bash
./bootstrap.sh --branch <git-ref>
```

### What bootstrap installs

The bootstrap flow intentionally installs only the core tooling needed to get the `forge` command working:

- Homebrew (if missing)
- Git
- GitHub CLI (`gh`) and GitHub auth
- nvm
- Node.js (resolved from this repo's `engines.node`; fallback is Node 22)
- pnpm (via Corepack)
- forge source sync to `~/.forge/cli`
- Global `forge` command install

This keeps first-time install fast and avoids installing optional tooling before you need it.

### What gets installed during `new` and `update`

`forge` now installs heavier tooling only when a command needs it:

| Tool                       | Installed when...              | Why |
| -------------------------- | ------------------------------ | --- |
| Vercel CLI                 | `forge new ... --vercel` or `forge update ... --vercel` | Needed to link/deploy with Vercel |
| Docker Desktop             | `forge new ... --db postgres` or `forge update ... --db postgres` | Runs local PostgreSQL |
| Supabase CLI               | `forge new ... --db supabase` or `forge update ... --db supabase` | Manages local Supabase workflows |
| PostgreSQL client (`psql`) | Any `--db postgres` or `--db supabase` flow | Used for DB tooling and migrations |

### Updating forge

Once forge is installed, update it from within the CLI:

```bash
forge self-update
```

This pulls the latest changes from `main`, reinstalls dependencies, and rebuilds the binary.

To update to a specific branch (useful for testing PRs):

```bash
forge self-update feature/my-branch
```

You do not need to re-run the curl installer to update.

### Already cloned `forge`?

Run:

```bash
./bootstrap.sh
```

### System Requirements


| Tool        | Version | Install                                                   |
| ----------- | ------- | --------------------------------------------------------- |
| **Node.js** | v22+    | [nodejs.org](https://nodejs.org) or via `nvm` (see below) |
| **pnpm**    | v9+     | `npm install -g pnpm`                                     |


**Recommended: install Node via nvm** so you can switch versions easily:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Install and use Node 22
nvm install 22
nvm use 22
```

TypeScript is installed automatically as a dev dependency — no global install needed.

### Clone and Install

If you prefer a manual install, use this flow:

```bash
cd ~
mkdir -p dev
cd dev
git clone git@github.com:thicks/forge.git
cd forge
./bootstrap.sh
```

This keeps `forge` in a predictable local path (`~/dev/forge`) and runs the same dependency/bootstrap process.

If you only want to install dependencies (without bootstrap), run:

```bash
git clone <repo-url>
cd forge
pnpm install
```

### Optional Tools

Most users should not need to install optional tools manually because `forge` installs them on demand.  
If you prefer manual setup (or are preparing a machine image), use:

| Tool                  | Used for                             | Install |
| --------------------- | ------------------------------------ | ------- |
| **GitHub CLI (`gh`)** | Creating GitHub remotes (`--github`) | `brew install gh && gh auth login` |
| **Vercel CLI**        | Vercel deployment (`--vercel`)       | `pnpm add -g vercel && vercel login` |
| **Docker**            | Local PostgreSQL (`--db postgres`)   | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Supabase CLI**      | Local Supabase (`--db supabase`)     | `brew install supabase/tap/supabase` |
| **PostgreSQL client** | Local/hosted DB workflows            | `brew install postgresql@16` |
| **jq**                | JSON processing in setup scripts     | `brew install jq` |


### First-Time Setup

After installing, run the config wizard to store your credentials and defaults:

```bash
forge config
```

This saves a config file to `~/.forge.json` with your GitHub token, Vercel token, org, and other defaults used by the `new` command.

### Config file

`forge` stores credentials and defaults in `~/.forge.json`, used by `forge` commands (`config`, `new`, `setup-git`, `setup-vercel`, etc.).
