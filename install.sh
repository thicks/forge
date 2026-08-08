#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

# Standalone installer defaults (override via env vars when needed).
FORGE_REPO="${FORGE_REPO:-thicks/forge}"
FORGE_REF="${FORGE_REF:-main}"
FORGE_INSTALL_DIR="${FORGE_INSTALL_DIR:-$HOME/.forge/cli}"
FORGE_BIN_DIR="${FORGE_BIN_DIR:-$HOME/.forge/bin}"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
DEFAULT_NODE_VERSION="${DEFAULT_NODE_VERSION:-22}"

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
	# If git is already installed, assume the user is comfortable with concise output.
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
Usage: install.sh [options]

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

read_from_tty() {
	local var_name="$1"
	local prompt="$2"

	if [[ ! -r /dev/tty ]]; then
		error "Interactive input is unavailable in this shell."
		return 1
	fi

	# Restore cooked mode in case a previous tool (nvm, pnpm, Node) left the
	# terminal in raw mode, which makes Enter show as ^M and Ctrl-C as ^C.
	stty sane </dev/tty 2>/dev/null || true

	printf "%s" "$prompt" >/dev/tty
	IFS= read -r "$var_name" </dev/tty
}

confirm_with_tty() {
	local prompt="$1"
	local reply=""

	read_from_tty reply "$prompt" || return 1
	[[ -z "$reply" || "$reply" =~ ^[Yy]$ ]]
}

run_shell_command_with_prompt() {
	local description="$1"
	local command="$2"
	local run_now_prompt="$3"
	local cmd_exit=0

	info "  $description"
	info "       $command"

	if ! confirm_with_tty "$run_now_prompt"; then
		return 0
	fi

	if [[ "$command" == source\ * ]]; then
		# `source` only affects the current shell process; running it in a child
		# shell (-ic) hijacks the TTY and breaks keyboard input. Just remind the
		# user to run it themselves in their own shell.
		info "  Run this in your terminal: $command"
		return 0
	else
		info "  Running: $command"
		set +e
		set +u
		eval "$command"
		cmd_exit=$?
		set -u
		set -e
	fi

	if [[ "$cmd_exit" -ne 0 ]]; then
		warn "  Command failed (exit $cmd_exit): $command"
		warn "  You can run it manually after the installer exits."
	fi
}

source_nvm() {
	if [[ -s "$NVM_DIR/nvm.sh" ]]; then
		# shellcheck source=/dev/null
		source "$NVM_DIR/nvm.sh"
	fi
}

pick_primary_rc_file() {
	local user_shell="$1"
	local primary_file=""

	case "$user_shell" in
		zsh)  primary_file="$HOME/.zshrc" ;;
		bash) primary_file="$HOME/.bashrc" ;;
		*)    primary_file="$HOME/.profile" ;;
	esac

	printf "%s" "$primary_file"
}

ensure_homebrew_in_rc() {
	# Persist Homebrew shellenv in the user's primary rc file so new terminals
	# can find /opt/homebrew/bin or /usr/local/bin without manual setup.
	local brew_bin=""
	if [[ -x "/opt/homebrew/bin/brew" ]]; then
		brew_bin="/opt/homebrew/bin/brew"
	elif [[ -x "/usr/local/bin/brew" ]]; then
		brew_bin="/usr/local/bin/brew"
	elif command_exists brew; then
		brew_bin="$(command -v brew)"
	fi

	if [[ -z "$brew_bin" ]]; then
		return
	fi

	local user_shell
	user_shell="$(basename "${SHELL:-/bin/bash}")"
	local rc_file
	rc_file="$(pick_primary_rc_file "$user_shell")"
	[[ -f "$rc_file" ]] || touch "$rc_file"

	if ! grep -q 'brew shellenv' "$rc_file" 2>/dev/null; then
		{
			echo ""
			echo "# homebrew"
			echo "eval \"\$($brew_bin shellenv)\""
		} >> "$rc_file"
	fi
}

