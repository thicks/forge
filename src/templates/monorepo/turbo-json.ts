export function generateTurboJson(): string {
	return JSON.stringify(
		{
			$schema: "https://turbo.build/schema.json",
			ui: "tui",
			tasks: {
				build: {
					dependsOn: ["^build"],
					inputs: ["$TURBO_DEFAULT$", ".env*"],
					outputs: [".next/**", "!.next/cache/**"],
				},
				lint: {
					dependsOn: ["^build"],
				},
				"lint:fix": {
					dependsOn: ["^build"],
				},
				format: {},
				"format:check": {},
				typecheck: {
					dependsOn: ["^build"],
				},
				dev: {
					cache: false,
					persistent: true,
				},
				"env:pull": {
					cache: false,
				},
				"env:push": {
					cache: false,
				},
			},
		},
		null,
		"\t",
	);
}
