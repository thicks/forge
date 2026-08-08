import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import prompts from "prompts";
import { loadConfig } from "../utils/config-manager.js";
import {
	ensureVercelCLI,
	execCommand,
	fileExists,
	ghGrantVercelRepoAccess,
	ghRepoView,
	gitAdd,
	gitCommit,
	gitCurrentBranch,
	gitLog,
	gitPush,
	gitRemoteGetUrl,
	gitStatus,
	log,
	normalizeGitUrlToHttps,
	parseGitRemoteUrl,
	vercelDeploy,
	vercelEnvAdd,
	vercelEnvPull,
	vercelEnvRemove,
	vercelGetAuthToken,
	vercelGitConnect,
	vercelLink,
	vercelLogin,
	vercelSetRootDirectory,
	vercelWhoami,
	withSpinner,
} from "../utils/index.js";
import {
	findVercelProjectJson,
	listVercelEnvVars,
} from "../utils/vercel-env.js";
import { constructDatabaseUrl, setupSupabase } from "./setup-supabase.js";

type AuthType = "workos" | "simple" | "better-auth" | "none";
type DbType = "postgres" | "supabase";

type VercelEnvironment = "production" | "preview" | "development";

async function ensureVercelEnvVar(
	key: string,
	value: string,
	environment: VercelEnvironment,
	appDir: string,
	team: string,
	sensitive = false,
): Promise<void> {
	const project = await findVercelProjectJson(appDir);
	if (project) {
		const existing = await listVercelEnvVars(
			project.projectId,
			project.orgId,
			environment,
		);
		if (existing.some((envVar) => envVar.key === key)) return;
	}

	await vercelEnvAdd(key, value, environment, appDir, team, { sensitive });
}

interface SetupVercelOptions {
	auth?: AuthType;
	db?: DbType;
	ci?: boolean;
	/** When set, indicates monorepo mode. The app lives at apps/<appName>. */
	appName?: string;
}

export async function setupVercel(
	cwd: string,
	projectName: string,
	options: SetupVercelOptions = {},
): Promise<void> {
	const { auth = "none", db, appName } = options;
	if (options.ci) {
		throw new Error(
			"Vercel setup requires interactive login, repository, and deployment decisions; run it outside --ci after linking and authenticating Vercel.",
		);
	}
	const isMonorepo = !!appName;

	// For monorepo, Vercel operations target the app directory
	const appDir = isMonorepo ? path.join(cwd, "apps", appName) : cwd;

	const config = await loadConfig();
	const team = config.vercel?.team;
	if (!team) {
		log.error(
			"No Vercel team configured. Run 'forge config' to set one before deploying to Vercel.",
		);
		process.exit(1);
	}

	log.info(`Setting up Vercel project: ${projectName}`);
	log.info(`  Auth: ${auth}`);
	log.info(`  Database: ${db || "none"}`);
	if (isMonorepo) {
		log.info(`  Mode: monorepo (app directory: apps/${appName})`);
	}

	await withSpinner("Preparing Vercel CLI", async () => {
		await ensureVercelCLI();
	});

	// Check if authenticated
	const username = await vercelWhoami(team);
	if (!username) {
		log.info("Not authenticated with Vercel. Initiating login...");
		await vercelLogin(cwd);
		log.success("Successfully authenticated with Vercel");
	} else {
		log.info(`Authenticated as: ${username}`);
	}

	// Link project (from app directory for monorepo, project root for standalone)
	await withSpinner("Linking Vercel project", async () => {
		await vercelLink(projectName, appDir, team);
	});
	log.success(`Linked to Vercel project: ${projectName}`);

	// For monorepo: set root directory via Vercel API
	if (isMonorepo) {
		await setMonorepoRootDirectory(appDir, appName);
	}

	// Connect Git repo to Vercel (always from monorepo root where .git lives)
	await connectGitRepository(cwd, appDir, projectName, team);

	// Configure environment variables based on auth type
	if (auth === "workos") {
		await setupWorkOsEnvVars(appDir, team);
	} else if (auth === "better-auth") {
		await setupBetterAuthEnvVars(appDir, team);
	}

	// Configure database environment variables
	if (db) {
		await setupDatabaseEnvVars(cwd, appDir, db, projectName, isMonorepo, team);
	}

	// Setup custom environment variables from config
	await setupCustomEnvVars(appDir, team);
	// Pull environment variables
	await withSpinner("Pulling environment variables", async () => {
		await vercelEnvPull(appDir, team);
	});
	log.success("Environment variables pulled to .env.local");

	// Commit and deploy (git ops from repo root, Vercel CLI deploy from app dir)
	await commitAndDeploy(cwd, appDir, team);

	log.success("\n✨ Vercel setup complete!");
	log.info("\nNext steps:");
	log.step("  1. Review your environment variables in .env.local");
	if (auth === "workos") {
		log.step(
			"  2. Add your WorkOS credentials (WORKOS_CLIENT_ID, WORKOS_API_KEY)",
		);
	}
	log.step("  3. Run 'pnpm dev' to start developing");
}