ensure_nvm_in_user_shell_rc() {
	# nvm's installer may update bash rc files when running under curl|bash.
	# Ensure the user's actual shell rc loads nvm so `node` works in new shells.
	local user_shell
	user_shell="$(basename "${SHELL:-/bin/bash}")"
	local rc_file
	rc_file="$(pick_primary_rc_file "$user_shell")"
	[[ -f "$rc_file" ]] || touch "$rc_file"

	local has_nvm_dir=0
	local has_nvm_source=0
	if grep -q 'NVM_DIR' "$rc_file" 2>/dev/null; then
		has_nvm_dir=1
	fi
	if grep -q 'nvm.sh' "$rc_file" 2>/dev/null; then
		has_nvm_source=1
	fi

	if [[ "$has_nvm_dir" == "1" && "$has_nvm_source" == "1" ]]; then
		return
	fi

	{
		echo ""
		echo "# nvm"
		echo "export NVM_DIR=\"\$HOME/.nvm\""
		echo "[ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\""
	} >> "$rc_file"
}

source_shell_rc() {
	# Source the user's shell rc file to pick up PATH changes from nvm/pnpm.
	local user_shell
	user_shell="$(basename "${SHELL:-/bin/bash}")"

	case "$user_shell" in
		zsh)
			[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc" 2>/dev/null || true
			[[ -f "$HOME/.zprofile" ]] && source "$HOME/.zprofile" 2>/dev/null || true
			;;
		bash)
			[[ -f "$HOME/.bashrc" ]] && source "$HOME/.bashrc" 2>/dev/null || true
			[[ -f "$HOME/.bash_profile" ]] && source "$HOME/.bash_profile" 2>/dev/null || true
			;;
		*)
			[[ -f "$HOME/.profile" ]] && source "$HOME/.profile" 2>/dev/null || true
			;;
	esac

	# Apply Homebrew shellenv in-process after sourcing to keep PATH consistent.
	ensure_homebrew_shellenv

	# If PNPM_HOME exists but was not prepended, ensure this shell can use pnpm.
	if [[ -n "${PNPM_HOME:-}" && -d "${PNPM_HOME}" ]] && ! path_contains_dir "$PNPM_HOME"; then
		export PATH="$PNPM_HOME:$PATH"
	fi
}

verify_node_pnpm() {
	# Smoke test to verify node and pnpm are accessible in the current shell.
	# Returns 0 if both work, 1 otherwise.
	local node_ok=0
	local pnpm_ok=0

	if command_exists node && node --version >/dev/null 2>&1; then
		node_ok=1
	fi

	if command_exists pnpm && pnpm --version >/dev/null 2>&1; then
		pnpm_ok=1
	fi

	if [[ "$node_ok" == "1" && "$pnpm_ok" == "1" ]]; then
		return 0
	fi
	return 1
}

