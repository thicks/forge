#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

# Load forge env vars (VERCEL_TOKEN, GITHUB_TOKEN, etc.) if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.forge"
if [[ -f "$ENV_FILE" ]]; then
	# shellcheck source=/dev/null
	set +u  # .env.forge may have unset vars
	source "$ENV_FILE"
	set -u
fi
export VERCEL_TOKEN="${VERCEL_TOKEN:-}"

GITHUB_ORG="${GITHUB_ORG:-}"
VERCEL_SCOPE="${VERCEL_SCOPE:-}"

if [[ -z "$GITHUB_ORG" || -z "$VERCEL_SCOPE" ]]; then
	echo "GITHUB_ORG and VERCEL_SCOPE must be set (e.g. via ~/.forge.json's github.org / vercel.team, exported as env vars, or in .env.forge)." >&2
	exit 1
fi

# ── helpers ──────────────────────────────────────────────────────────────────

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

confirm() {
	local prompt="$1"
	local answer
	printf '%s [y/N] ' "$prompt"
	read -r answer
	[[ "$answer" =~ ^[Yy]$ ]]
}

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		red "Required command not found: $1"
		echo "Install with: $2" >&2
		exit 1
	fi
}

# ── preflight ────────────────────────────────────────────────────────────────

require_cmd gh "brew install gh"
require_cmd supabase "brew install supabase/tap/supabase"
require_cmd vercel "npm i -g vercel"

# ── resolve project path & name ──────────────────────────────────────────────

PROJECT_PATH="${1:-}"

if [[ -z "$PROJECT_PATH" ]]; then
	printf 'Path to project (or just a name): '
	read -r PROJECT_PATH
	if [[ -z "$PROJECT_PATH" ]]; then
		red "No project path provided."
		exit 1
	fi
fi

PROJECT="$(basename "$PROJECT_PATH")"

# Resolve to an absolute path if the directory exists
if [[ -d "$PROJECT_PATH" ]]; then
	PROJECT_DIR="$(cd "$PROJECT_PATH" && pwd)"
else
	PROJECT_DIR=""
fi

bold "Project name: $PROJECT"
if [[ -n "$PROJECT_DIR" ]]; then
	echo "  Local directory: $PROJECT_DIR"
fi
echo ""

red "WARNING: This is dangerous and destructive."
printf '%s [y/N] ' "$(red "Delete project \"$PROJECT\"? This cannot be undone.")"
read -r _confirm_warning
if [[ ! "$_confirm_warning" =~ ^[Yy]$ ]]; then
	yellow "Aborted."
	exit 0
fi
echo ""

# ── supabase ─────────────────────────────────────────────────────────────────

# Fetch project list once, show only rows whose name column matches exactly
SUPABASE_LIST="$(supabase projects list 2>/dev/null || true)"
SUPABASE_HEADER="$(echo "$SUPABASE_LIST" | head -n 2)"
# Match on the name column (3rd pipe-delimited field) with an exact,
# case-insensitive comparison — no substring/regex matching on the name.
SUPABASE_MATCH="$(echo "$SUPABASE_LIST" | awk -F'|' -v name="$PROJECT" '
	{
		col = $3
		gsub(/^[ \t]+|[ \t]+$/, "", col)
		if (tolower(col) == tolower(name)) print
	}
')"

if [[ -n "$SUPABASE_MATCH" ]]; then
	bold "Matching Supabase project:"
	echo "$SUPABASE_HEADER"
	echo "$SUPABASE_MATCH"
	# Extract the project ref (3rd pipe-delimited column: org_id | ref | name | region | created_at)
	SUGGESTED_REF="$(echo "$SUPABASE_MATCH" | head -n 1 | awk -F'|' '{print $3}' | tr -d ' ')"
	echo ""
	yellow "Suggested ref: $SUGGESTED_REF"

	# Validate ref format before proceeding: must be exactly 20 lowercase alphanumeric chars
	if [[ ! "$SUGGESTED_REF" =~ ^[a-z0-9]{20}$ ]]; then
		red "Could not extract a valid Supabase project ref (got: \"$SUGGESTED_REF\")."
		yellow "Check the output above and delete manually with: supabase projects delete <ref>"
		SUGGESTED_REF=""
	fi

	if [[ -n "$SUGGESTED_REF" ]]; then
		if confirm "$(red "Delete Supabase project $SUGGESTED_REF?")"; then
			supabase projects delete "$SUGGESTED_REF"
			green "Supabase project deleted."
		else
			yellow "Skipped Supabase deletion."
		fi
	fi
else
	yellow "No Supabase project matching \"$PROJECT\" found - skipping."
fi

# ── github ───────────────────────────────────────────────────────────────────

REPO="${GITHUB_ORG}/${PROJECT}"

if gh repo view "$REPO" >/dev/null 2>&1; then
	if confirm "$(red "Delete GitHub repo $REPO? (will re-auth with delete_repo scope)")"; then
		unset GITHUB_TOKEN 2>/dev/null || true
		gh auth refresh -h github.com -s delete_repo
		gh repo delete "$REPO" --yes
		green "GitHub repo deleted."
	else
		yellow "Skipped GitHub repo deletion."
	fi
else
	yellow "No GitHub repo $REPO found - skipping."
fi

# ── vercel ───────────────────────────────────────────────────────────────────

# `vercel project inspect` resolves the exact project name — avoids
# substring matches like "app" also matching "app-backend".
if vercel project inspect "$PROJECT" --scope "$VERCEL_SCOPE" >/dev/null 2>&1; then
	if confirm "$(red "Delete Vercel project $PROJECT?")"; then
		echo "y" | vercel project rm "$PROJECT" --scope "$VERCEL_SCOPE"
		green "Vercel project deleted."
	else
		yellow "Skipped Vercel project deletion."
	fi
else
	yellow "No Vercel project \"$PROJECT\" found - skipping."
fi

# ── local directory ───────────────────────────────────────────────────────────

if [[ -n "$PROJECT_DIR" ]]; then
	# Sanity guard: never delete /, $HOME, ".", or an empty path
	if [[ -z "$PROJECT_DIR" || "$PROJECT_DIR" == "/" || "$PROJECT_DIR" == "$HOME" || "$PROJECT_DIR" == "." ]]; then
		red "Refusing to delete unsafe path: \"$PROJECT_DIR\""
		exit 1
	fi
	if confirm "$(red "Delete local directory $PROJECT_DIR?")"; then
		rm -rf "$PROJECT_DIR"
		green "Local directory deleted."
	else
		yellow "Skipped local directory deletion."
	fi
else
	yellow "No local directory found - skipping."
fi

echo ""
green "Done."