// ---------------------------------------------------------------------------
// Monorepo root directory configuration
// ---------------------------------------------------------------------------

async function setMonorepoRootDirectory(
	appDir: string,
	appName: string,
): Promise<void> {
	const projectJsonPath = path.join(appDir, ".vercel", "project.json");

	try {
		const content = await readFile(projectJsonPath, "utf-8");
		const { projectId } = JSON.parse(content);

		if (projectId) {
			const rootDir = `apps/${appName}`;
			await withSpinner(
				`Setting Vercel root directory to ${rootDir}`,
				async () => {
					const success = await vercelSetRootDirectory(projectId, rootDir);
					if (!success) {
						throw new Error("API call failed");
					}
				},
			);
			log.success(`Root directory configured: apps/${appName}`);
		}
	} catch {
		log.warn(
			"Could not set root directory automatically - set it manually in Vercel dashboard",
		);
	}
}

// ---------------------------------------------------------------------------
// Git repository connection
// ---------------------------------------------------------------------------

/**
 * Ensure the Vercel GitHub App has access to a repository, then connect it.
 *
 * When the Vercel GitHub App is installed with "Only select repositories",
 * newly created repos are invisible to Vercel until explicitly added. This
 * function detects the org/repo from the git remote, grants access via the
 * GitHub API, normalises the URL to HTTPS, and finally runs
 * \`vercel git connect\`.
 */
async function connectGitRepository(
	cwd: string,
	appDir: string,
	projectName: string,
	team: string,
): Promise<void> {
	// Check if origin remote already exists
	const existingGitUrl = await gitRemoteGetUrl("origin", cwd);

	if (existingGitUrl) {
		// Parse the remote URL to extract org/repo for granting access
		const parsed = parseGitRemoteUrl(existingGitUrl);
		if (parsed) {
			await grantVercelAppAccess(parsed.org, parsed.name);
		}

		// Normalise to HTTPS — vercel git connect may not accept SSH URLs
		const httpsUrl = normalizeGitUrlToHttps(existingGitUrl);

		try {
			await withSpinner("Connecting Git repository", async () => {
				await vercelGitConnect(httpsUrl, appDir, team);
			});
			log.success("Connected Git repository to Vercel");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// Vercel CLI exits 1 when the repo is already connected — treat as success
			if (message.toLowerCase().includes("already connected")) {
				log.success("Git repository already connected to Vercel");
			} else {
				log.warn(`Could not connect Git repository: ${message}`);
			}
		}
		return;
	}

	// No origin remote — prompt for a GitHub repo to connect
	log.info(
		"No Git remote found. Vercel works best when connected to a Git repository.",
	);

	const config = await loadConfig();
	const githubOrg = config.github?.org;
	const defaultRepo = githubOrg ? `${githubOrg}/${projectName}` : undefined;
	const defaultRepoExists = githubOrg
		? await ghRepoView(githubOrg, projectName)
		: false;

	if (defaultRepoExists && defaultRepo) {
		log.info(`Found GitHub repository: ${defaultRepo}`);
	}

	const { repoFullName } = await prompts({
		type: "text",
		name: "repoFullName",
		message: "GitHub repository to connect (org/name, or leave blank to skip):",
		initial: defaultRepoExists ? defaultRepo : undefined,
	});

	if (!repoFullName) {
		log.info(
			"Skipping Git connection. You can connect a repo later in the Vercel dashboard.",
		);
		return;
	}

	// Validate the repo format and existence
	const [org, name] = repoFullName.split("/");
	if (!org || !name) {
		log.warn(
			"Invalid repository format. Expected org/name. Skipping Git connection.",
		);
		return;
	}

	if (repoFullName !== defaultRepo || !defaultRepoExists) {
		const exists = await ghRepoView(org, name);
		if (!exists) {
			log.warn(
				`Repository ${repoFullName} not found on GitHub. Skipping Git connection.`,
			);
			return;
		}
	}

	// Grant Vercel GitHub App access before connecting
	await grantVercelAppAccess(org, name);

	const gitUrl = `https://github.com/${repoFullName}`;
	try {
		await withSpinner("Connecting Git repository to Vercel", async () => {
			await vercelGitConnect(gitUrl, appDir, team);
		});
		log.success(`Connected ${repoFullName} to Vercel`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.toLowerCase().includes("already connected")) {
			log.success("Git repository already connected to Vercel");
		} else {
			log.warn(`Could not connect Git repository: ${message}`);
		}
	}
}

