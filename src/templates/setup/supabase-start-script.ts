/**
 * Generates a ./scripts/supabase-start shell script for scaffolded projects.
 *
 * The script gives both engineers and non-engineers clear, actionable feedback:
 *   - If Supabase is already running: says so and exits cleanly.
 *   - If Docker is not running: explains how to start Docker Desktop.
 *   - If there's a port conflict: identifies the conflicting project and
 *     prints the exact command to stop it.
 *   - Otherwise: starts Supabase normally.
 */
export function generateSupabaseStartScript(): string {
	return `#!/usr/bin/env bash
set -euo pipefail

GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
RED='\\033[0;31m'
CYAN='\\033[0;36m'
NC='\\033[0m'

info()  { echo -e "\${GREEN}[supabase]\${NC} $1"; }
warn()  { echo -e "\${YELLOW}[supabase]\${NC} $1"; }
error() { echo -e "\${RED}[supabase]\${NC} $1"; }
step()  { echo -e "\${CYAN}  ->\${NC} $1"; }

# ── Docker check ────────────────────────────────────────────────────────────
if ! docker info &>/dev/null; then
  echo ""
  error "Docker is not running."
  echo ""
  info  "Docker is required to run your local database."
  info  "Here's how to start it:"
  echo ""
  step  "Option 1 — Docker Desktop (most common):"
  info  "  Open the Docker Desktop app on your Mac."
  info  "  Look for the whale icon (🐳) in your menu bar."
  info  "  If it's not there, open Docker Desktop from your Applications folder."
  echo ""
  step  "Option 2 — Homebrew / Colima:"
  info  "  brew services start colima"
  echo ""
  info  "Once Docker is running, re-run: pnpm dev"
  echo ""
  exit 1
fi

# ── Supabase status check ───────────────────────────────────────────────────
info "Checking if Supabase is running..."

if supabase status &>/dev/null 2>&1; then
  info "Supabase is already running."
  exit 0
fi

# ── Start Supabase ──────────────────────────────────────────────────────────
info "Supabase is not running. Starting now..."

START_OUTPUT=$(supabase start 2>&1) && echo "$START_OUTPUT" && exit 0

# ── Handle start failure ────────────────────────────────────────────────────
echo "$START_OUTPUT"

if echo "$START_OUTPUT" | grep -q "port is already allocated"; then
  STOP_CMD=$(echo "$START_OUTPUT" | grep -oE 'supabase stop --project-id [^ ]+' | head -1)
  echo ""
  error "A port that Supabase needs is already in use by another project."
  echo ""
  info  "This usually happens when you have another Forge project running locally."
  info  "Stop that project first, then re-run: pnpm dev"
  echo ""
  if [ -n "\${STOP_CMD:-}" ]; then
    step "Run this to stop the conflicting project:"
    info "  \$STOP_CMD"
  else
    step "Run this to stop all local Supabase projects:"
    info "  supabase stop --no-backup"
  fi
  echo ""
fi

exit 1
`;
}
