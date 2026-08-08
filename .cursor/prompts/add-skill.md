# Add Skill

Use this prompt when adding a new Claude Code skill that gets installed in scaffolded projects.

## Workflow

1. **Define the skill's purpose**:
   - What task does this skill help with?
   - When should the AI use it? (trigger conditions)
   - What tools does it need access to?

2. **Create the skill file**:
   - Location: `assets/claude/skills/<skill-name>/SKILL.md`
   - Follow the SKILL.md format with frontmatter

3. **Register in the manifest**:
   - Edit `assets/skills.json`
   - Add an entry with `id`, `source`, `asset`, and condition (`always` or `when`)

4. **Test**:
   - Run `pnpm dev:app` to scaffold a test project
   - Verify the skill appears in `.claude/skills/<skill-name>/`
   - Open the project in Claude Code and verify the skill is recognized

## SKILL.md Format

```markdown
---
name: skill-name
description: One-line description of when to use this skill. Use when [trigger condition].
allowed-tools: Bash(command:*), Read, Write, Grep
---

# Skill Title

## Commands

\`\`\`bash
example command
\`\`\`

## Instructions

1. Step one
2. Step two
3. Step three

## Notes

- Additional context
- Edge cases
```

## skills.json Entry

```json
{
  "id": "skill-name",
  "source": "local",
  "asset": "claude/skills/skill-name",
  "always": true
}
```

Or with a condition:

```json
{
  "id": "db-migrate",
  "source": "local",
  "asset": "claude/skills/db-migrate",
  "when": "db"
}
```

## Condition Types

- `"always": true` — Always install
- `"when": "db"` — Install when `--db` flag is used
- `"when": "auth:workos"` — Install when `--auth workos` is used
- `"when": "auth:simple"` — Install when `--auth simple` is used

## Remote Skills

For skills from external repos:

```json
{
  "id": "external-skill",
  "source": "repo",
  "repo": "https://github.com/org/skills-repo",
  "skills": ["skill-name-in-repo"],
  "always": true
}
```