/**
 * Grant the Vercel GitHub App access to a repository so that
 * \`vercel git connect\` can see it. Logs progress but does not throw;
 * failures here are non-fatal since the repo may already be accessible.
 */
async function grantVercelAppAccess(
	org: string,
	repoName: string,
): Promise<void> {
	try {
		const granted = await withSpinner(
			"Granting Vercel access to GitHub repository",
			async () => {
				return await ghGrantVercelRepoAccess(org, repoName);
			},
		);
		if (granted) {
			log.success(`Vercel GitHub App can now access ${org}/${repoName}`);
		} else {
			log.warn(
				"Could not grant Vercel GitHub App access to the repository automatically.",
			);
			log.info(
				"This usually means the GitHub token lacks the admin:org scope, or the repo is already accessible.",
			);
			log.info(
				`If 'vercel git connect' fails below, manually add ${org}/${repoName} to the Vercel GitHub App:`,
			);
			log.step(
				`  https://github.com/organizations/${org}/settings/installations → Vercel → Configure → Add repository`,
			);
		}
	} catch {
		log.warn(
			"Could not grant Vercel GitHub App access to the repository automatically.",
		);
		log.info(
			`If 'vercel git connect' fails below, manually add ${org}/${repoName} to the Vercel GitHub App:`,
		);
		log.step(
			`  https://github.com/organizations/${org}/settings/installations → Vercel → Configure → Add repository`,
		);
	}
}

// ---------------------------------------------------------------------------
// WorkOS environment variables
// ---------------------------------------------------------------------------

async function setupWorkOsEnvVars(appDir: string, team: string): Promise<void> {
	log.info("Configuring WorkOS environment variables...");

	// Check global config for WorkOS credentials
	const config = await loadConfig();
	const hasWorkosCredentials =
		!!config.workos?.clientId && !!config.workos?.apiKey;

	const environments: Array<"production" | "preview" | "development"> = [
		"production",
		"preview",
		"development",
	];

	// When credentials exist in config, push CLIENT_ID and API_KEY to Vercel
	if (hasWorkosCredentials) {
		const workosClientId = config.workos?.clientId ?? "";
		const workosApiKey = config.workos?.apiKey ?? "";

		for (const env of environments) {
			await withSpinner(`Setting WORKOS_CLIENT_ID for ${env}`, async () => {
				await ensureVercelEnvVar(
					"WORKOS_CLIENT_ID",
					workosClientId,
					env,
					appDir,
					team,
				);
			});

			await withSpinner(`Setting WORKOS_API_KEY for ${env}`, async () => {
				await ensureVercelEnvVar(
					"WORKOS_API_KEY",
					workosApiKey,
					env,
					appDir,
					team,
					true,
				);
			});
		}
	}

	// Always generate and set WORKOS_COOKIE_PASSWORD (unique per environment)
	for (const env of environments) {
		const cookiePassword = crypto.randomBytes(32).toString("base64");

		await withSpinner(`Setting WORKOS_COOKIE_PASSWORD for ${env}`, async () => {
			await ensureVercelEnvVar(
				"WORKOS_COOKIE_PASSWORD",
				cookiePassword,
				env,
				appDir,
				team,
				true,
			);
		});
	}

	// Set NEXT_PUBLIC_WORKOS_REDIRECT_URI with a localhost placeholder so the
	// env var exists in Vercel from the start. The user must update it to the
	// real deployment URL (e.g. https://<domain>/callback) before auth will work.
	const redirectPlaceholder = "http://localhost:3000/callback";
	for (const env of environments) {
		await withSpinner(
			`Setting NEXT_PUBLIC_WORKOS_REDIRECT_URI for ${env}`,
			async () => {
				await ensureVercelEnvVar(
					"NEXT_PUBLIC_WORKOS_REDIRECT_URI",
					redirectPlaceholder,
					env,
					appDir,
					team,
				);
			},
		);
	}

	if (hasWorkosCredentials) {
		log.success(
			"WorkOS environment variables configured (CLIENT_ID, API_KEY, COOKIE_PASSWORD, REDIRECT_URI)",
		);
	} else {
		log.success(
			"WorkOS COOKIE_PASSWORD and REDIRECT_URI configured for all environments",
		);
		log.warn("WORKOS_CLIENT_ID and WORKOS_API_KEY were not found in config.");
		log.info(
			"Add them manually in the Vercel dashboard, or run 'forge config' to set defaults.",
		);
	}
	log.warn(
		`NEXT_PUBLIC_WORKOS_REDIRECT_URI is set to "${redirectPlaceholder}".`,
	);
	log.info(
		"Update it in the Vercel dashboard to your deployment URL (e.g. https://<domain>/callback).",
	);
}

