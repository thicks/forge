#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "Running installer syntax checks..."
bash -n install.sh
bash -n public-bootstrap.sh
bash -n bootstrap.sh

echo "Running install.sh smoke test mode..."
FORGE_INSTALLER_SMOKE_TEST=1 bash ./install.sh --branch smoke-branch --repo thicks/forge

echo "Running public-bootstrap.sh smoke test mode..."
bootstrap_output="$(
	FORGE_BOOTSTRAP_SMOKE_TEST=1 bash ./public-bootstrap.sh --branch smoke-branch --repo thicks/forge --install-dir /tmp/forge-smoke
)"

[[ "$bootstrap_output" == *"FORGE_REF=smoke-branch"* ]]
[[ "$bootstrap_output" == *"FORGE_REPO=thicks/forge"* ]]
[[ "$bootstrap_output" == *"FORGE_INSTALL_DIR=/tmp/forge-smoke"* ]]

echo "Installer smoke tests passed."
