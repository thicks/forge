#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BOOTSTRAP_FILE="${BOOTSTRAP_FILE:-$ROOT_DIR/public-bootstrap.sh}"
GIST_ID="${FORGE_GIST_ID:-}"
GIST_DESC="${FORGE_GIST_DESC:-Forge public bootstrap installer}"

if ! command -v gh >/dev/null 2>&1; then
	echo "gh CLI is required. Install with: brew install gh" >&2
	exit 1
fi

if [[ ! -f "$BOOTSTRAP_FILE" ]]; then
	echo "Bootstrap file not found: $BOOTSTRAP_FILE" >&2
	exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
	echo "gh is not authenticated. Run: gh auth login" >&2
	exit 1
fi

if [[ -z "$GIST_ID" ]]; then
	echo "Creating new public gist..."
	gh gist create "$BOOTSTRAP_FILE" --public --desc "$GIST_DESC"
	exit 0
fi

echo "Updating gist $GIST_ID..."
gh gist edit "$GIST_ID" "$BOOTSTRAP_FILE"
echo "Updated gist $GIST_ID"
