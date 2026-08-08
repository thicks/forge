/**
 * Tsconfig for Next.js 16. jsx: "react-jsx" and .next/dev/types in include
 * avoid Next from rewriting tsconfig at dev start (Turbopack types).
 * Uses 2-space indent to match Biome's JSON formatter output.
 */
export function generateTsConfig(): string {
	return `${JSON.stringify(
		{
			compilerOptions: {
				target: "ES2017",
				lib: ["dom", "dom.iterable", "esnext"],
				allowJs: true,
				skipLibCheck: true,
				strict: true,
				noEmit: true,
				esModuleInterop: true,
				module: "esnext",
				moduleResolution: "bundler",
				resolveJsonModule: true,
				isolatedModules: true,
				jsx: "react-jsx",
				incremental: true,
				plugins: [{ name: "next" }],
				paths: {
					"@/*": ["./*"],
				},
			},
			include: [
				"next-env.d.ts",
				"**/*.ts",
				"**/*.tsx",
				".next/types/**/*.ts",
				".next/dev/types/**/*.ts",
			],
			exclude: ["node_modules"],
		},
		null,
		2,
	)}
`;
}
