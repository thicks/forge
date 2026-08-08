import crypto from "node:crypto";
import path from "node:path";
import { Command } from "commander";
import prompts from "prompts";
import {
	generateClaudeMd,
	generateClaudeSettingsJson,
	generateCursorProjectContextRule,
	generateCursorSettingsJson,
	generateDbSchema,
	generateDevLoginForm,
	generateDockerComposeWithSeed,
	generateDrizzleConfig,
	generateLoginApiRoute,
	generatePostgresClient,
	generatePostgresRestoreScript,
	generateSupabaseBrowserClient,
	generateSupabaseConfig,
	generateSupabaseMiddlewareClient,
	generateSupabaseSeed,
	generateSupabaseServerClient,
	generateSupabaseStartScript,
	generateForgeRecommendationsMd,
	generateWorkosCallbackRoute,
	generateWorkosLayoutTsx,
	generateWorkosLoginPage,
	generateWorkosMiddleware,
} from "../templates/index.js";
import {
	copyAsset,
	ensureDocker,
	ensurePostgresClient,
	ensureSupabaseCLI,
	ensureVercelCLI,
	execCommand,
	fileExists,
	getAssetPath,
	installSkills,
	loadSkillManifest,
	log,
	pnpmAdd,
	readFile,
	resolveSkills,
	setExecutable,
	withSpinner,
	writeFile,
} from "../utils/index.js";
import { setupGit } from "./setup-git.js";
import { setupSupabase } from "./setup-supabase.js";
import { setupVercel } from "./setup-vercel.js";

type DbType = "postgres" | "supabase";
type AuthType = "workos" | "simple" | "better-auth";

interface UpdateOptions {
	db?: DbType;
	/** Provision a Supabase cloud project (implies --db supabase) */
	supabase?: boolean;
	github?: boolean;
	vercel?: boolean;
	auth?: AuthType;
	ai?: boolean;
	/** Path to a custom skills.json manifest (default: built-in) */
	aiSkills?: string;
}

interface ExistingDbConfig {
	type: DbType | null;
}

async function hasVercelProjectLink(cwd: string): Promise<boolean> {
	return await fileExists(path.join(cwd, ".vercel", "project.json"));
}

async function appendEnvVars(
	filePath: string,
	vars: Record<string, string>,
): Promise<void> {
	const hasFile = await fileExists(filePath);
	const content = hasFile ? await readFile(filePath) : "";
	const existingKeys = new Set<string>();

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const equalIndex = trimmed.indexOf("=");
		if (equalIndex <= 0) {
			continue;
		}
		existingKeys.add(trimmed.slice(0, equalIndex));
	}

	const missingEntries = Object.entries(vars).filter(
		([key]) => !existingKeys.has(key),
	);

	if (missingEntries.length === 0) {
		return;
	}

	let nextContent = content;
	if (nextContent.length > 0 && !nextContent.endsWith("\n")) {
		nextContent += "\n";
	}

	for (const [key, value] of missingEntries) {
		nextContent += `${key}=${value}\n`;
	}

	await writeFile(filePath, nextContent);
}

/** Set or replace KEY=value lines for the given keys (used after `vercel env pull`). */
async function upsertEnvVars(
	filePath: string,
	vars: Record<string, string>,
): Promise<void> {
	const hasFile = await fileExists(filePath);
	const content = hasFile ? await readFile(filePath) : "";
	const lines = content.split("\n");
	const keysToUpsert = new Set(Object.keys(vars));
	const written = new Set<string>();
	const out: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			out.push(line);
			continue;
		}
		const equalIndex = trimmed.indexOf("=");
		if (equalIndex <= 0) {
			out.push(line);
			continue;
		}
		const key = trimmed.slice(0, equalIndex);
		if (keysToUpsert.has(key)) {
			out.push(`${key}=${vars[key]}`);
			written.add(key);
		} else {
			out.push(line);
		}
	}

	for (const [key, value] of Object.entries(vars)) {
		if (!written.has(key)) {
			if (out.length > 0 && out[out.length - 1] !== "") {
				out.push("");
			}
			out.push(`${key}=${value}`);
		}
	}

	await writeFile(filePath, out.join("\n"));
}

