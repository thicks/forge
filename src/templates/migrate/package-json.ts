import type { AuthType, DbType } from "../../migrate/types.js";

/**
 * Generates a package.json for the migrated Next.js application.
 * Merges portable dependencies from the source with the Next.js
 * framework dependencies.
 */
export function generateMigratePackageJson(
	appName: string,
	options: {
		auth: AuthType;
		db: DbType;
		sourceDeps: Record<string, string>;
		sourceDevDeps: Record<string, string>;
		replitDeps: string[];
		serverDeps: string[];
	},
): string {
	const excludeDeps = new Set([
		...options.replitDeps,
		...options.serverDeps,
		// Always exclude these since Next.js replaces them
		"express",
		"vite",
		"@vitejs/plugin-react",
		"esbuild",
		"tsx",
		"connect-pg-simple",
		"express-session",
		"express-rate-limit",
		"csurf",
		"cookie-parser",
		"cors",
		"compression",
		"passport",
		"openid-client",
		"memoizee",
		"@types/express",
		"@types/express-session",
		"@types/cookie-parser",
		"@types/cors",
		"@types/passport",
		"@types/memoizee",
		"@types/connect-pg-simple",
		// Replit specific
		"@replit/vite-plugin-runtime-error-modal",
		"@replit/vite-plugin-cartographer",
		"@replit/vite-plugin-dev-banner",
		"@google-cloud/storage",
	]);

	// Start with Next.js core dependencies
	const dependencies: Record<string, string> = {
		next: "^16.1.6",
		react: "^19.2.4",
		"react-dom": "^19.2.4",
	};

	// Add portable source dependencies
	for (const [dep, version] of Object.entries(options.sourceDeps)) {
		if (!excludeDeps.has(dep) && !dependencies[dep]) {
			dependencies[dep] = version;
		}
	}

	// Auth dependencies
	if (options.auth === "workos") {
		dependencies["@workos-inc/authkit-nextjs"] = "^2.15.0";
	}

	// Ensure TanStack Query is included
	if (!dependencies["@tanstack/react-query"]) {
		dependencies["@tanstack/react-query"] = "^5.60.5";
	}

	const scripts: Record<string, string> = {
		dev: "next dev",
		build: "next build",
		start: "next start",
		lint: "eslint . --fix",
		"lint:check": "eslint .",
		format: "prettier --write .",
		"format:check": "prettier --check .",
		typecheck: "tsc --noEmit",
		"db:generate": "drizzle-kit generate",
		"db:migrate": "drizzle-kit migrate",
		"db:push": "drizzle-kit push",
		"db:studio": "drizzle-kit studio",
	};

	if (options.db === "supabase") {
		scripts["supabase:start"] = "./scripts/supabase-start";
		scripts["supabase:stop"] = "supabase stop";
	}

	const devDependencies: Record<string, string> = {
		"@eslint/eslintrc": "^3.0.0",
		"@tailwindcss/postcss": "^4.2.1",
		"@types/node": "^25.4.0",
		"@types/react": "^19.2.14",
		"@types/react-dom": "^19.2.3",
		eslint: "^9.38.0",
		"eslint-config-next": "^16.1.6",
		postcss: "^8.5.8",
		prettier: "^3.0.0",
		tailwindcss: "^4.2.1",
		typescript: "^5.9.3",
		"drizzle-orm": "^0.45.1",
		"drizzle-kit": "^0.31.9",
		postgres: "^3.4.8",
	};

	// Add portable source devDependencies
	for (const [dep, version] of Object.entries(options.sourceDevDeps)) {
		if (!excludeDeps.has(dep) && !devDependencies[dep] && !dependencies[dep]) {
			devDependencies[dep] = version;
		}
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
