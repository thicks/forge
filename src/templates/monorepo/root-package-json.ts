export function generateMonorepoRootPackageJson(repoName: string): string {
	return JSON.stringify(
		{
			name: repoName,
			version: "0.0.0",
			private: true,
			scripts: {
				dev: "turbo dev",
				build: "turbo build",
				lint: "turbo lint",
				"lint:fix": "turbo lint:fix",
				format: "turbo format",
				"format:check": "turbo format:check",
				typecheck: "turbo typecheck",
				test: "turbo test",
				"test:watch": "turbo test:watch",
				"test:coverage": "turbo test:coverage",
				"env:pull": "turbo run env:pull",
				"env:push": "turbo run env:push",
				"app:setup": "./scripts/setup",
			},
			devDependencies: {
				"@biomejs/biome": "^2.4.6",
				turbo: "^2.8.16",
			},
			packageManager: "pnpm@10.32.1",
		},
		null,
		"\t",
	);
}
