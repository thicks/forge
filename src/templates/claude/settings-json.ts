/**
 * Project-level Claude Code settings (.claude/settings.json).
 * Shared with the team via git. Use .claude/settings.local.json (gitignored) for personal overrides.
 * Schema: https://code.claude.com/docs/en/settings
 */
export function generateClaudeSettingsJson(): string {
	return JSON.stringify(
		{
			$schema: "https://json.schemastore.org/claude-code-settings.json",
			permissions: {
				allow: [
					"Bash(pnpm:*)",
					"Bash(git:*)",
					"Bash(gh:*)",
					"Bash(biome:*)",
					"Bash(npx eslint:*)",
					"Bash(agent-browser:*)",
					"Bash(npx drizzle-kit:*)",
				],
			},
		},
		null,
		"\t",
	);
}
