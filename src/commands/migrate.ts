import path from "node:path";
import { Command } from "commander";
import { analyzeSource } from "../migrate/analyzer.js";
import { convertAuth } from "../migrate/auth-converter.js";
import { copyComponents } from "../migrate/component-copier.js";
import { convertPages } from "../migrate/page-converter.js";
import { generateReport } from "../migrate/report.js";
import { convertRoutes } from "../migrate/route-converter.js";
import { convertSchema } from "../migrate/schema-converter.js";
import type {
	AuthType,
	DbType,
	MigrateOptions,
	MigrationResult,
} from "../migrate/types.js";
import {
	generateBiomeJson,
	generateDockerCompose,
	generateGitignore,
	generateGlobalsCss,
	generateNextConfig,
	generatePostcssConfig,
	generateSupabaseConfig,
	generateSupabaseSeed,
	generateSupabaseStartScript,
	generateTsConfig,
} from "../templates/index.js";
import {
	generateMigrateEnvExample,
	generateMigratePackageJson,
	generateMigrateProviders,
	generateMigrateQueryClient,
	generateMigrateRootLayout,
} from "../templates/migrate/index.js";
import {
	copyFile,
	ensureDir,
	fileExists,
	getAssetPath,
	gitAdd,
	gitCommit,
	gitInit,
	log,
	pnpmInstall,
	withSpinner,
	writeFile,
} from "../utils/index.js";

/** Environment variables that are Replit-specific and should not be carried over */
const REPLIT_ENV_VARS = [
	"REPL_ID",
	"REPL_SLUG",
	"REPLIT_DB_URL",
	"ISSUER_URL",
	"SESSION_SECRET",
	"PORT",
];

/** Extract non-Replit env var names from source .env or .env.example */
async function extractSourceEnvVars(sourceDir: string): Promise<string[]> {
	const envVars: string[] = [];

	for (const envFile of [".env", ".env.example", ".env.local"]) {
		const envPath = path.join(sourceDir, envFile);
		if (await fileExists(envPath)) {
			const { readFile } = await import("../utils/index.js");
			const content = await readFile(envPath);
			const lines = content.split("\n");
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const eqIdx = trimmed.indexOf("=");
				if (eqIdx > 0) {
					const varName = trimmed.substring(0, eqIdx).trim();
					if (
						!REPLIT_ENV_VARS.includes(varName) &&
						!varName.startsWith("REPLIT_") &&
						!varName.startsWith("REPL_")
					) {
						envVars.push(varName);
					}
				}
			}
			break; // Only read the first env file found
		}
	}

	return envVars;
}

