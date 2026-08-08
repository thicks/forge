#!/usr/bin/env bash

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$ROOT_DIR/install.sh" ]]; then
	echo "install.sh not found. Run standalone installer instead:"
	echo "gh auth login"
	echo "gh api repos/thicks/forge/contents/install.sh?ref=main --jq .content | base64 --decode | bash"
	echo "or clone then run:"
	echo "git clone git@github.com:thicks/forge.git ~/.forge/cli && bash ~/.forge/cli/install.sh"
	exit 1
fi

exec bash "$ROOT_DIR/install.sh" "$@"