ensure_node_pnpm_accessible() {
	# After installing nvm/node/pnpm, verify they are accessible.
	# If not, try sourcing shell rc files and re-check.
	# If still not working, give clear instructions to the user.

	if verify_node_pnpm; then
		success "Node.js and pnpm verified"
		return 0
	fi

	# First attempt: source nvm directly
	info "Activating Node.js environment..."
	source_nvm

	if verify_node_pnpm; then
		success "Node.js and pnpm verified"
		return 0
	fi

	# Second attempt: source shell rc files
	info "Reloading shell environment..."
	source_shell_rc
	source_nvm

	if verify_node_pnpm; then
		success "Node.js and pnpm verified"
		return 0
	fi

	# Third attempt: manually set up PATH for this session
	info "Configuring PATH for this session..."
	export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
	[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"

	# Try to activate nvm's default node
	if command_exists nvm; then
		nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
	fi

	# Ensure PNPM_HOME is on PATH
	local pnpm_home
	if [[ "$(uname -s)" == "Darwin" ]]; then
		pnpm_home="$HOME/Library/pnpm"
	else
		pnpm_home="${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
	fi
	if [[ -d "$pnpm_home" && ":$PATH:" != *":$pnpm_home:"* ]]; then
		export PATH="$pnpm_home:$PATH"
	fi

	if verify_node_pnpm; then
		success "Node.js and pnpm verified"
		return 0
	fi

	# Still failed — give user clear instructions
	error "Could not verify Node.js and pnpm are working."
	error ""
	error "This usually means PATH was not updated in this shell session."
	error "Try one of these:"
	error ""
	error "  Option 1: Open a new terminal window and re-run the installer"
	error ""
	error "  Option 2: Run these commands, then re-run the installer:"
	error "    source ~/.zshrc"
	error "    # or: source ~/.bashrc"
	error ""
	error "  Option 3: Install manually:"
	error "    brew install node pnpm"
	error "    # then re-run the installer"
	error ""
	return 1
}

ensure_homebrew_shellenv() {
	if command_exists brew; then
		if [[ -x "/opt/homebrew/bin/brew" ]]; then
			eval "$(/opt/homebrew/bin/brew shellenv)"
		elif [[ -x "/usr/local/bin/brew" ]]; then
			eval "$(/usr/local/bin/brew shellenv)"
		fi
	fi
}

install_homebrew() {
	if command_exists brew; then
		if ! is_expert_mode; then
			success "Homebrew already installed"
		fi
		ensure_homebrew_shellenv
		ensure_homebrew_in_rc
		return
	fi

	if [[ "$(uname -s)" != "Darwin" ]]; then
		error "This installer currently supports macOS only."
		error "Install dependencies manually on your OS."
		exit 1
	fi

	info "Installing Homebrew..."
	guided_info "Homebrew is the package manager used to install developer tools."
	NONINTERACTIVE=1 /bin/bash -c \
		"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
	ensure_homebrew_shellenv
	ensure_homebrew_in_rc
	success "Installed Homebrew"
}

ensure_brew_package() {
	local package="$1"
	local package_type="${2:-formula}"

	# Keep cask/formula checks explicit to avoid nounset issues with empty arrays.
	if [[ "$package_type" == "cask" ]]; then
		if brew list --cask "$package" >/dev/null 2>&1; then
			if ! is_expert_mode; then
				success "$package already installed"
			fi
			return
		fi

		info "Installing $package..."
		brew install --cask "$package"
		success "Installed $package"
		return
	fi

	if brew list "$package" >/dev/null 2>&1; then
		if ! is_expert_mode; then
			success "$package already installed"
		fi
		return
	fi

	info "Installing $package..."
	brew install "$package"
	success "Installed $package"
}

run_smoke_test() {
	local -a install_invocations=()

	# Override brew in-process so smoke tests can run without network/system changes.
	brew() {
		if [[ "$1" == "list" ]]; then
			return 1
		fi

		if [[ "$1" == "install" ]]; then
			shift
			install_invocations+=("$*")
			return 0
		fi

		return 0
	}

	ensure_brew_package gh
	ensure_brew_package docker cask

	if [[ ${#install_invocations[@]} -ne 2 ]]; then
		error "Smoke test failed: expected two install calls."
		exit 1
	fi

	if [[ "${install_invocations[0]}" != "gh" ]]; then
		error "Smoke test failed: expected formula install invocation."
		exit 1
	fi

	if [[ "${install_invocations[1]}" != *"--cask"* || "${install_invocations[1]}" != *"docker"* ]]; then
		error "Smoke test failed: expected cask install invocation."
		exit 1
	fi

	success "Installer smoke test passed"
}

ensure_git() {
	if command_exists git; then
		if ! is_expert_mode; then
			success "Git already installed"
		fi
		return
	fi

	install_homebrew
	guided_info "Installing Git for version control and repository sync."
	ensure_brew_package git
}

ensure_github_cli() {
	if command_exists gh; then
		if ! is_expert_mode; then
			success "GitHub CLI already installed"
		fi
		return
	fi

	install_homebrew
	guided_info "Installing GitHub CLI so forge can access private repositories."
	ensure_brew_package gh
}

ensure_github_auth() {
	if gh auth status -h github.com >/dev/null 2>&1; then
		if ! is_expert_mode; then
			success "GitHub CLI already authenticated"
		fi
		return
	fi

	if is_expert_mode; then
		warn "GitHub authentication required."
	else
		warn "Sign in to GitHub to access ${FORGE_REPO}."
		info "A browser window may open during sign-in."
		info "If you do not have access yet, contact your team."
	fi

	local should_login=""

	while true; do
		read_from_tty should_login "Run 'gh auth login' now? [Y/n]: " || {
			error "Cannot prompt for GitHub auth. Run 'gh auth login' and rerun."
			exit 1
		}

		if [[ -z "$should_login" || "$should_login" =~ ^[Yy]$ ]]; then
			if [[ -n "${GITHUB_TOKEN:-}" ]]; then
				info "Running 'gh auth login --with-token' using GITHUB_TOKEN..."
				if ! printf '%s\n' "$GITHUB_TOKEN" | gh auth login --hostname github.com --git-protocol https --with-token; then
					warn "GitHub CLI login attempt failed."
				fi
			else
				info "Starting interactive GitHub CLI login..."
				if ! gh auth login --hostname github.com --git-protocol https; then
					warn "GitHub CLI login attempt failed."
				fi
			fi

			if gh auth status -h github.com >/dev/null 2>&1; then
				success "GitHub CLI authenticated"
				return
			fi

			warn "GitHub CLI is still not authenticated."
			continue
		fi

		error "GitHub access is required."
		error "Run 'gh auth login' and rerun this installer."
		exit 1
	done
}

ensure_github_git_auth() {
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

ensure_docker() {
	if command_exists docker; then
		if ! is_expert_mode; then
			success "Docker CLI already installed"
		fi
		return
	fi

	install_homebrew
	guided_info "Installing Docker Desktop for local PostgreSQL projects."
	ensure_brew_package docker cask
	warn "Docker Desktop was installed. Launch it once to finish setup."
}

SUPABASE_MIN_VERSION="2.78.0"

# Returns 0 if $1 >= $2 (semver), 1 otherwise.
semver_gte() {
	local a="$1" b="$2"
	# Use sort -V if available, otherwise fall back to simple numeric comparison.
	if printf '%s\n%s\n' "$b" "$a" | sort -V --check=quiet 2>/dev/null; then
		return 0
	fi
	# Fallback: compare major.minor.patch numerically.
	local IFS=.
	local -a va=($a) vb=($b)
	for i in 0 1 2; do
		local na="${va[$i]:-0}" nb="${vb[$i]:-0}"
		if (( na > nb )); then return 0; fi
		if (( na < nb )); then return 1; fi
	done
	return 0
}

ensure_supabase() {
	if command_exists supabase; then
		# Check version and upgrade if below minimum required
		local installed_version
		installed_version="$(supabase --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
		if [[ -n "$installed_version" ]] && ! semver_gte "$installed_version" "$SUPABASE_MIN_VERSION"; then
			info "Supabase CLI v${installed_version} is below minimum v${SUPABASE_MIN_VERSION}. Upgrading..."
			install_homebrew
			brew tap supabase/tap >/dev/null 2>&1 || true
			brew upgrade supabase/tap/supabase >/dev/null 2>&1 || true
			success "Supabase CLI upgraded"
		elif ! is_expert_mode; then
			success "Supabase CLI already installed"
		fi
		return
	fi

	install_homebrew
	guided_info "Installing Supabase CLI for projects using Supabase."
	info "Installing Supabase CLI..."
	brew tap supabase/tap >/dev/null 2>&1 || true
	ensure_brew_package supabase
}

ensure_postgres() {
	if command_exists psql; then
		if ! is_expert_mode; then
			success "PostgreSQL client already installed"
		fi
		return
	fi

	install_homebrew
	guided_info "Installing PostgreSQL client tools for database and migrations."
	ensure_brew_package postgresql@16
	warn "Start PostgreSQL with: brew services start postgresql@16"
}

install_nvm() {
	if [[ -s "$NVM_DIR/nvm.sh" ]]; then
		if ! is_expert_mode; then
			success "nvm already installed"
		fi
		source_nvm
		return
	fi

	info "Installing nvm..."
	curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
	source_nvm

	if command_exists nvm; then
		success "Installed nvm"
	else
		warn "nvm installed, but not loaded in this shell yet."
	fi
}

resolve_node_version() {
	local version=""
	local package_url="https://raw.githubusercontent.com/${FORGE_REPO}/${FORGE_REF}/package.json"
	local readme_url="https://raw.githubusercontent.com/${FORGE_REPO}/${FORGE_REF}/README.md"
	local package_json
	local readme_md

	package_json="$(curl -fsSL "$package_url" 2>/dev/null || true)"
	if [[ -n "$package_json" ]]; then
		version="$(python3 - <<'PY' "$package_json" 2>/dev/null || true
import json
import re
import sys

raw = sys.argv[1]
try:
    data = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)

eng = (data.get("engines") or {}).get("node", "")
match = re.search(r"(\d+)", eng)
print(match.group(1) if match else "")
PY
)"
	fi

	if [[ -z "$version" ]]; then
		readme_md="$(curl -fsSL "$readme_url" 2>/dev/null || true)"
		if [[ -n "$readme_md" ]]; then
			version="$(
				printf '%s\n' "$readme_md" | sed -nE 's/^[[:space:]]*nvm install[[:space:]]+([0-9]+).*/\1/p' | head -n 1
			)"
		fi
	fi

	if [[ -z "$version" ]]; then
		version="$DEFAULT_NODE_VERSION"
		warn "Could not resolve Node version from ${FORGE_REPO}@${FORGE_REF}; using v$version." >&2
	fi

	printf "%s" "$version"
}

ensure_node_with_nvm() {
	local node_version="$1"

	install_nvm
	ensure_nvm_in_user_shell_rc
	source_nvm

	if ! command_exists nvm; then
		error "nvm is not available in this shell."
		error "Open a new terminal and rerun this installer."
		exit 1
	fi

	# Prevent unexpected output from being treated as an nvm version.
	node_version="${node_version#v}"
	if [[ ! "$node_version" =~ ^[0-9]+([.][0-9]+){0,2}$ ]]; then
		error "Invalid Node version resolved: $node_version"
		error "Set DEFAULT_NODE_VERSION to override, e.g. DEFAULT_NODE_VERSION=22"
		exit 1
	fi

	info "Installing Node.js v$node_version with nvm..."
	nvm install "$node_version"
	nvm alias default "$node_version" >/dev/null
	nvm use "$node_version" >/dev/null
	success "Node.js $(node -v) is active"
}

ensure_pnpm() {
	if command_exists pnpm; then
		if ! is_expert_mode; then
			success "pnpm already installed"
		fi
		# pnpm may exist without PNPM_HOME being configured (fresh VM edge case).
		# Always enforce PNPM_HOME before global installs.
		configure_pnpm_home
		return
	fi

	if ! command_exists corepack; then
		error "corepack was not found after installing Node.js."
		error "Open a new terminal and rerun this installer."
		exit 1
	fi

	info "Installing pnpm via corepack..."
	corepack enable
	corepack prepare pnpm@latest --activate

	if command_exists pnpm; then
		success "Installed pnpm ($(pnpm --version))"
	else
		error "pnpm installation failed."
		exit 1
	fi

	# Ensure PNPM_HOME is set and on PATH so pnpm link --global works in this shell session.
	# corepack installs pnpm but doesn't configure PNPM_HOME in the current process.
	# We derive it directly from pnpm's own config rather than relying on rc file sourcing.
	configure_pnpm_home
}

configure_pnpm_home() {
	# If already set and on PATH, nothing to do.
	if [[ -n "${PNPM_HOME:-}" ]] && [[ ":$PATH:" == *":$PNPM_HOME:"* ]]; then
		return
	fi

	# Determine pnpm home directory using platform defaults.
	local pnpm_home
	if [[ "$(uname -s)" == "Darwin" ]]; then
		pnpm_home="$HOME/Library/pnpm"
	else
		pnpm_home="${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
	fi

	mkdir -p "$pnpm_home"

	# Collect candidate rc files in preference order for this shell.
	# Login shells read *profile files; interactive shells read *rc files.
	# We check all candidates so we don't duplicate an export that pnpm setup
	# (or a previous run) already wrote to a different file.
	local -a rc_candidates
	local user_shell
	user_shell="$(basename "${SHELL:-/bin/bash}")"
	case "$user_shell" in
		zsh)  rc_candidates=("$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.zshenv") ;;
		bash) rc_candidates=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile") ;;
		*)    rc_candidates=("$HOME/.profile") ;;
	esac

	# If PNPM_HOME is already exported in any candidate, source that file and skip writing.
	local already_in=""
	for candidate in "${rc_candidates[@]}"; do
		if [[ -f "$candidate" ]] && grep -q 'PNPM_HOME' "$candidate" 2>/dev/null; then
			already_in="$candidate"
			break
		fi
	done

	if [[ -n "$already_in" ]]; then
		# shellcheck source=/dev/null
		set +eu
		source "$already_in" 2>/dev/null || true
		set -eu
	else
		# Pick the first candidate that already exists, or fall back to the first entry.
		local rc_file="${rc_candidates[0]}"
		for candidate in "${rc_candidates[@]}"; do
			if [[ -f "$candidate" ]]; then
				rc_file="$candidate"
				break
			fi
		done

		if [[ ! -f "$rc_file" ]]; then
			touch "$rc_file"
		fi

		{
			echo ""
			echo "# pnpm"
			echo "export PNPM_HOME=\"$pnpm_home\""
			echo "export PATH=\"\$PNPM_HOME:\$PATH\""
		} >> "$rc_file"

		# shellcheck source=/dev/null
		set +eu
		source "$rc_file" 2>/dev/null || true
		set -eu
	fi

	# Belt-and-suspenders: export directly in this process in case sourcing didn't work.
	export PNPM_HOME="$pnpm_home"
	if [[ ":$PATH:" != *":$PNPM_HOME:"* ]]; then
		export PATH="$PNPM_HOME:$PATH"
	fi
}

