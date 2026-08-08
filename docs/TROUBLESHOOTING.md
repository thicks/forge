# Troubleshooting

#### `forge: command not found` after install

The install script runs inside a subshell, so PATH changes it makes don't carry over to your current terminal session. If the installer finishes successfully but `forge` isn't found, reload your shell config or open a new terminal:

```bash
# Reload your shell config (zsh)
source ~/.zshrc

# Then verify
forge --version
```

If that still doesn't work, Homebrew's bin directory may not be in your PATH. Run:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile && source ~/.zprofile
```

Then try `forge --version` again.

#### Why your curl command returned 404

`https://raw.githubusercontent.com/...` only serves files from public repos (or private repos with authenticated access, which `curl` does not have by default).  
So the command fails with `404` even when `install.sh` exists.

#### SSH host key prompt when running in a script (`forge update ... --github`)

When pushing to GitHub over SSH, the first connection to `github.com` can prompt: *"The authenticity of host 'github.com' can't be established..."*. In a non-interactive script there is no way to type `yes`, so the command hangs or fails.

**Automatic fix:** As of the latest forge, `setup-git` (used by `new --github` and `update --github`) runs `ssh-keyscan` to add `github.com` to your `~/.ssh/known_hosts` before pushing, so this prompt should not appear. If you are on an older version, run `forge self-update`.

**One-time manual fix:** Run once (as the user that runs the script):

```bash
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
```

After that, SSH no longer asks to verify GitHub’s host key.

#### GitHub push rejected: missing `workflow` scope (`forge update --github`)

When running `forge update <project> --github` (or `forge new --github`), you may see:

```
refusing to allow an OAuth App to create or update workflow `.github/workflows/checks.yml` without `workflow` scope
```

**Cause:** Your `gh` CLI token was authenticated without the `workflow` OAuth scope. GitHub blocks any push that touches `.github/workflows/` files unless the token explicitly grants that scope.

**Fix:** Refresh your token to include the scope:

```bash
gh auth refresh --scopes "repo,workflow"
```

Then retry the command. You can verify your current scopes at any time with:

```bash
gh auth status
```

Look for a line like `Token scopes: 'repo', 'workflow', ...` — `workflow` must be present.
# Recovery and Safety

If GitHub setup reports divergent history, reconcile the remote manually and retry; Forge will not force-push over remote commits.

If self-update reports that local changes could not be restored, run `git stash pop` in the Forge install directory.

Unreadable Vercel sensitive variables are not copied into local snapshots or overwritten by `forge env push`; update them in Vercel directly when needed.