async function copyAssetIfMissing(
	assetName: string,
	destPath: string,
	skipMessage: string,
): Promise<void> {
	if (await fileExists(destPath)) {
		log.info(skipMessage);
		return;
	}
	await copyAsset(assetName, destPath);
}

async function detectExistingDbConfig(cwd: string): Promise<ExistingDbConfig> {
	const drizzlePath = path.join(cwd, "drizzle.config.ts");
	if (!(await fileExists(drizzlePath))) {
		return { type: null };
	}

	try {
		const configContent = await readFile(drizzlePath);

		// Keep compatibility with older and newer config styles.
		if (
			configContent.includes("./supabase/migrations") ||
			configContent.includes("NEXT_PUBLIC_SUPABASE_URL")
		) {
			return { type: "supabase" };
		}
		if (
			configContent.includes("./drizzle/migrations") ||
			configContent.includes("DATABASE_URL")
		) {
			return { type: "postgres" };
		}
	} catch {
		// Fall through to unknown when the config cannot be parsed.
	}

	return { type: null };
}

async function writeIfMissing(
	filePath: string,
	content: string,
	skipMessage: string,
): Promise<void> {
	if (await fileExists(filePath)) {
		log.info(skipMessage);
		return;
	}
	await writeFile(filePath, content);
}

// Writes content only when the file is missing or its content differs from the source.
async function writeIfChanged(
	filePath: string,
	content: string,
): Promise<void> {
	if (await fileExists(filePath)) {
		const existing = await readFile(filePath);
		if (existing === content) {
			log.info(`Skipping ${path.basename(filePath)} (unchanged).`);
			return;
		}
		log.info(`Updating ${path.basename(filePath)} (changed).`);
	}
	await writeFile(filePath, content);
}

// Copies an asset only when the destination is missing or its content differs from the asset.
// Used for non-skill assets (Cursor rules, etc.) that aren't managed by the skills manifest.
async function copyAssetIfChanged(
	assetName: string,
	destPath: string,
): Promise<void> {
	const srcContent = await readFile(getAssetPath(assetName));
	if (await fileExists(destPath)) {
		const existing = await readFile(destPath);
		if (existing === srcContent) {
			log.info(`Skipping ${path.basename(destPath)} (unchanged).`);
			return;
		}
		log.info(`Updating ${path.basename(destPath)} (changed).`);
	}
	await copyAsset(assetName, destPath);
}

async function detectMonorepo(cwd: string): Promise<boolean> {
	const workspaceFile = path.join(cwd, "pnpm-workspace.yaml");
	const appsDir = path.join(cwd, "apps");
	return (await fileExists(workspaceFile)) && (await fileExists(appsDir));
}

async function detectWorkOS(
	cwd: string,
	isMonorepo: boolean,
): Promise<boolean> {
	const packageJsonPath = path.join(cwd, "package.json");
	if (await fileExists(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(await readFile(packageJsonPath));
			if (packageJson?.dependencies?.["@workos-inc/authkit-nextjs"]) {
				return true;
			}
		} catch {
			// ignore parse failures and continue checks
		}
	}

	if (!isMonorepo) {
		return false;
	}

	const appsDir = path.join(cwd, "apps");
	if (!(await fileExists(appsDir))) {
		return false;
	}

	const fs = await import("node:fs/promises");
	const entries = await fs.readdir(appsDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const appPackagePath = path.join(appsDir, entry.name, "package.json");
		if (!(await fileExists(appPackagePath))) continue;
		try {
			const appPackage = JSON.parse(await readFile(appPackagePath));
			if (appPackage?.dependencies?.["@workos-inc/authkit-nextjs"]) {
				return true;
			}
		} catch {
			// keep scanning
		}
	}

	return false;
}

/**
 * Detect the project's auth type so skill resolution matches `forge new`.
 * Checks WorkOS and Better Auth via dependencies, then the simple-auth
 * session cookie marker in middleware.
 */