path_contains_dir() {
	local target_dir="$1"
	[[ ":$PATH:" == *":$target_dir:"* ]]
}

write_forge_wrapper() {
	local output_path="$1"

	# Remove first to avoid following symlinks (pnpm link creates symlinks to
	# forge.js; writing through them would destroy the JS entry file).
	rm -f "$output_path"

	cat > "$output_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

FORGE_CLI="$FORGE_INSTALL_DIR/bin/forge.js"
NODE_BIN=""

resolve_node_bin() {
	local candidate
	candidate="\$(command -v node 2>/dev/null || true)"
	if [[ -n "\$candidate" && "\$candidate" == /* && -x "\$candidate" ]]; then
		NODE_BIN="\$candidate"
		return 0
	fi
	return 1
}

if resolve_node_bin; then
	exec "\$NODE_BIN" "\$FORGE_CLI" "\$@"
fi

NVM_DIR="\${NVM_DIR:-\$HOME/.nvm}"
if [[ -s "\$NVM_DIR/nvm.sh" ]]; then
	# shellcheck source=/dev/null
	source "\$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi

if command -v nvm >/dev/null 2>&1; then
	nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
fi

if resolve_node_bin; then
	exec "\$NODE_BIN" "\$FORGE_CLI" "\$@"
fi

echo "forge could not find Node.js. Open a new terminal or run: source ~/.zshrc" >&2
exit 1
EOF
	chmod +x "$output_path"
}

configure_forge_bin_path() {
	# If FORGE_BIN_DIR is already active in PATH for this shell, no update is needed.
	if path_contains_dir "$FORGE_BIN_DIR"; then
		return
	fi

	mkdir -p "$FORGE_BIN_DIR"

	local -a rc_candidates
	local user_shell
	user_shell="$(basename "${SHELL:-/bin/bash}")"
	case "$user_shell" in
		zsh)  rc_candidates=("$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.zshenv") ;;
		bash) rc_candidates=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile") ;;
		*)    rc_candidates=("$HOME/.profile") ;;
	esac

	local already_in=""
	local candidate
	for candidate in "${rc_candidates[@]}"; do
		if [[ -f "$candidate" ]] && grep -q 'FORGE_BIN_DIR' "$candidate" 2>/dev/null; then
			already_in="$candidate"
			break
		fi
	done

	if [[ -n "$already_in" ]]; then
		# shellcheck source=/dev/null
		set +eu
		source "$already_in" 2>/dev/null || true
		set -eu
	else
		local rc_file="${rc_candidates[0]}"
		for candidate in "${rc_candidates[@]}"; do
			if [[ -f "$candidate" ]]; then
				rc_file="$candidate"
				break
			fi
		done

		if [[ ! -f "$rc_file" ]]; then
			touch "$rc_file"
		fi

		{
			echo ""
			echo "# forge"
			echo "export FORGE_BIN_DIR=\"$FORGE_BIN_DIR\""
			echo "export PATH=\"\$FORGE_BIN_DIR:\$PATH\""
		} >> "$rc_file"

		# shellcheck source=/dev/null
		set +eu
		source "$rc_file" 2>/dev/null || true
		set -eu
	fi

	export FORGE_BIN_DIR="$FORGE_BIN_DIR"
	if ! path_contains_dir "$FORGE_BIN_DIR"; then
		export PATH="$FORGE_BIN_DIR:$PATH"
	fi
}

install_forge_command() {
	local cli_entry="$FORGE_INSTALL_DIR/bin/forge.js"

	if [[ ! -f "$cli_entry" ]]; then
		error "Expected CLI entrypoint not found: $cli_entry"
		exit 1
	fi

	# Prefer linking into a writable directory already on PATH so users can run
	# `forge` immediately after a curl|bash install without reloading their shell.
	local -a preferred_path_dirs=(
		"/opt/homebrew/bin"
		"/usr/local/bin"
		"$HOME/.local/bin"
		"$HOME/bin"
	)
	local target_dir=""
	local dir
	for dir in "${preferred_path_dirs[@]}"; do
		if path_contains_dir "$dir" && [[ -d "$dir" ]] && [[ -w "$dir" ]]; then
			target_dir="$dir"
			break
		fi
	done

	if [[ -n "$target_dir" ]]; then
		write_forge_wrapper "$target_dir/forge"
		success "Installed forge command at $target_dir/forge"
	else
		mkdir -p "$FORGE_BIN_DIR"
		write_forge_wrapper "$FORGE_BIN_DIR/forge"
		configure_forge_bin_path
		success "Installed forge command at $FORGE_BIN_DIR/forge"
	fi

	# Overwrite the pnpm shim when possible to avoid "node: not found" on shells
	# where PNPM_HOME appears before other PATH entries.
	if [[ -n "${PNPM_HOME:-}" && -d "${PNPM_HOME}" && -w "${PNPM_HOME}" ]]; then
		write_forge_wrapper "${PNPM_HOME}/forge"
		success "Updated pnpm forge shim at ${PNPM_HOME}/forge"
	fi
}

VERCEL_MIN_VERSION="50.30.0"

ensure_vercel_cli() {
	if command_exists vercel; then
		# Check version and upgrade if below minimum required
		local installed_version
		installed_version="$(vercel --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
		if [[ -n "$installed_version" ]] && ! semver_gte "$installed_version" "$VERCEL_MIN_VERSION"; then
			info "Vercel CLI v${installed_version} is below minimum v${VERCEL_MIN_VERSION}. Upgrading..."
			local vercel_path
			vercel_path="$(command -v vercel)"
			if [[ "$vercel_path" == /opt/homebrew/* || "$vercel_path" == /usr/local/* ]]; then
				brew upgrade vercel-cli >/dev/null 2>&1 || true
			else
				pnpm add -g vercel@latest >/dev/null 2>&1 || true
			fi
			success "Vercel CLI upgraded"
		elif ! is_expert_mode; then
			success "Vercel CLI already installed"
		fi
		return
	fi

	if ! command_exists pnpm; then
		error "pnpm is required before installing Vercel CLI."
		error "Open a new terminal and rerun this installer."
		exit 1
	fi

	info "Installing Vercel CLI..."
	pnpm add -g vercel@latest

	if command_exists vercel; then
		success "Installed Vercel CLI ($(vercel --version))"
	else
		warn "Vercel CLI installed, but this shell cannot find it yet."
		warn "Open a new terminal and run: vercel --version"
	fi
}

sync_forge_repo() {
	local repo_https_url="https://github.com/${FORGE_REPO}.git"

	mkdir -p "$(dirname "$FORGE_INSTALL_DIR")"

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

	info "Cloning forge source to $FORGE_INSTALL_DIR..."
	if command_exists gh; then
		if ! gh repo clone "$FORGE_REPO" "$FORGE_INSTALL_DIR" -- --branch "$FORGE_REF"; then
			warn "gh clone failed; trying git clone over HTTPS..."
			git clone --branch "$FORGE_REF" "$repo_https_url" "$FORGE_INSTALL_DIR"
		fi
	else
		git clone --branch "$FORGE_REF" "$repo_https_url" "$FORGE_INSTALL_DIR"
	fi
	success "Cloned forge source"
}

install_forge_cli() {
	info "Installing forge CLI globally..."
	(
		cd "$FORGE_INSTALL_DIR"
		pnpm install
		pnpm run install:forge
	)

	install_forge_command

	if command_exists forge; then
		success "forge CLI installed ($(forge --version))"
		return
	fi

	warn "forge installed, but this shell cannot find the binary yet."
	warn "Open a new terminal and run: forge --version"
}

main() {
	parse_args "$@"
	detect_expert_mode

	if [[ "${FORGE_INSTALLER_SMOKE_TEST:-0}" == "1" ]]; then
		run_smoke_test
		return
	fi

	# ─────────────────────────────────────────────────────────────────────────────
	# Phase 1: Prerequisites
	# ─────────────────────────────────────────────────────────────────────────────
	if is_expert_mode; then
		info "Installing forge..."
	else
		info "Setting up forge..."
		info "We'll install core tools, then make the forge command available."
		info "This usually takes a few minutes."
	fi
	info ""
	info "┌─────────────────────────────────────────────────────────────────────┐"
	info "│  Phase 1/2: Checking/Installing Prerequisites                        │"
	info "│  Homebrew, Git, GitHub CLI, Node.js, pnpm                           │"
	info "└─────────────────────────────────────────────────────────────────────┘"
	info ""

	install_homebrew
	ensure_git
	ensure_github_cli
	ensure_github_auth
	ensure_github_git_auth

	local node_version
	node_version="$(resolve_node_version)"
	ensure_node_with_nvm "$node_version"
	ensure_pnpm

	# Smoke test: verify node and pnpm are actually accessible
	if ! ensure_node_pnpm_accessible; then
		exit 1
	fi

	if ! is_expert_mode; then
		info ""
		success "Prerequisites installed"
		info ""
	fi

	# ─────────────────────────────────────────────────────────────────────────────
	# Phase 2: Install forge CLI
	# ─────────────────────────────────────────────────────────────────────────────
	info "┌─────────────────────────────────────────────────────────────────────┐"
	info "│  Phase 2/2: Installing forge CLI                                    │"
	info "│  Cloning source, building, linking globally                         │"
	info "└─────────────────────────────────────────────────────────────────────┘"
	info ""

	sync_forge_repo
	install_forge_cli

	if ! is_expert_mode; then
		info ""
	fi
	success "Forge bootstrap complete"

	# Detect whether the forge binary is reachable in the current shell.
	# If not, the user needs to reload their shell environment before proceeding.
	local shell_reload_needed=0
	local user_shell rc_hint
	user_shell="$(basename "${SHELL:-/bin/bash}")"
	case "$user_shell" in
		zsh)
			if [[ -f "$HOME/.zprofile" ]] && grep -q 'PNPM_HOME' "$HOME/.zprofile" 2>/dev/null; then
				rc_hint="source ~/.zprofile"
			else
				rc_hint="source ~/.zshrc"
			fi
			;;
		bash)
			if [[ -f "$HOME/.bash_profile" ]] && grep -q 'PNPM_HOME' "$HOME/.bash_profile" 2>/dev/null; then
				rc_hint="source ~/.bash_profile"
			else
				rc_hint="source ~/.bashrc"
			fi
			;;
		*)    rc_hint="source ~/.profile" ;;
	esac

	if ! command_exists forge; then
		shell_reload_needed=1
	fi

	if [[ "$shell_reload_needed" == "1" ]]; then
		# Determine the user's primary rc file for the reload hint.
		info "┌─────────────────────────────────────────────────────────────────────┐"
		info "│  Almost done! Reload your shell to activate new PATH entries.      │"
		info "└─────────────────────────────────────────────────────────────────────┘"
		info ""
		info "  Run this command:"
		info "    $rc_hint"
		info ""
		info "  Or simply open a new terminal window."
		info ""
	fi

	info "┌─────────────────────────────────────────────────────────────────────┐"
	info "│  Next Steps                                                         │"
	info "└─────────────────────────────────────────────────────────────────────┘"
	info ""
	run_shell_command_with_prompt \
		"1) Reload your shell so new PATH entries are active:" \
		"$rc_hint" \
		"    Run this now? [Y/n]: "
	info ""
	run_shell_command_with_prompt \
		"2) Configure forge (sets up auth and local defaults):" \
		"forge config" \
		"    Start config now? [Y/n]: "
	info ""
	info "  3) Create your first project scaffold:"
	info "       forge new my-test-app"
}

main "$@"