// ---------------------------------------------------------------------------
// Better Auth environment variables
// ---------------------------------------------------------------------------

async function setupBetterAuthEnvVars(
	appDir: string,
	team: string,
): Promise<void> {
	log.info("Configuring Better Auth environment variables...");

	const environments: Array<"production" | "preview" | "development"> = [
		"production",
		"preview",
		"development",
	];

	// Generate and set BETTER_AUTH_SECRET (unique per environment)
	for (const env of environments) {
		const betterAuthSecret = crypto.randomBytes(32).toString("base64");

		await withSpinner(`Setting BETTER_AUTH_SECRET for ${env}`, async () => {
			await ensureVercelEnvVar(
				"BETTER_AUTH_SECRET",
				betterAuthSecret,
				env,
				appDir,
				team,
				true,
			);
		});
	}

	// Set BETTER_AUTH_URL with a localhost placeholder for now
	const urlPlaceholder = "http://localhost:3000";
	for (const env of environments) {
		await withSpinner(`Setting BETTER_AUTH_URL for ${env}`, async () => {
			await ensureVercelEnvVar(
				"BETTER_AUTH_URL",
				urlPlaceholder,
				env,
				appDir,
				team,
			);
		});
	}

	log.success(
		"Better Auth environment variables configured (BETTER_AUTH_SECRET, BETTER_AUTH_URL)",
	);
	log.warn(`BETTER_AUTH_URL is set to "${urlPlaceholder}".`);
	log.info(
		"Update it in the Vercel dashboard to your deployment URL (e.g. https://<domain>).",
	);
}

// ---------------------------------------------------------------------------
// Database environment variables and provisioning
// ---------------------------------------------------------------------------

async function setupDatabaseEnvVars(
	cwd: string,
	appDir: string,
	db: DbType,
	projectName: string,
	isMonorepo: boolean,
	team: string,
): Promise<void> {
	if (db === "supabase") {
		await setupSupabaseDatabase(cwd, appDir, projectName, isMonorepo, team);
	} else if (db === "postgres") {
		await setupPostgresDatabase(appDir, team);
	}
}

/**
 * Supabase provisioning pipeline for the Vercel setup flow:
 * 1. Provision/link cloud project (or reuse if already provisioned by --supabase flag)
 * 2. Generate and run migrations
 * 3. Set DATABASE_URL in Vercel
 *
 * When forge new --supabase --vercel is used, setupSupabase() already ran and
 * wrote .supabase/.project-ref + .supabase/.db-password. We reuse those directly
 * rather than re-provisioning, which avoids a redundant supabase link call.
 */