async function detectAuthType(
	cwd: string,
	isMonorepo: boolean,
): Promise<AuthType | undefined> {
	if (await detectWorkOS(cwd, isMonorepo)) {
		return "workos";
	}

	const packageJsonDirs = [cwd];
	if (isMonorepo) {
		const appsDir = path.join(cwd, "apps");
		if (await fileExists(appsDir)) {
			const fs = await import("node:fs/promises");
			const entries = await fs.readdir(appsDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					packageJsonDirs.push(path.join(appsDir, entry.name));
				}
			}
		}
	}

	for (const dir of packageJsonDirs) {
		const packageJsonPath = path.join(dir, "package.json");
		if (!(await fileExists(packageJsonPath))) continue;
		try {
			const packageJson = JSON.parse(await readFile(packageJsonPath));
			if (packageJson?.dependencies?.["better-auth"]) {
				return "better-auth";
			}
		} catch {
			// ignore parse failures and continue checks
		}

		const middlewarePath = path.join(dir, "middleware.ts");
		if (await fileExists(middlewarePath)) {
			const middlewareContent = await readFile(middlewarePath);
			if (middlewareContent.includes("simple_session")) {
				return "simple";
			}
		}
	}

	return undefined;
}

async function detectHasDatabase(cwd: string): Promise<boolean> {
	const detectedDb = await detectExistingDbConfig(cwd);
	if (detectedDb.type) {
		return true;
	}

	return (
		(await fileExists(path.join(cwd, "db", "schema.ts"))) ||
		(await fileExists(path.join(cwd, "drizzle.config.ts")))
	);
}

async function updateAiScaffold(
	cwd: string,
	projectName: string,
	options: UpdateOptions,
): Promise<void> {
	const isMonorepo = await detectMonorepo(cwd);
	const useWorkOS = await detectWorkOS(cwd, isMonorepo);
	const hasDatabase = options.db ? true : await detectHasDatabase(cwd);

	await withSpinner("Updating AI core files", async () => {
		await writeIfChanged(
			path.join(cwd, "CLAUDE.md"),
			generateClaudeMd(projectName, useWorkOS, isMonorepo, hasDatabase),
		);
		await writeIfChanged(
			path.join(cwd, ".claude", "settings.json"),
			generateClaudeSettingsJson(),
		);
		await writeIfChanged(
			path.join(cwd, ".cursor", "settings.json"),
			generateCursorSettingsJson(),
		);
	});

	await withSpinner("Updating Cursor rules", async () => {
		// Dynamic rule (depends on isMonorepo and hasDatabase)
		await writeIfChanged(
			path.join(cwd, ".cursor", "rules", "project-context.mdc"),
			generateCursorProjectContextRule(isMonorepo, hasDatabase),
		);
		// Static rules copied from assets
		await copyAssetIfChanged(
			"cursor/rules/typescript-standards.mdc",
			path.join(cwd, ".cursor", "rules", "typescript-standards.mdc"),
		);
		await copyAssetIfChanged(
			"cursor/rules/testing.mdc",
			path.join(cwd, ".cursor", "rules", "testing.mdc"),
		);
		await copyAssetIfChanged(
			"cursor/rules/git-workflow.mdc",
			path.join(cwd, ".cursor", "rules", "git-workflow.mdc"),
		);
		await copyAssetIfChanged(
			"cursor/rules/comment-style.mdc",
			path.join(cwd, ".cursor", "rules", "comment-style.mdc"),
		);
	});

	await withSpinner("Updating Claude skills", async () => {
		const manifest = await loadSkillManifest(options.aiSkills);
		const skills = resolveSkills(manifest, {
			db: hasDatabase ? "postgres" : undefined,
			auth: await detectAuthType(cwd, isMonorepo),
		});
		await installSkills(skills, cwd, "update");
	});

	await withSpinner("Updating AI recommendations doc", async () => {
		await writeIfChanged(
			path.join(cwd, "FORGE_RECOMMENDATIONS.md"),
			generateForgeRecommendationsMd(),
		);
	});

	log.success("AI scaffold up to date.");
}

