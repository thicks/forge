import path from "node:path";
import {
	copyFile,
	ensureDir,
	fileExists,
	readFile,
	writeFile,
} from "../utils/index.js";
import type { DbType, MigrationManifest, MigrationResult } from "./types.js";

/**
 * Rewrites the Drizzle DB client from node-postgres (pg Pool) to postgres-js,
 * which is the pattern used by the forge standalone apps with Supabase.
 */
function generateMigratedDbClient(): string {
	return `import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
`;
}

/**
 * Rewrites storage.ts imports to point to the new db client location
 * and removes Replit-specific imports.
 */
function rewriteStorageImports(content: string): string {
	let result = content;

	// Rewrite the DB import to use the local db client
	result = result.replace(
		/import\s*\{[^}]*\}\s*from\s*["'`]\.\/db["'`]/g,
		'import { db } from "@/db"',
	);
	result = result.replace(
		/import\s*\{[^}]*db[^}]*\}\s*from\s*["'`]\.\.\/server\/db["'`]/g,
		'import { db } from "@/db"',
	);

	// Rewrite shared schema imports
	result = result.replace(
		/from\s*["'`]@shared\/schema["'`]/g,
		'from "@/db/schema"',
	);
	result = result.replace(
		/from\s*["'`]@shared\/([^"'`]+)["'`]/g,
		'from "@/db/$1"',
	);

	return result;
}

/**
 * Generates a Drizzle config pointing at the migrations output directory
 * for the selected database mode.
 */
function generateMigratedDrizzleConfig(db: DbType): string {
	const outDir =
		db === "supabase" ? "./supabase/migrations" : "./drizzle/migrations";
	return `import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./db/schema.ts",
	out: "${outDir}",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
`;
}

export async function convertSchema(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
	db: DbType,
): Promise<void> {
	const migrationsPath =
		db === "supabase"
			? path.join("supabase", "migrations")
			: path.join("drizzle", "migrations");

	// Create target directories
	await ensureDir(path.join(targetDir, "db"));
	await ensureDir(path.join(targetDir, "lib"));
	await ensureDir(path.join(targetDir, migrationsPath));

	// Copy and adapt schema file
	if (manifest.schemaFile) {
		let schemaContent = await readFile(manifest.schemaFile);

		// Remove any Replit-specific imports from the schema
		schemaContent = schemaContent.replace(
			/import.*from\s*["'`].*replit.*["'`];?\n?/g,
			"",
		);

		await writeFile(path.join(targetDir, "db", "schema.ts"), schemaContent);
		result.filesWritten.push("db/schema.ts");

		// Check for shared/models directory and copy those too
		const modelsDir = path.join(manifest.sourceDir, "shared", "models");
		if (await fileExists(modelsDir)) {
			const fs = await import("fs-extra");
			const entries = await fs.default.readdir(modelsDir);
			for (const entry of entries) {
				if (entry.endsWith(".ts")) {
					let content = await readFile(path.join(modelsDir, entry));
					content = content.replace(
						/from\s*["'`]@shared\/schema["'`]/g,
						'from "@/db/schema"',
					);
					await writeFile(path.join(targetDir, "db", entry), content);
					result.filesWritten.push(`db/${entry}`);
				}
			}
		}
	} else {
		result.warnings.push(
			"No schema file found in source - skipping schema conversion",
		);
	}

	// Generate new DB client
	await writeFile(
		path.join(targetDir, "db", "index.ts"),
		generateMigratedDbClient(),
	);
	result.filesWritten.push("db/index.ts");

	// Copy and adapt storage layer
	if (manifest.storageFile) {
		let storageContent = await readFile(manifest.storageFile);
		storageContent = rewriteStorageImports(storageContent);

		// Remove Replit auth imports
		storageContent = storageContent.replace(
			/import.*from\s*["'`]\.\/replit_integrations[^"'`]*["'`];?\n?/g,
			"",
		);
		storageContent = storageContent.replace(
			/import.*from\s*["'`]\.\.\/replit_integrations[^"'`]*["'`];?\n?/g,
			"",
		);

		await writeFile(path.join(targetDir, "lib", "storage.ts"), storageContent);
		result.filesWritten.push("lib/storage.ts");
	}

	// Generate Drizzle config
	await writeFile(
		path.join(targetDir, "drizzle.config.ts"),
		generateMigratedDrizzleConfig(db),
	);
	result.filesWritten.push("drizzle.config.ts");

	// Copy migration files
	for (const migFile of manifest.migrationFiles) {
		const basename = path.basename(migFile);
		const dest = path.join(targetDir, migrationsPath, basename);
		await copyFile(migFile, dest);
		result.filesWritten.push(
			`${migrationsPath.split(path.sep).join("/")}/${basename}`,
		);
	}
}
