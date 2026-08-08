/**
 * Example Claude Desktop config for this project.
 * Claude Desktop uses a single global config file (not per-project). To use it with this app,
 * merge this JSON into your global config and restart Claude Desktop.
 * Locations: macOS ~/Library/Application Support/Claude/claude_desktop_config.json
 *            Windows %APPDATA%\\Claude\\claude_desktop_config.json
 *            Linux ~/.config/Claude/claude_desktop_config.json
 */
export function generateClaudeDesktopConfigExample(): string {
	return JSON.stringify(
		{
			mcpServers: {},
		},
		null,
		"\t",
	);
}