async function configurePostgres(
	cwd: string,
	projectName: string,
	overwriteExistingConfig: boolean,
): Promise<void> {
	await withSpinner("Installing postgres database packages", async () => {
		await pnpmAdd(["drizzle-orm", "postgres"], cwd);
		await pnpmAdd(["drizzle-kit"], cwd, true);
	});

	await withSpinner("Writing postgres configuration files", async () => {
		await writeFile(
			path.join(cwd, "drizzle.config.ts"),
			generateDrizzleConfig("postgres"),
		);

		await writeIfMissing(
			path.join(cwd, "docker-compose.yml"),
			generateDockerComposeWithSeed(projectName),
			"Skipping docker-compose.yml (already exists).",
		);

		await writeIfMissing(
			path.join(cwd, "db-data", "restore.sh"),
			generatePostgresRestoreScript(),
			"Skipping db-data/restore.sh (already exists).",
		);
		if (await fileExists(path.join(cwd, "db-data", "restore.sh"))) {
			await setExecutable(path.join(cwd, "db-data", "restore.sh"));
		}

		await writeIfMissing(
			path.join(cwd, "db", "schema.ts"),
			generateDbSchema(),
			"Skipping db/schema.ts (already exists).",
		);

		const postgresClientPath = path.join(cwd, "db", "index.ts");
		if (!overwriteExistingConfig) {
			await writeIfMissing(
				postgresClientPath,
				generatePostgresClient(),
				"Skipping db/index.ts (already exists).",
			);
		} else {
			await writeFile(postgresClientPath, generatePostgresClient());
		}
	});

	const postgresEnvVars = {
		DATABASE_URL: `postgresql://postgres:postgres@localhost:5400/${projectName}`,
	};

	await withSpinner("Appending postgres environment variables", async () => {
		await appendEnvVars(path.join(cwd, ".env.local"), postgresEnvVars);
		await appendEnvVars(path.join(cwd, ".env.example"), postgresEnvVars);
	});

	await withSpinner("Adding db-migrate Claude skill", async () => {
		await copyAssetIfMissing(
			"claude/skills/db-migrate/SKILL.md",
			path.join(cwd, ".claude", "skills", "db-migrate", "SKILL.md"),
			"Skipping db-migrate skill (already exists).",
		);
	});

	log.success("Postgres database configuration updated.");
	log.info("Next steps:");
	log.step("  docker compose up -d");
	log.step("  pnpm db:push");
	log.step(
		"  Optional: place a dump file at db-data/dump.backup for first-run seed restore",
	);
}

async function configureSupabase(
	cwd: string,
	projectName: string,
	overwriteExistingConfig: boolean,
): Promise<void> {
	await withSpinner("Installing supabase database packages", async () => {
		await pnpmAdd(
			["@supabase/supabase-js", "@supabase/ssr", "drizzle-orm"],
			cwd,
		);
		await pnpmAdd(["drizzle-kit", "supabase"], cwd, true);
	});

	await withSpinner("Writing supabase configuration files", async () => {
		await writeFile(
			path.join(cwd, "drizzle.config.ts"),
			generateDrizzleConfig("supabase"),
		);

		const supabaseConfigPath = path.join(cwd, "supabase", "config.toml");
		if (!(await fileExists(supabaseConfigPath))) {
			try {
				await execCommand("supabase", ["init"], { cwd });
			} catch {
				log.warn("Supabase CLI init failed. Falling back to template config.");
				await writeFile(
					supabaseConfigPath,
					generateSupabaseConfig(projectName),
				);
			}
		} else {
			log.info("Skipping supabase/config.toml (already exists).");
		}

		await writeIfMissing(
			path.join(cwd, "supabase", "seed.sql"),
			generateSupabaseSeed(),
			"Skipping supabase/seed.sql (already exists).",
		);

		await writeIfMissing(
			path.join(cwd, "db", "schema.ts"),
			generateDbSchema(),
			"Skipping db/schema.ts (already exists).",
		);

		const supabaseClientPath = path.join(cwd, "db", "client.ts");
		const supabaseServerPath = path.join(cwd, "db", "server.ts");
		const supabaseMiddlewarePath = path.join(cwd, "db", "middleware.ts");

		if (!overwriteExistingConfig) {
			await writeIfMissing(
				supabaseClientPath,
				generateSupabaseBrowserClient(),
				"Skipping db/client.ts (already exists).",
			);
			await writeIfMissing(
				supabaseServerPath,
				generateSupabaseServerClient(),
				"Skipping db/server.ts (already exists).",
			);
			await writeIfMissing(
				supabaseMiddlewarePath,
				generateSupabaseMiddlewareClient(),
				"Skipping db/middleware.ts (already exists).",
			);
		} else {
			await writeFile(supabaseClientPath, generateSupabaseBrowserClient());
			await writeFile(supabaseServerPath, generateSupabaseServerClient());
			await writeFile(
				supabaseMiddlewarePath,
				generateSupabaseMiddlewareClient(),
			);
		}
	});

	const supabaseEnvVars = {
		NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
		NEXT_PUBLIC_SUPABASE_ANON_KEY: "<placeholder>",
		SUPABASE_SERVICE_ROLE_KEY: "<placeholder>",
		DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
	};

	await withSpinner("Appending supabase environment variables", async () => {
		await appendEnvVars(path.join(cwd, ".env.local"), supabaseEnvVars);
		await appendEnvVars(path.join(cwd, ".env.example"), supabaseEnvVars);
	});

	await withSpinner("Adding db-migrate Claude skill", async () => {
		await copyAssetIfMissing(
			"claude/skills/db-migrate/SKILL.md",
			path.join(cwd, ".claude", "skills", "db-migrate", "SKILL.md"),
			"Skipping db-migrate skill (already exists).",
		);
	});

	log.success("Supabase database configuration updated.");
	log.info("Next steps:");
	log.step("  supabase start");
	log.step("  pnpm db:push");
	log.step("  Copy anon/service keys from Supabase CLI output into .env.local");
}

