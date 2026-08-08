export function generateDrizzleConfig(
	db: "postgres" | "supabase" = "supabase",
): string {
	const migrationsDir =
		db === "supabase" ? "./supabase/migrations" : "./drizzle/migrations";

	return `import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load environment variables from .env.local
config({ path: ".env.local" });

export default defineConfig({
	schema: "./db/schema.ts",
	out: "${migrationsDir}",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
`;
}