async function setupSupabaseDatabase(
	cwd: string,
	appDir: string,
	projectName: string,
	isMonorepo: boolean,
	team: string,
): Promise<void> {
	log.info("Setting up Supabase database for Vercel...");

	const supabaseDir = path.join(cwd, ".supabase");
	const refPath = path.join(supabaseDir, ".project-ref");
	const pwPath = path.join(supabaseDir, ".db-password");

	let databaseUrl: string | null = null;

	if ((await fileExists(refPath)) && (await fileExists(pwPath))) {
		// Already provisioned earlier in this run (e.g. by --supabase flag)
		const projectRef = (await readFile(refPath, "utf-8")).trim();
		log.info(`Reusing existing Supabase project: ${projectRef}`);
		databaseUrl = await constructDatabaseUrl(supabaseDir, projectRef);
	} else {
		const result = await setupSupabase(cwd, projectName);
		if (!result) {
			log.warn("Supabase project not configured, skipping DATABASE_URL setup");
			return;
		}
		databaseUrl = result.databaseUrl;
	}

	if (!databaseUrl) {
		log.warn(
			"Could not construct DATABASE_URL - add it manually in Vercel dashboard",
		);
		return;
	}

	// Generate and run initial migrations
	await runInitialMigrations(appDir, databaseUrl, isMonorepo);

	// Set DATABASE_URL in Vercel for all environments
	await setDatabaseUrlInVercel(appDir, databaseUrl, team);
}

async function runInitialMigrations(
	appDir: string,
	databaseUrl: string,
	isMonorepo: boolean,
): Promise<void> {
	log.info("Running initial database migrations...");

	try {
		// Generate initial migration files
		await withSpinner("Generating initial migration", async () => {
			await execCommand("pnpm", ["db:generate"], { cwd: appDir });
		});

		// Apply migrations with the production DATABASE_URL
		await withSpinner(
			"Applying migrations to production database",
			async () => {
				await execCommand("pnpm", ["db:migrate"], {
					cwd: appDir,
					env: { ...process.env, DATABASE_URL: databaseUrl },
				});
			},
		);

		log.success("Database migrations applied successfully");
	} catch {
		log.warn("Migration failed - you may need to run it manually");
		if (isMonorepo) {
			log.info(`  cd apps/<app> && DATABASE_URL='<url>' pnpm db:migrate`);
		} else {
			log.info(`  DATABASE_URL='<url>' pnpm db:migrate`);
		}
	}
}

async function setDatabaseUrlInVercel(
	appDir: string,
	databaseUrl: string,
	team: string,
): Promise<void> {
	log.info("Setting DATABASE_URL in Vercel environments...");

	const environments: Array<"production" | "preview" | "development"> = [
		"production",
		"preview",
		"development",
	];

	for (const env of environments) {
		await withSpinner(`Setting DATABASE_URL for ${env}`, async () => {
			await vercelEnvRemove("DATABASE_URL", env, appDir, team);
			await vercelEnvAdd("DATABASE_URL", databaseUrl, env, appDir, team);
		});
	}

	log.success("DATABASE_URL configured for all environments");
}

/**
 * Postgres/Docker path: Docker is local-only, so prompt the user
 * for a hosted DATABASE_URL for Vercel deployments.
 */
async function setupPostgresDatabase(
	appDir: string,
	team: string,
): Promise<void> {
	log.info("Setting up PostgreSQL database for Vercel...");
	log.info(
		"Docker PostgreSQL is for local development only. For Vercel deployments,",
	);
	log.info("you need a hosted PostgreSQL database (e.g. Neon, Supabase, RDS).");

	const { databaseUrl } = await prompts({
		type: "text",
		name: "databaseUrl",
		message: "Enter your production DATABASE_URL (or leave blank to skip):",
	});

	if (!databaseUrl) {
		log.info(
			"Skipping DATABASE_URL configuration. Add it later in Vercel dashboard.",
		);
		return;
	}

	await setDatabaseUrlInVercel(appDir, databaseUrl, team);
}

// ---------------------------------------------------------------------------
// Commit and deploy
// ---------------------------------------------------------------------------

/**
 * Setup custom environment variables from config file.
 */
