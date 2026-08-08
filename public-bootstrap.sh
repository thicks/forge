#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

FORGE_REPO="${FORGE_REPO:-thicks/forge}"
FORGE_REF="${FORGE_REF:-main}"
FORGE_INSTALL_DIR="${FORGE_INSTALL_DIR:-$HOME/.forge/cli}"

BLUE="\033[1;34m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
RESET="\033[0m"

info() {
	printf "${BLUE}==>${RESET} %s\n" "$*"
}

success() {
	printf "${GREEN}✓${RESET} %s\n" "$*"
}

warn() {
	printf "${YELLOW}!${RESET} %s\n" "$*"
}

error() {
	printf "${RED}x${RESET} %s\n" "$*"
}

command_exists() {
	command -v "$1" >/dev/null 2>&1
}

detect_expert_mode() {
	# If git is already installed, assume concise output is preferred.
	if command_exists git; then
		FORGE_EXPERT_MODE=1
	else
		FORGE_EXPERT_MODE=0
	fi
}

is_expert_mode() {
	[[ "${FORGE_EXPERT_MODE:-0}" == "1" ]]
}

guided_info() {
	if ! is_expert_mode; then
		info "$*"
	fi
}

usage() {
	cat <<EOF
Usage: public-bootstrap.sh [options]

Options:
  -b, --branch <ref>        Git branch/tag/commit to install (default: main)
      --repo <owner/name>   GitHub repository to install from (default: thicks/forge)
      --install-dir <path>  Local install directory (default: ~/.forge/cli)
  -h, --help                Show this help

Environment variables:
  FORGE_REF, FORGE_REPO, FORGE_INSTALL_DIR can also be used.
  Command-line options override environment variables.
EOF
}

parse_args() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
			-b|--branch)
				if [[ $# -lt 2 ]]; then
					error "Missing value for $1"
					exit 1
				fi
				FORGE_REF="$2"
				shift 2
				;;
			--repo)
				if [[ $# -lt 2 ]]; then
					error "Missing value for $1"
					exit 1
				fi
				FORGE_REPO="$2"
				shift 2
				;;
			--install-dir)
				if [[ $# -lt 2 ]]; then
					error "Missing value for $1"
					exit 1
				fi
				FORGE_INSTALL_DIR="$2"
				shift 2
				;;
			-h|--help)
				usage
				exit 0
				;;
			*)
				error "Unknown option: $1"
				usage
				exit 1
				;;
		esac
	done
}

ensure_macos() {
	if [[ "$(uname -s)" != "Darwin" ]]; then
		error "This installer currently supports macOS only."
		error "Please contact your team for non-macOS setup."
		exit 1
	fi
}

ensure_homebrew_shellenv() {
	if [[ -x "/opt/homebrew/bin/brew" ]]; then
		eval "$(/opt/homebrew/bin/brew shellenv)"
	elif [[ -x "/usr/local/bin/brew" ]]; then
		eval "$(/usr/local/bin/brew shellenv)"
	fi
}

install_homebrew() {
	if command_exists brew; then
		if ! is_expert_mode; then
			success "Homebrew already installed"
		fi
		ensure_homebrew_shellenv
		return
	fi

	guided_info "Homebrew is used to install required tools."
	info "Installing Homebrew..."
	NONINTERACTIVE=1 /bin/bash -c \
		"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
	ensure_homebrew_shellenv
	success "Installed Homebrew"
}

ensure_gh() {
	if command_exists gh; then
		if ! is_expert_mode; then
			success "GitHub CLI already installed"
		fi
		return
	fi

	install_homebrew
	guided_info "GitHub CLI provides secure access to private repositories."
	info "Installing GitHub CLI..."
	brew install gh
	success "Installed GitHub CLI"
}

ensure_gh_auth() {
	if gh auth status -h github.com >/dev/null 2>&1; then
		if ! is_expert_mode; then
			success "GitHub CLI already authenticated"
		fi
		return
	fi

	if is_expert_mode; then
		info "Authenticating with GitHub..."
	else
		warn "Sign in to GitHub so forge can access the private tools repository."
		info "A browser window will open for sign-in."
	fi

	info "  gh auth login --hostname github.com --git-protocol https --web"
	gh auth login --hostname github.com --git-protocol https --web

	if ! gh auth status -h github.com >/dev/null 2>&1; then
		error "GitHub authentication failed."
		error "Rerun: gh auth login --hostname github.com --git-protocol https --web"
		exit 1
	fi

	success "GitHub CLI authenticated"
}

ensure_gh_git_auth() {
	# Configure gh as Git credential helper so HTTPS git operations work with 2FA.
	if gh auth setup-git >/dev/null 2>&1; then
		if ! is_expert_mode; then
			success "Git credential helper configured via GitHub CLI"
		fi
		return
	fi

	warn "Could not auto-configure git credential helper with GitHub CLI."
	warn "If git prompts for a password, run: gh auth setup-git"
}

sync_private_repo() {
	local parent_dir
	parent_dir="$(dirname "$FORGE_INSTALL_DIR")"

	mkdir -p "$parent_dir"

	if [[ -d "$FORGE_INSTALL_DIR/.git" ]]; then
		info "Updating forge source at $FORGE_INSTALL_DIR..."
		git -C "$FORGE_INSTALL_DIR" fetch origin "$FORGE_REF"
		git -C "$FORGE_INSTALL_DIR" checkout "$FORGE_REF"
		git -C "$FORGE_INSTALL_DIR" pull --ff-only origin "$FORGE_REF"
		success "Updated forge source"
		return
	fi

	if [[ -e "$FORGE_INSTALL_DIR" ]]; then
		error "Install directory exists but is not a git repo: $FORGE_INSTALL_DIR"
		error "Move/remove it, then rerun this installer."
		exit 1
	fi

	info "Cloning ${FORGE_REPO} into $FORGE_INSTALL_DIR..."
	gh repo clone "$FORGE_REPO" "$FORGE_INSTALL_DIR" -- --branch "$FORGE_REF"
	success "Cloned forge source"
}

run_private_installer() {
	local private_installer="$FORGE_INSTALL_DIR/install.sh"
	if [[ ! -f "$private_installer" ]]; then
		error "Could not find private installer at $private_installer"
		exit 1
	fi

	info "Running forge installer..."
	FORGE_REPO="$FORGE_REPO" FORGE_REF="$FORGE_REF" FORGE_INSTALL_DIR="$FORGE_INSTALL_DIR" bash "$private_installer"
}

main() {
	parse_args "$@"
	detect_expert_mode

	if [[ "${FORGE_BOOTSTRAP_SMOKE_TEST:-0}" == "1" ]]; then
		printf 'FORGE_REPO=%s\n' "$FORGE_REPO"
		printf 'FORGE_REF=%s\n' "$FORGE_REF"
		printf 'FORGE_INSTALL_DIR=%s\n' "$FORGE_INSTALL_DIR"
		success "Bootstrap smoke test passed"
		return
	fi

	if is_expert_mode; then
		info "Installing forge bootstrap..."
	else
		info "Starting forge bootstrap..."
		info "We'll install access tools, then install the forge CLI."
	fi
	ensure_macos
	install_homebrew
	ensure_gh
	ensure_gh_auth
	ensure_gh_git_auth
	sync_private_repo
	run_private_installer
	success "Forge bootstrap finished"
}

main "$@"
