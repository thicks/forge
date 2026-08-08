import type { AuthType, DbType } from "../../migrate/types.js";

/**
 * Generates a .env.example for the migrated application,
 * combining database, auth, and source-specific env vars.
 */
export function generateMigrateEnvExample(options: {
	appName: string;
	auth: AuthType;
	db: DbType;
	extraVars: string[];
}): string {
	const lines: string[] = [];

	// Database
	if (options.db === "supabase") {
		lines.push("# Supabase Database");
		lines.push("# Run `supabase start` to get local development values");
		lines.push(
			"DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
		);
		lines.push("");
	} else {
		lines.push("# PostgreSQL Database");
		lines.push("# Run `docker compose up -d` to start local PostgreSQL");
		lines.push(
			`DATABASE_URL=postgresql://postgres:postgres@localhost:5400/${options.appName}`,
		);
		lines.push("");
	}

	// Auth
	if (options.auth === "workos") {
		lines.push("# WorkOS Authentication");
		lines.push("WORKOS_CLIENT_ID=");
		lines.push("WORKOS_API_KEY=");
		lines.push(
			"WORKOS_COOKIE_PASSWORD=<generate-a-random-32-byte-base64-string>",
		);
		lines.push(
			"NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback",
		);
		lines.push("");
	}

	// Extra vars from source (non-Replit, non-Express)
	if (options.extraVars.length > 0) {
		lines.push("# Application-specific (from source)");
		for (const v of options.extraVars) {
			lines.push(`${v}=`);
		}
		lines.push("");
	}

	return lines.join("\n");
}