/** Scripts merged additively when re-running `forge update --db supabase` on an existing project. */
const SUPABASE_PACKAGE_JSON_SCRIPTS: Record<string, string> = {
	"db:generate": "drizzle-kit generate",
	"db:migrate": "drizzle-kit migrate",
	"db:push": "drizzle-kit push",
	"db:studio": "drizzle-kit studio",
	"supabase:start": "./scripts/supabase-start",
	"supabase:stop": "supabase stop",
};

async function mergeSupabaseScriptsIntoPackageJson(cwd: string): Promise<void> {
	const packageJsonPath = path.join(cwd, "package.json");
	const raw = await readFile(packageJsonPath);
	const pkg = JSON.parse(raw) as {
		scripts?: Record<string, string>;
		[key: string]: unknown;
	};
	const scripts = { ...(pkg.scripts ?? {}) };
	let changed = false;
	for (const [key, value] of Object.entries(SUPABASE_PACKAGE_JSON_SCRIPTS)) {
		if (scripts[key] === undefined) {
			scripts[key] = value;
			changed = true;
		}
	}
	if (scripts.dev === undefined) {
		scripts.dev = "pnpm supabase:start && next dev";
		changed = true;
	}
	if (!changed) {
		return;
	}
	pkg.scripts = scripts;
	await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, "\t")}\n`);
}

/**
 * Additive refresh for projects already on Supabase: install any missing packages,
 * merge expected scripts, append missing env keys, ensure supabase-start helper exists.
 */
async function reconcileSupabaseConfig(cwd: string): Promise<void> {
	await withSpinner("Reconciling Supabase packages", async () => {
		await pnpmAdd(
			["@supabase/supabase-js", "@supabase/ssr", "drizzle-orm"],
			cwd,
		);
		await pnpmAdd(["drizzle-kit", "supabase"], cwd, true);
	});

	await withSpinner("Reconciling package.json scripts", async () => {
		await mergeSupabaseScriptsIntoPackageJson(cwd);
	});

	const supabaseStartPath = path.join(cwd, "scripts", "supabase-start");
	await withSpinner("Ensuring supabase start script", async () => {
		await writeIfMissing(
			supabaseStartPath,
			generateSupabaseStartScript(),
			"Skipping scripts/supabase-start (already exists).",
		);
		if (await fileExists(supabaseStartPath)) {
			await setExecutable(supabaseStartPath);
		}
	});

	const supabaseEnvVars = {
		NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
		NEXT_PUBLIC_SUPABASE_ANON_KEY: "<placeholder>",
		SUPABASE_SERVICE_ROLE_KEY: "<placeholder>",
		DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
	};

	await withSpinner(
		"Appending missing supabase environment variables",
		async () => {
			await appendEnvVars(path.join(cwd, ".env.local"), supabaseEnvVars);
			await appendEnvVars(path.join(cwd, ".env.example"), supabaseEnvVars);
		},
	);

	await withSpinner("Adding db-migrate Claude skill", async () => {
		await copyAssetIfMissing(
			"claude/skills/db-migrate/SKILL.md",
			path.join(cwd, ".claude", "skills", "db-migrate", "SKILL.md"),
			"Skipping db-migrate skill (already exists).",
		);
	});

	log.success("Supabase configuration reconciled.");
	log.info("Next steps:");
	log.step("  supabase start");
	log.step("  pnpm db:push");
	log.step("  Copy anon/service keys from Supabase CLI output into .env.local");

	if (await hasVercelProjectLink(cwd)) {
		log.info(
			`To set a hosted DATABASE_URL in Vercel, run: forge update ${path.relative(process.cwd(), cwd) || "."} --vercel --db supabase`,
		);
	}
}

async function resolveVercelDatabaseContext(
	db?: DbType,
): Promise<DbType | undefined> {
	if (db) {
		return db;
	}

	const { selectedDb } = await prompts({
		type: "select",
		name: "selectedDb",
		message: "Select database context for Vercel configuration:",
		choices: [
			{ title: "None", value: "none" },
			{ title: "Postgres", value: "postgres" },
			{ title: "Supabase", value: "supabase" },
		],
		initial: 0,
	});

	if (selectedDb === "postgres" || selectedDb === "supabase") {
		return selectedDb;
	}
	return undefined;
}

/** True when AuthKit dependency and WorkOS middleware are both present at cwd. */
async function detectExistingWorkOS(cwd: string): Promise<boolean> {
	const packageJsonPath = path.join(cwd, "package.json");
	let hasAuthkit = false;
	if (await fileExists(packageJsonPath)) {
		try {
			const pkg = JSON.parse(await readFile(packageJsonPath));
			if (pkg?.dependencies?.["@workos-inc/authkit-nextjs"]) {
				hasAuthkit = true;
			}
		} catch {
			// ignore parse errors
		}
	}
	if (!hasAuthkit) {
		return false;
	}

	const middlewarePath = path.join(cwd, "middleware.ts");
	if (!(await fileExists(middlewarePath))) {
		return false;
	}
	try {
		const middlewareContent = await readFile(middlewarePath);
		return (
			middlewareContent.includes("@workos-inc/authkit-nextjs") ||
			middlewareContent.includes("authkitMiddleware")
		);
	} catch {
		return false;
	}
}

/**
 * Scaffolds WorkOS AuthKit into an existing app: prompts for application-level
 * credentials, installs the package, writes routes/middleware, appends env files.
 * Does not read or write ~/.forge.json.
 *
 * @returns Env vars to re-apply to `.env.local` after `vercel env pull` when combined with `--vercel`, or null if skipped / incomplete.
 */
async function updateWorkosAuthScaffold(
	cwd: string,
	projectName: string,
): Promise<Record<string, string> | null> {
	if (await detectExistingWorkOS(cwd)) {
		log.success("WorkOS AuthKit already configured. Nothing to do.");
		return null;
	}

	const clientResponse = await prompts({
		type: "text",
		name: "clientId",
		message:
			"Enter your WorkOS Application client ID (WORKOS_CLIENT_ID) for this app:",
		validate: (value: string) =>
			value.trim().length > 0 || "Client ID is required",
	});

	const apiKeyResponse = await prompts({
		type: "password",
		name: "apiKey",
		message:
			"Enter your WorkOS Application API key (WORKOS_API_KEY) for this app:",
		validate: (value: string) =>
			value.trim().length > 0 || "API key is required",
	});

	const clientId = clientResponse.clientId?.trim();
	const apiKey = apiKeyResponse.apiKey?.trim();
	if (!clientId || !apiKey) {
		log.warn("Skipped WorkOS scaffolding: credentials are required.");
		return null;
	}

	const cookiePassword = crypto.randomBytes(32).toString("base64");
	const redirectUri = "http://localhost:3000/callback";

	const localEnv: Record<string, string> = {
		WORKOS_CLIENT_ID: clientId,
		WORKOS_API_KEY: apiKey,
		WORKOS_COOKIE_PASSWORD: cookiePassword,
		NEXT_PUBLIC_WORKOS_REDIRECT_URI: redirectUri,
	};

	await withSpinner("Installing WorkOS AuthKit", async () => {
		await pnpmAdd(["@workos-inc/authkit-nextjs"], cwd);
	});

	await withSpinner("Writing WorkOS auth files", async () => {
		await writeIfMissing(
			path.join(cwd, "middleware.ts"),
			generateWorkosMiddleware(projectName),
			"Skipping middleware.ts (already exists).",
		);
		await writeIfMissing(
			path.join(cwd, "app", "callback", "route.ts"),
			generateWorkosCallbackRoute(),
			"Skipping app/callback/route.ts (already exists).",
		);
		await writeIfMissing(
			path.join(cwd, "app", "login", "page.tsx"),
			generateWorkosLoginPage(projectName),
			"Skipping app/login/page.tsx (already exists).",
		);
		await writeIfMissing(
			path.join(cwd, "app", "login", "dev-login-form.tsx"),
			generateDevLoginForm(projectName),
			"Skipping app/login/dev-login-form.tsx (already exists).",
		);
		await writeIfMissing(
			path.join(cwd, "app", "api", "auth", "login", "route.ts"),
			generateLoginApiRoute(projectName),
			"Skipping app/api/auth/login/route.ts (already exists).",
		);
		const layoutPath = path.join(cwd, "app", "layout.tsx");
		await writeIfMissing(
			layoutPath,
			generateWorkosLayoutTsx(projectName),
			"Skipping app/layout.tsx (already exists).",
		);
	});

	await withSpinner("Appending WorkOS environment variables", async () => {
		await appendEnvVars(path.join(cwd, ".env.local"), localEnv);
		await appendEnvVars(path.join(cwd, ".env.example"), {
			WORKOS_CLIENT_ID: "<your-workos-client-id>",
			WORKOS_COOKIE_PASSWORD: "<generate-a-32-byte-base64-key>",
			NEXT_PUBLIC_WORKOS_REDIRECT_URI: redirectUri,
		});
	});

	log.success("WorkOS authentication scaffolded.");
	log.info("Next steps:");
	log.step("  pnpm dev");

	return localEnv;
}

export async function update(
	cwd: string,
	projectName: string,
	options: UpdateOptions,
): Promise<void> {
	// --ai-skills implies --ai
	if (options.aiSkills) {
		options.ai = true;
	}
	const hasAiUpdate = !!options.ai;
	const hasStandaloneAuthWorkos = options.auth === "workos";

	if (
		!options.db &&
		!options.supabase &&
		!options.github &&
		!options.vercel &&
		!hasAiUpdate &&
		!hasStandaloneAuthWorkos
	) {
		log.warn(
			"No update option selected. Use --db, --supabase, --github, --vercel, --ai, or --auth workos.",
		);
		return;
	}

	const packageJsonPath = path.join(cwd, "package.json");
	if (!(await fileExists(packageJsonPath))) {
		log.error(
			"This directory does not look like a forge project. Create one with 'forge new'.",
		);
		process.exit(1);
	}

	if (options.db) {
		if (options.db === "postgres") {
			await withSpinner("Preparing PostgreSQL local tooling", async () => {
				await ensureDocker();
				await ensurePostgresClient();
			});
		} else {
			await withSpinner("Preparing Supabase local tooling", async () => {
				await ensureSupabaseCLI();
				await ensurePostgresClient();
			});
		}

		const existingDb = await detectExistingDbConfig(cwd);
		let overwriteExistingConfig = false;

		if (existingDb.type === options.db) {
			if (options.db === "supabase") {
				await reconcileSupabaseConfig(cwd);
			} else {
				log.success(
					`Database already configured as ${options.db}. Nothing to do.`,
				);
			}
		} else {
			if (existingDb.type && existingDb.type !== options.db) {
				log.warn(`A ${existingDb.type} database is already configured.`);
				const { shouldOverwrite } = await prompts({
					type: "confirm",
					name: "shouldOverwrite",
					message:
						"Overwrite database configuration? (drizzle config/client files and packages may be updated; schema, migrations, and seeds will not be overwritten)",
					initial: false,
				});

				if (!shouldOverwrite) {
					log.info("Skipped database update.");
				} else {
					overwriteExistingConfig = true;
				}
			}

			if (!existingDb.type || overwriteExistingConfig) {
				if (options.db === "postgres") {
					await configurePostgres(cwd, projectName, overwriteExistingConfig);
				} else {
					await configureSupabase(cwd, projectName, overwriteExistingConfig);
				}
				if (await hasVercelProjectLink(cwd)) {
					log.info(
						`To set a hosted DATABASE_URL in Vercel, run: forge update ${path.relative(process.cwd(), cwd) || "."} --vercel --db ${options.db}`,
					);
				}
			}
		}
	}

	if (options.supabase) {
		const cloudRefPath = path.join(cwd, ".supabase", ".project-ref");
		if (!(await fileExists(cloudRefPath))) {
			const supabaseResult = await setupSupabase(cwd, projectName);
			if (supabaseResult?.databaseUrl) {
				await writeFile(
					path.join(cwd, ".env.development.local"),
					`# Cloud Supabase — loaded by Next.js during \`next dev\`, overrides .env.local\nDATABASE_URL=${supabaseResult.databaseUrl}\n`,
				);
				log.success("Cloud DATABASE_URL written to .env.development.local");
			}
		} else {
			log.info(
				"Supabase cloud project already linked (.supabase/.project-ref). Skipping provision.",
			);
		}
	}

	let applicationWorkosLocalEnv: Record<string, string> | null = null;
	if (options.auth === "workos") {
		applicationWorkosLocalEnv = await updateWorkosAuthScaffold(
			cwd,
			projectName,
		);
	}

	if (options.github || options.vercel) {
		const gitDir = path.join(cwd, ".git");
		if (!(await fileExists(gitDir))) {
			log.error(
				"This project is not a git repository. Run 'git init' first before using --github or --vercel.",
			);
			process.exit(1);
		}
	}

	if (options.github) {
		await setupGit(cwd, projectName);
	}

	if (options.vercel) {
		await withSpinner("Preparing Vercel CLI", async () => {
			await ensureVercelCLI();
		});

		const vercelDb = await resolveVercelDatabaseContext(options.db);
		await setupVercel(cwd, projectName, {
			auth: options.auth,
			db: vercelDb,
		});

		if (applicationWorkosLocalEnv) {
			await upsertEnvVars(
				path.join(cwd, ".env.local"),
				applicationWorkosLocalEnv,
			);
			log.info(
				"Restored application-level WorkOS variables in .env.local after Vercel env pull.",
			);
		}
	}

	if (hasAiUpdate) {
		await updateAiScaffold(cwd, projectName, options);
	}
}