async function runMigration(
	sourceDir: string,
	targetDir: string,
	options: MigrateOptions,
): Promise<void> {
	const result: MigrationResult = {
		routesConverted: 0,
		routesNeedingReview: [],
		pagesConverted: 0,
		componentsCopied: 0,
		componentsFlagged: [],
		filesWritten: [],
		warnings: [],
	};

	// Phase 1: Analyze source
	const manifest = await withSpinner("Analyzing source application", async () =>
		analyzeSource(sourceDir),
	);

	log.info(`Found ${manifest.routes.length} API routes`);
	log.info(`Found ${manifest.pages.length} pages`);
	log.info(
		`Found ${manifest.components.length + manifest.uiComponents.length} components`,
	);

	if (manifest.replitConfig) {
		log.info(
			`Replit integrations: ${manifest.replitConfig.integrations.join(", ")}`,
		);
	}

	if (manifest.warnings.length > 0) {
		for (const w of manifest.warnings) {
			log.warn(`  ${w}`);
		}
	}

	// Dry run: only show analysis and exit
	if (options.dryRun) {
		log.info("\n--- Dry Run Summary ---");
		log.info(`App name: ${manifest.appName}`);
		log.info(`Routes to convert: ${manifest.routes.length}`);
		log.info(`Pages to convert: ${manifest.pages.length}`);
		log.info(
			`Components to copy: ${manifest.components.length + manifest.uiComponents.length}`,
		);
		log.info(`Hooks to copy: ${manifest.hooks.length}`);
		log.info(`Lib files to copy: ${manifest.libFiles.length}`);
		log.info(`Schema: ${manifest.schemaFile ? "found" : "not found"}`);
		log.info(`Storage layer: ${manifest.storageFile ? "found" : "not found"}`);
		log.info(`Migration files: ${manifest.migrationFiles.length}`);
		log.info(`Replit deps to remove: ${manifest.replitDependencies.length}`);
		log.info(`Server deps to remove: ${manifest.serverDependencies.length}`);
		return;
	}

	// Create target directory
	await ensureDir(targetDir);

	// Phase 2a: Schema conversion
	await withSpinner("Converting database schema", async () => {
		await convertSchema(manifest, targetDir, result, options.db);
	});

	// Phase 2b: Route conversion
	await withSpinner("Converting API routes", async () => {
		await convertRoutes(manifest, targetDir, result);
	});

	// Phase 2c: Page conversion
	await withSpinner("Converting pages", async () => {
		await convertPages(manifest, targetDir, result, options.auth);
	});

	// Phase 2d: Component migration
	await withSpinner("Copying components, hooks, and utilities", async () => {
		await copyComponents(manifest, targetDir, result);
	});

	// Phase 2e: Auth conversion
	await withSpinner(`Setting up ${options.auth} authentication`, async () => {
		await convertAuth(manifest, targetDir, options.auth, result);
	});

	// Phase 3: Scaffolding - config files
	await withSpinner("Writing configuration files", async () => {
		// Package.json with merged dependencies
		await writeFile(
			path.join(targetDir, "package.json"),
			generateMigratePackageJson(manifest.appName, {
				auth: options.auth,
				db: options.db,
				sourceDeps: manifest.dependencies,
				sourceDevDeps: manifest.devDependencies,
				replitDeps: manifest.replitDependencies,
				serverDeps: manifest.serverDependencies,
			}),
		);
		result.filesWritten.push("package.json");

		// Standard config files
		await writeFile(path.join(targetDir, "biome.json"), generateBiomeJson());
		result.filesWritten.push("biome.json");

		await writeFile(path.join(targetDir, ".gitignore"), generateGitignore());
		result.filesWritten.push(".gitignore");

		await writeFile(path.join(targetDir, "tsconfig.json"), generateTsConfig());
		result.filesWritten.push("tsconfig.json");

		await writeFile(
			path.join(targetDir, "next.config.ts"),
			generateNextConfig(),
		);
		result.filesWritten.push("next.config.ts");

		await writeFile(
			path.join(targetDir, "postcss.config.mjs"),
			generatePostcssConfig(),
		);
		result.filesWritten.push("postcss.config.mjs");
	});

	// Database-specific config files
	if (options.db === "supabase") {
		await withSpinner("Setting up Supabase configuration", async () => {
			await ensureDir(path.join(targetDir, "supabase"));
			await writeFile(
				path.join(targetDir, "supabase", "config.toml"),
				generateSupabaseConfig(manifest.appName),
			);
			result.filesWritten.push("supabase/config.toml");

			await writeFile(
				path.join(targetDir, "supabase", "seed.sql"),
				generateSupabaseSeed(),
			);
			result.filesWritten.push("supabase/seed.sql");

			await ensureDir(path.join(targetDir, "scripts"));
			await writeFile(
				path.join(targetDir, "scripts", "supabase-start"),
				generateSupabaseStartScript(),
			);
			const { chmod } = await import("node:fs/promises");
			await chmod(path.join(targetDir, "scripts", "supabase-start"), 0o755);
			result.filesWritten.push("scripts/supabase-start");
		});
	} else {
		await withSpinner("Setting up PostgreSQL configuration", async () => {
			await writeFile(
				path.join(targetDir, "docker-compose.yml"),
				generateDockerCompose(manifest.appName),
			);
			result.filesWritten.push("docker-compose.yml");
		});
	}

	// App layout and providers
	await withSpinner("Writing app layout files", async () => {
		await ensureDir(path.join(targetDir, "app"));

		await writeFile(
			path.join(targetDir, "app", "layout.tsx"),
			generateMigrateRootLayout(manifest.appName),
		);
		result.filesWritten.push("app/layout.tsx");

		await writeFile(
			path.join(targetDir, "app", "providers.tsx"),
			generateMigrateProviders(),
		);
		result.filesWritten.push("app/providers.tsx");

		// Copy globals.css from source if it exists, otherwise generate
		const sourceGlobalsCss = path.join(
			manifest.sourceDir,
			"client",
			"src",
			"index.css",
		);
		if (await fileExists(sourceGlobalsCss)) {
			const { readFile } = await import("../utils/index.js");
			let cssContent = await readFile(sourceGlobalsCss);
			// Ensure Tailwind import is present
			if (
				!cssContent.includes("@import") ||
				!cssContent.includes("tailwindcss")
			) {
				cssContent = `@import "tailwindcss";\n\n${cssContent}`;
			}
			await writeFile(path.join(targetDir, "app", "globals.css"), cssContent);
		} else {
			await writeFile(
				path.join(targetDir, "app", "globals.css"),
				generateGlobalsCss(),
			);
		}
		result.filesWritten.push("app/globals.css");

		// Generate the query client in lib/
		await ensureDir(path.join(targetDir, "lib"));
		await writeFile(
			path.join(targetDir, "lib", "queryClient.ts"),
			generateMigrateQueryClient(),
		);
		result.filesWritten.push("lib/queryClient.ts");
	});

	// Copy logo assets
	await withSpinner("Creating assets", async () => {
		await ensureDir(path.join(targetDir, "public"));
		try {
			const logoSrc = getAssetPath("forge-logo.png");
			await copyFile(logoSrc, path.join(targetDir, "public", "forge-logo.png"));
			result.filesWritten.push("public/forge-logo.png");
		} catch {
			// Logo asset not found - non-critical
		}
	});

	// Environment files
	await withSpinner("Creating environment files", async () => {
		const extraVars = await extractSourceEnvVars(manifest.sourceDir);

		const envContent = generateMigrateEnvExample({
			appName: manifest.appName,
			auth: options.auth,
			db: options.db,
			extraVars,
		});

		await writeFile(path.join(targetDir, ".env.example"), envContent);
		result.filesWritten.push(".env.example");

		await writeFile(path.join(targetDir, ".env.local"), envContent);
		result.filesWritten.push(".env.local");
	});

	// Generate migration report
	await withSpinner("Generating migration report", async () => {
		await generateReport(manifest, options, targetDir, result);
	});

	// Install dependencies
	await withSpinner(
		"Installing dependencies (this may take a moment)",
		async () => {
			await pnpmInstall(targetDir);
		},
	);

	// Initialize git
	const gitDir = path.join(targetDir, ".git");
	const isGitRepo = await fileExists(gitDir);

	if (!isGitRepo) {
		await withSpinner("Initializing git repository", async () => {
			await gitInit(targetDir);
			await gitAdd(targetDir, ".");
			await gitCommit(
				"Initial commit - Migrated from Replit by forge",
				targetDir,
			);
		});
	}

	// Final summary
	log.success("\n✨ Migration complete!");
	log.info(`  Source: ${sourceDir}`);
	log.info(`  Target: ${targetDir}`);
	log.info(`  Routes converted: ${result.routesConverted}`);
	log.info(`  Pages converted: ${result.pagesConverted}`);
	log.info(`  Components copied: ${result.componentsCopied}`);
	log.info(`  Files written: ${result.filesWritten.length}`);

	if (result.routesNeedingReview.length > 0) {
		log.warn(
			`\n  ⚠ ${result.routesNeedingReview.length} routes need manual review`,
		);
	}
	if (result.componentsFlagged.length > 0) {
		log.warn(
			`  ⚠ ${result.componentsFlagged.length} components flagged for Replit-specific code`,
		);
	}

	log.info("\n  See MIGRATION_REPORT.md for full details.");
	log.info("\nNext steps:");
	log.step(`  cd ${path.relative(process.cwd(), targetDir)}`);
	log.step("  # Review and configure .env.local");

	if (options.db === "supabase") {
		log.step("  supabase start");
	} else {
		log.step("  docker compose up -d");
	}

	log.step("  pnpm db:push");
	log.step("  pnpm dev");
}