async function setupCustomEnvVars(appDir: string, team: string): Promise<void> {
	try {
		const config = await loadConfig();

		if (!config.envVars || config.envVars.length === 0) {
			log.info("No custom environment variables to configure");
			return;
		}

		log.info(
			`Setting up ${config.envVars.length} custom environment variable(s)...`,
		);

		for (const envVar of config.envVars) {
			for (const env of envVar.environments) {
				await withSpinner(`Setting ${envVar.key} for ${env}`, async () => {
					try {
						await vercelEnvRemove(envVar.key, env, appDir, team);
					} catch {
						// Ignore if doesn't exist
					}

					await vercelEnvAdd(envVar.key, envVar.value, env, appDir, team);
				});
			}
		}

		log.success("Custom environment variables configured");
	} catch (error) {
		log.warn(
			`Could not load config file: ${error instanceof Error ? error.message : String(error)}`,
		);
		log.info("Skipping custom environment variables");
	}
}

async function commitAndDeploy(
	cwd: string,
	appDir: string,
	team: string,
): Promise<void> {
	// Check git status
	const status = await gitStatus(cwd);

	if (status.trim().length > 0) {
		// There are uncommitted changes
		log.info("Found uncommitted changes");

		const { shouldCommit } = await prompts({
			type: "confirm",
			name: "shouldCommit",
			message: "Commit Vercel setup changes?",
			initial: true,
		});

		if (shouldCommit) {
			await withSpinner("Committing changes", async () => {
				await gitAdd(cwd, ".");
				await gitCommit("chore: configure Vercel deployment", cwd);
			});
			log.success("Changes committed");
		}
	}

	// Check for unpushed commits
	const branch = await gitCurrentBranch(cwd);
	const unpushedCommits = await gitLog(cwd, `origin/${branch}..HEAD`);

	if (unpushedCommits === null) {
		log.warn("Could not determine unpushed commits — skipping push check");
	} else if (unpushedCommits.trim().length > 0) {
		log.info("Found unpushed commits");

		const { shouldPush } = await prompts({
			type: "confirm",
			name: "shouldPush",
			message: `Push to ${branch} and trigger Vercel deployment?`,
			initial: true,
		});

		if (shouldPush) {
			await withSpinner("Pushing to remote", async () => {
				await gitPush("origin", branch, cwd);
			});
			log.success("Pushed to remote. Vercel will deploy automatically.");
			return;
		}
	}

	// If no unpushed commits or user declined, offer CLI deploy
	const { shouldDeploy } = await prompts({
		type: "confirm",
		name: "shouldDeploy",
		message: "Deploy to production now using Vercel CLI?",
		initial: false,
	});

	if (shouldDeploy) {
		log.info("Deploying to production...");
		await vercelDeploy(appDir, team, true);
	}
}

// ---------------------------------------------------------------------------
// CLI command definition
// ---------------------------------------------------------------------------

export const setupVercelCommand = new Command("setup-vercel")
	.description("Setup Vercel deployment for an existing project")
	.argument("<path>", "Path to the project directory")
	.option("--auth <type>", "Authentication type: workos, simple, or none")
	.option("--db <type>", "Database type: postgres or supabase")
	.option(
		"--app-name <name>",
		"App name within monorepo (indicates monorepo mode, app at apps/<name>)",
	)
	.action(
		async (
			projectPath: string,
			options: { auth?: string; db?: string; appName?: string },
		) => {
			const cwd = path.resolve(process.cwd(), projectPath);

			// Check if directory exists
			if (!(await fileExists(cwd))) {
				log.error(`Directory ${projectPath} does not exist`);
				process.exit(1);
			}

			// Validate auth option
			if (
				options.auth &&
				!["workos", "simple", "better-auth", "none"].includes(options.auth)
			) {
				log.error(
					`Invalid auth type: ${options.auth}. Use 'workos', 'simple', 'better-auth', or 'none'.`,
				);
				process.exit(1);
			}

			// Validate db option
			if (options.db && !["postgres", "supabase"].includes(options.db)) {
				log.error(
					`Invalid db type: ${options.db}. Use 'postgres' or 'supabase'.`,
				);
				process.exit(1);
			}

			// Get project name from directory
			const projectName = path.basename(cwd);

			await setupVercel(cwd, projectName, {
				auth: options.auth as AuthType | undefined,
				db: options.db as DbType | undefined,
				appName: options.appName,
			});
		},
	);