export const updateCommand = new Command("update")
	.description(
		"Update an existing project with database, GitHub, Vercel, AI scaffold, and/or WorkOS AuthKit",
	)
	.argument("<path>", "Path to the project directory")
	.option("--db <type>", "Database type: postgres or supabase")
	.option(
		"--supabase",
		"Provision a Supabase cloud project (implies --db supabase; skips if .supabase/.project-ref exists)",
	)
	.option("--github", "Set up and link a GitHub remote repository (idempotent)")
	.option(
		"--vercel",
		"Set up Vercel deployment and repository connection (idempotent)",
	)
	.option(
		"--auth <type>",
		"With workos: scaffold AuthKit into the app. With --vercel: also set Vercel env context (workos, simple, better-auth)",
	)
	.option("--ai", "Update AI scaffold files (skips unchanged files)")
	.option(
		"--ai-skills <path>",
		"Path to a custom skills.json manifest (default: built-in)",
	)
	.action(async (projectPath: string, options: UpdateOptions) => {
		const cwd = path.resolve(process.cwd(), projectPath);

		if (!(await fileExists(cwd))) {
			log.error(`Directory ${projectPath} does not exist`);
			process.exit(1);
		}

		if (options.db && !["postgres", "supabase"].includes(options.db)) {
			log.error(
				`Invalid db type: ${options.db}. Use 'postgres' or 'supabase'.`,
			);
			process.exit(1);
		}

		if (
			options.auth &&
			!["workos", "simple", "better-auth"].includes(options.auth)
		) {
			log.error(
				`Invalid auth type: ${options.auth}. Use 'workos', 'simple', or 'better-auth'.`,
			);
			process.exit(1);
		}

		if (options.supabase) {
			if (options.db && options.db !== "supabase") {
				log.error(
					`--supabase conflicts with --db ${options.db}. Remove one of the flags.`,
				);
				process.exit(1);
			}
			options.db = "supabase";
		}

		const projectName = path.basename(cwd);
		await update(cwd, projectName, options);
	});
