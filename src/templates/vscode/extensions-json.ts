export function generateVSCodeExtensions(): string {
	return JSON.stringify(
		{ recommendations: ["biomejs.biome", "dbaeumer.vscode-eslint"] },
		null,
		"\t",
	);
}
