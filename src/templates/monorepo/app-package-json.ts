interface PackageJsonOptions {
	auth?: "workos" | "simple" | "better-auth" | "none";
	db?: "postgres" | "supabase";
}

export function generateMonorepoAppPackageJson(
	appName: string,
	options: PackageJsonOptions = {},
): string {
	const { auth, db } = options;

	const dependencies: Record<string, string> = {
		"@workspace/ui": "workspace:*",
		next: "^16.1.6",
		react: "^19.2.4",
		"react-dom": "^19.2.4",
		"posthog-js": "^1.360.1",
		"posthog-node": "^5.28.1",
		"server-only": "^0.0.1",
	};

	// Add database dependencies based on db choice
	if (db === "supabase") {
		dependencies["@supabase/supabase-js"] = "^2.99.1";
		dependencies["@supabase/ssr"] = "^0.9.0";
	}

	// Add auth dependencies
	if (auth === "workos") {
		dependencies["@workos-inc/authkit-nextjs"] = "^2.15.0";
	} else if (auth === "better-auth") {
		dependencies["better-auth"] = "^1.4.0";
	}

	const scripts: Record<string, string> = {
		dev: "next dev",
		build: "next build",
		start: "next start",
		lint: "eslint .",
		"lint:fix": "eslint . --fix",
		format: "biome format --write .",
		"format:check": "biome format .",
		typecheck: "tsc --noEmit",
		test: "vitest run",
		"test:watch": "vitest",
		"test:coverage": "vitest run --coverage",
		"env:pull": "forge env pull",
		"env:push": "forge env push",
	};

	// Add db scripts only when db is configured
	if (db) {
		scripts["db:generate"] = "drizzle-kit generate";
		scripts["db:migrate"] = "drizzle-kit migrate";
		scripts["db:push"] = "drizzle-kit push";
		scripts["db:studio"] = "drizzle-kit studio";
	}

	// Add postgres docker start script and wire it into dev (script is at monorepo root)
	if (db === "postgres") {
		scripts["db:start"] = "cd ../.. && ./scripts/db-start";
		scripts.dev = "pnpm db:start && next dev";
	}

	// Add supabase scripts when using supabase db (supabase dir is at monorepo root)
	if (db === "supabase") {
		scripts["supabase:start"] = "cd ../.. && ./scripts/supabase-start";
		scripts["supabase:stop"] = "cd ../.. && supabase stop";
		scripts.dev = "pnpm supabase:start && next dev";
	}

	const devDependencies: Record<string, string> = {
		"agent-browser": "^0.23.4",
		"@eslint/js": "^9.38.0",
		"@biomejs/biome": "^2.4.6",
		"@tailwindcss/postcss": "^4.2.1",
		"@testing-library/jest-dom": "^6.9.1",
		"@testing-library/react": "^16.3.2",
		"@types/node": "^25.4.0",
		"@types/react": "^19.2.14",
		"@types/react-dom": "^19.2.3",
		"@faker-js/faker": "^10.3.0",
		"@vitejs/plugin-react": "^5.1.4",
		"@vitest/coverage-v8": "^4.0.18",
		dotenv: "^17.3.1",
		eslint: "^9.38.0",
		"eslint-config-prettier": "^10.1.8",
		postcss: "^8.5.8",
		tailwindcss: "^4.2.1",
		"typescript-eslint": "^8.57.0",
		typescript: "^5.9.3",
		vitest: "^4.0.18",
		"vite-tsconfig-paths": "^6.1.1",
	};

	// Add drizzle dependencies only when db is configured
	if (db) {
		devDependencies["drizzle-orm"] = "^0.45.1";
		devDependencies["drizzle-kit"] = "^0.31.9";
		devDependencies.postgres = "^3.4.8";
	}

	return JSON.stringify(
		{
			name: appName,
			version: "0.1.0",
			private: true,
			scripts,
			dependencies,
			devDependencies,
		},
		null,
		"\t",
	);
}
