/**
 * Generates a ./scripts/db-start shell script for projects using --db postgres.
 *
 * The script gives both engineers and non-engineers clear, actionable feedback:
 *   - If the postgres container is already running: says so and exits cleanly.
 *   - If Docker is not running: explains how to start Docker Desktop or Colima.
 *   - Otherwise: starts the container with docker compose up -d.
 */
export function generateDockerStartScript(): string {
	return `#!/usr/bin/env bash
set -euo pipefail

GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
RED='\\033[0;31m'
CYAN='\\033[0;36m'
NC='\\033[0m'

info()  { echo -e "\${GREEN}[db]\${NC} $1"; }
warn()  { echo -e "\${YELLOW}[db]\${NC} $1"; }
error() { echo -e "\${RED}[db]\${NC} $1"; }
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

# ── Check if the postgres container is already running ──────────────────────
if docker compose ps --status running 2>/dev/null | grep -q "postgres"; then
  info "Database is already running."
  exit 0
fi

# ── Start the container ─────────────────────────────────────────────────────
info "Starting database..."
docker compose up -d

info "Database is ready."
`;
}