export const migrateCommand = new Command("migrate")
	.description("Migrate a Replit express-vite-react app to Next.js")
	.argument("<source-dir>", "Path to the source Replit application")
	.argument("<target-dir>", "Path for the new Next.js application")
	.option(
		"--db <type>",
		"Target database type: supabase or postgres",
		"supabase",
	)
	.option("--auth <type>", "Authentication type: workos, demo, or none", "demo")
	.option(
		"--dry-run",
		"Analyze source and print report without creating files",
		false,
	)
	.option("--verbose", "Show detailed conversion output", false)
	.action(
		async (
			sourceDirArg: string,
			targetDirArg: string,
			options: { db: string; auth: string; dryRun: boolean; verbose: boolean },
		) => {
			// Validate auth option
			if (!["workos", "demo", "none"].includes(options.auth)) {
				log.error(
					`Invalid auth type: ${options.auth}. Use 'workos', 'demo', or 'none'.`,
				);
				process.exit(1);
			}

			// Validate db option
			if (!["postgres", "supabase"].includes(options.db)) {
				log.error(
					`Invalid db type: ${options.db}. Use 'postgres' or 'supabase'.`,
				);
				process.exit(1);
			}

			const sourceDir = path.resolve(process.cwd(), sourceDirArg);
			const targetDir = path.resolve(process.cwd(), targetDirArg);

			// Verify source exists
			if (!(await fileExists(sourceDir))) {
				log.error(`Source directory does not exist: ${sourceDir}`);
				process.exit(1);
			}

			// Check target doesn't already exist (unless dry-run)
			if (!options.dryRun && (await fileExists(targetDir))) {
				log.error(`Target directory already exists: ${targetDir}`);
				process.exit(1);
			}

			log.info("Migrating Replit app to Next.js");
			log.info(`  Source: ${sourceDir}`);
			log.info(`  Target: ${targetDir}`);
			log.info(`  Database: ${options.db}`);
			log.info(`  Auth: ${options.auth}`);

			if (options.dryRun) {
				log.info("  Mode: DRY RUN (no files will be created)");
			}

			log.blank();

			await runMigration(sourceDir, targetDir, {
				db: options.db as DbType,
				auth: options.auth as AuthType,
				dryRun: options.dryRun,
				verbose: options.verbose,
			});
		},
	);
