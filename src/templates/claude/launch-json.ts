/**
 * Claude Code launch.json: dev server config so "Run" / "Preview" works without prompts.
 * See https://docs.anthropic.com/ for launch.json format.
 */
export function generateClaudeLaunchJson(): string {
	return JSON.stringify(
		{
			version: "0.0.1",
			configurations: [
				{
					name: "dev",
					runtimeExecutable: "pnpm",
					runtimeArgs: ["dev"],
					port: 3000,
				},
			],
		},
		null,
		"\t",
	);
}
