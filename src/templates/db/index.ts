export { generateDbSchema } from "./schema.js";
export {
	generateSupabaseBrowserClient,
	generateSupabaseServerClient,
	generateSupabaseMiddlewareClient,
	generatePostgresClient,
	// Legacy exports
	generateDbClient,
	generateDbServerClient,
	generateDbMiddlewareClient,
} from "./client.js";
export { generateDrizzleConfig } from "./drizzle-config.js";
