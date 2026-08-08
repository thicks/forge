---
name: git-pr
description: Create pull requests by analyzing commits, drafting summaries, and opening PRs with gh. Use when the user asks to create, open, or submit a PR.
allowed-tools: Bash(git:*), Bash(gh:*), Read, Grep
---

# Pull Request Workflow

## Steps

1. Confirm current branch is not `main` or `master`.
2. Inspect branch status and commit range against base branch.
3. Summarize all commits included in the PR.
4. Push branch with `git push -u origin HEAD` if needed.
5. Ask the user: "Is there a Linear ticket number for this PR? (e.g. PSS-123, leave blank to skip)"
6. Create PR using `gh pr create` with:
   - A concise title
   - Summary bullets
   - Test plan checklist
   - If a ticket number was provided, include a plain link at the bottom of the body: `[PSS-123](https://linear.app/your-org/issue/PSS-123)`
   - If no ticket number was provided, omit the ticket line entirely

## Branch Naming

Default format: `<ticket-number>/<short-description>`

Example: `PSS-123/add-better-auth-support`

If the user says "prepend with th" or similar, use: `th/<ticket-number>/<short-description>`

## Rules

- Do NOT append "Made with Cursor", "Made with Claude", or any AI attribution footer to the PR description.

## Commands

```bash
git status
git log --oneline main..HEAD
git diff --stat main...HEAD
git push -u origin HEAD
gh pr create --title "..." --body "..."
```
