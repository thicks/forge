import crypto from "node:crypto";
import path from "node:path";
import { Command } from "commander";
import prompts from "prompts";
import {
	generateBetterAuthClient,
	generateBetterAuthLayoutTsx,
	generateBetterAuthLoginPage,
	generateBetterAuthProxy,
	generateBetterAuthRoute,
	generateBetterAuthServer,
	generateBetterAuthSignupPage,
	generateBiomeJson,
	generateChecksWorkflow,
	generateClaudeDesktopConfigExample,
	generateClaudeLaunchJson,
	generateClaudeMd,
	generateClaudeSettingsJson,
	generateClientLogger,
	generateCursorProjectContextRule,
	generateCursorSettingsJson,
	generateDbSchema,
	generateDevLoginForm,
	generateDockerCompose,
	generateDockerStartScript,
	generateDrizzleConfig,
	generateEslintConfig,
	generateFooterTsx,
	generateForgeRecommendationsMd,
	generateGitignore,
	generateGlobalsCss,
	generateHeroTsx,
	generateLayoutTsx,
	generateLoginApiRoute,
	generateMonorepoAppPackageJson,
	generateMonorepoNextConfig,
	generateMonorepoRootPackageJson,
	generateMonorepoVercelJson,
	generateNextConfig,
	generatePageTsx,
	generatePnpmWorkspace,
	generatePostHogProvider,
	generatePostHogServer,
	generatePostcssConfig,
	generatePostgresClient,
	generateServerLogger,
	generateSetupScript,
	generateSimpleAuthRoute,
	generateSimpleLayoutTsx,
	generateSimpleLoginPage,
	generateSimpleMiddleware,
	generateStandaloneComponentsJson,
	generateStandalonePackageJson,
	generateStandalonePnpmWorkspace,
	generateSupabaseBrowserClient,
	generateSupabaseConfig,
	generateSupabaseMiddlewareClient,
	generateSupabaseSeed,
	generateSupabaseServerClient,
	generateSupabaseStartScript,
	generateTestMocks,
	generateTestRenderUtils,
	generateTestWorkflow,
	generateTsConfig,
	generateTurboJson,
	generateUIComponentsJson,
	generateUIIndex,
	generateUILibUtils,
	generateUIPackageJson,
	generateUITsconfig,
	generateUserFactory,
	generateUtilsTest,
	generateVSCodeExtensions,
	generateVSCodeSettings,
	generateVercelJson,
	generateVitestConfig,
	generateVitestSetup,
	generateWorkosCallbackRoute,
	generateWorkosLayoutTsx,
	generateWorkosLoginPage,
	generateWorkosMiddleware,
} from "../templates/index.js";
import { loadConfig } from "../utils/config-manager.js";
import {
	copyAsset,
	copyFile,
	ensureDir,
	ensureDocker,
	ensureDockerRunning,
	ensurePostgresClient,
	ensureSupabaseCLI,
	ensureVercelCLI,
	execCommand,
	fileExists,
	getAssetPath,
	ghAuthStatus,
	ghRepoView,
	gitAdd,
	gitCommit,
	gitInit,
	installSkills,
	loadSkillManifest,
	log,
	pnpmInstall,
	removeDir,
	removeFile,
	resolveSkills,
	vercelProjectExists,
	withSpinner,
	writeFile,
} from "../utils/index.js";
import { setupGit } from "./setup-git.js";
import { setupSupabase } from "./setup-supabase.js";
import { setupVercel } from "./setup-vercel.js";

type AuthType = "workos" | "simple" | "better-auth" | "none";

const shadcnComponents = [
	"button",
	"input",
	"card",
	"label",
	"avatar",
	"dropdown-menu",
	"separator",
];
type DbType = "postgres" | "supabase";

interface NewOptions {
	monorepo?: string;
	auth?: AuthType;
	db?: DbType;
	github?: boolean;
	vercel?: boolean;
	supabase?: boolean;
	/** Skip all interactive prompts, auto-overwrite existing dirs, skip GitHub/Vercel setup */
	ci?: boolean;
	/** Skip pnpm install, shadcn, and biome format — for tests that only verify file structure */
	skipInstall?: boolean;
	/** @internal Vercel project already existed; user declined relink */
	vercelSkipped?: boolean;
	/** Path to a custom skills.json manifest (default: built-in) */
	aiSkills?: string;
}

async function createStandaloneApp(
	appName: string,
	targetDir: string,
	options: NewOptions,
): Promise<void> {
	const auth = options.auth || "none";

	// Load forge config for shared defaults (e.g. WorkOS credentials)
	const config = await loadConfig();
	const db = options.db; // undefined means no database

	log.info(`Creating standalone app: ${appName}`);
	log.info(`  Database: ${db || "none"}`);
	log.info(`  Auth: ${auth}`);

	// Create directory structure
	await withSpinner("Creating directory structure", async () => {
		await ensureDir(targetDir);
		await ensureDir(path.join(targetDir, "app"));
		await ensureDir(path.join(targetDir, "app", "_components"));
		await ensureDir(path.join(targetDir, "public"));

		// Create db directory only when db is configured
		if (db) {
			await ensureDir(path.join(targetDir, "db"));
		}

		// Create Supabase directory structure when using supabase
		if (db === "supabase") {
			await ensureDir(path.join(targetDir, "supabase"));
			await ensureDir(path.join(targetDir, "supabase", "migrations"));
		}

		// Create auth-related directories
		if (auth === "workos") {
			await ensureDir(path.join(targetDir, "app", "callback"));
			await ensureDir(path.join(targetDir, "app", "login"));
			await ensureDir(path.join(targetDir, "app", "api", "auth", "login"));
		} else if (auth === "simple") {
			await ensureDir(path.join(targetDir, "app", "login"));
			await ensureDir(path.join(targetDir, "app", "api", "auth", "login"));
		} else if (auth === "better-auth") {
			await ensureDir(path.join(targetDir, "app", "login"));
			await ensureDir(path.join(targetDir, "app", "signup"));
			await ensureDir(path.join(targetDir, "app", "api", "auth", "[...all]"));
			await ensureDir(path.join(targetDir, "lib"));
		}
	});

	// Write configuration files
	await withSpinner("Writing configuration files", async () => {
		await writeFile(
			path.join(targetDir, "package.json"),
			generateStandalonePackageJson(appName, { auth, db }),
		);
		await writeFile(
			path.join(targetDir, "pnpm-workspace.yaml"),
			generateStandalonePnpmWorkspace(),
		);
		await writeFile(path.join(targetDir, "biome.json"), generateBiomeJson());
		await writeFile(
			path.join(targetDir, "eslint.config.mjs"),
			generateEslintConfig(),
		);
		await writeFile(path.join(targetDir, ".gitignore"), generateGitignore());
		await writeFile(path.join(targetDir, "tsconfig.json"), generateTsConfig());
		await writeFile(
			path.join(targetDir, "next.config.ts"),
			generateNextConfig(),
		);
		await writeFile(
			path.join(targetDir, "postcss.config.mjs"),
			generatePostcssConfig(),
		);

		// Only write drizzle config when db is configured
		if (db) {
			await writeFile(
				path.join(targetDir, "drizzle.config.ts"),
				generateDrizzleConfig(db),
			);
		}
	});

	// Write database configuration based on db choice
	if (db === "supabase") {
		await withSpinner("Setting up Supabase", async () => {
			await writeFile(
				path.join(targetDir, "supabase", "config.toml"),
				generateSupabaseConfig(appName),
			);
			await writeFile(
				path.join(targetDir, "supabase", "seed.sql"),
				generateSupabaseSeed(),
			);
		});
	} else if (db === "postgres") {
		await withSpinner("Setting up PostgreSQL", async () => {
			await writeFile(
				path.join(targetDir, "docker-compose.yml"),
				generateDockerCompose(appName),
			);
		});
	}

	// Write app files
	await withSpinner("Writing app files", async () => {
		await writeFile(
			path.join(targetDir, "app", "page.tsx"),
			generatePageTsx(appName),
		);
		await writeFile(
			path.join(targetDir, "app", "_components", "hero.tsx"),
			generateHeroTsx(),
		);
		await writeFile(
			path.join(targetDir, "app", "_components", "footer.tsx"),
			generateFooterTsx(),
		);

		// Layout depends on auth type
		if (auth === "workos") {
			await writeFile(
				path.join(targetDir, "app", "layout.tsx"),
				generateWorkosLayoutTsx(appName),
			);
		} else if (auth === "simple") {
			await writeFile(
				path.join(targetDir, "app", "layout.tsx"),
				generateSimpleLayoutTsx(appName),
			);
		} else if (auth === "better-auth") {
			await writeFile(
				path.join(targetDir, "app", "layout.tsx"),
				generateBetterAuthLayoutTsx(appName),
			);
		} else {
			await writeFile(
				path.join(targetDir, "app", "layout.tsx"),
				generateLayoutTsx(appName),
			);
		}

		await writeFile(
			path.join(targetDir, "app", "globals.css"),
			generateGlobalsCss(),
		);
	});

	// Write auth files based on auth type
	if (auth === "workos") {
		await withSpinner("Setting up WorkOS authentication", async () => {
			await writeFile(
				path.join(targetDir, "middleware.ts"),
				generateWorkosMiddleware(appName),
			);
			await writeFile(
				path.join(targetDir, "app", "callback", "route.ts"),
				generateWorkosCallbackRoute(),
			);
			await writeFile(
				path.join(targetDir, "app", "login", "page.tsx"),
				generateWorkosLoginPage(appName),
			);
			await writeFile(
				path.join(targetDir, "app", "login", "dev-login-form.tsx"),
				generateDevLoginForm(appName),
			);
			await writeFile(
				path.join(targetDir, "app", "api", "auth", "login", "route.ts"),
				generateLoginApiRoute(appName),
			);
		});
	} else if (auth === "simple") {
		await withSpinner("Setting up demo authentication", async () => {
			await writeFile(
				path.join(targetDir, "middleware.ts"),
				generateSimpleMiddleware(),
			);
			await writeFile(
				path.join(targetDir, "app", "login", "page.tsx"),
				generateSimpleLoginPage(appName),
			);
			await writeFile(
				path.join(targetDir, "app", "api", "auth", "login", "route.ts"),
				generateSimpleAuthRoute(),
			);
		});
	} else if (auth === "better-auth") {
		await withSpinner("Setting up Better Auth authentication", async () => {
			// Auth server configuration
			await writeFile(
				path.join(targetDir, "lib", "auth.ts"),
				generateBetterAuthServer(db as "postgres" | "supabase"),
			);
			// Auth client for React components
			await writeFile(
				path.join(targetDir, "lib", "auth-client.ts"),
				generateBetterAuthClient(),
			);
			// API route handler
			await writeFile(
				path.join(targetDir, "app", "api", "auth", "[...all]", "route.ts"),
				generateBetterAuthRoute(),
			);
			// Next.js proxy for auth protection
			await writeFile(
				path.join(targetDir, "proxy.ts"),
				generateBetterAuthProxy(),
			);
			// Login page
			await writeFile(
				path.join(targetDir, "app", "login", "page.tsx"),
				generateBetterAuthLoginPage(),
			);
			// Signup page
			await writeFile(
				path.join(targetDir, "app", "signup", "page.tsx"),
				generateBetterAuthSignupPage(),
			);
		});
	}

	// Write database client files only when db is configured
	if (db) {
		await withSpinner("Writing database files", async () => {
			await writeFile(
				path.join(targetDir, "db", "schema.ts"),
				generateDbSchema({ auth }),
			);

			if (db === "supabase") {
				await writeFile(
					path.join(targetDir, "db", "client.ts"),
					generateSupabaseBrowserClient(),
				);
				await writeFile(
					path.join(targetDir, "db", "server.ts"),
					generateSupabaseServerClient(),
				);
				await writeFile(
					path.join(targetDir, "db", "middleware.ts"),
					generateSupabaseMiddlewareClient(),
				);
			} else {
				await writeFile(
					path.join(targetDir, "db", "index.ts"),
					generatePostgresClient(),
				);
			}
		});
	}

	// Copy logo assets
	await withSpinner("Creating assets", async () => {
		const logoSrc = getAssetPath("forge-logo.png");
		await copyFile(logoSrc, path.join(targetDir, "public", "forge-logo.png"));
	});

	// Create environment files
	// .env.example gets safe placeholder values (committed to git).
	// .env.local gets real credentials from ~/.forge.json (gitignored).
	await withSpinner("Creating environment files", async () => {
		let envContent = "";
		let envExampleContent = "";

		if (db === "supabase") {
			const supabaseEnv = `# Supabase Local Development
# Run \`supabase start\` to get these values
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Direct database connection (for Drizzle migrations)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
`;
			envContent += supabaseEnv;
			envExampleContent += supabaseEnv;
		} else if (db === "postgres") {
			const postgresEnv = `# Database (Docker PostgreSQL)
# Run \`docker compose up -d\` to start the database
DATABASE_URL=postgresql://postgres:postgres@localhost:5400/${appName}
`;
			envContent += postgresEnv;
			envExampleContent += postgresEnv;
		}

		if (auth === "workos") {
			envContent += `
# WorkOS Authentication
WORKOS_CLIENT_ID=${config.workos?.clientId || ""}
WORKOS_API_KEY=${config.workos?.apiKey || ""}
WORKOS_COOKIE_PASSWORD=${crypto.randomBytes(32).toString("base64")}
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback
`;
			envExampleContent += `
# WorkOS Authentication
WORKOS_CLIENT_ID=<your-workos-client-id>
WORKOS_API_KEY=<your-workos-api-key>
WORKOS_COOKIE_PASSWORD=<generate-a-32-byte-base64-key>
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback
`;
		} else if (auth === "better-auth") {
			const betterAuthSecret = crypto.randomBytes(32).toString("base64");
			envContent += `
# Better Auth
BETTER_AUTH_SECRET=${betterAuthSecret}
BETTER_AUTH_URL=http://localhost:3000
`;
			envExampleContent += `
# Better Auth
BETTER_AUTH_SECRET=<generate-a-32-byte-base64-key>
BETTER_AUTH_URL=http://localhost:3000
`;
		}

		const posthogEnv = `
# PostHog Analytics (optional - app works without these)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=
`;
		envContent += posthogEnv;
		envExampleContent += posthogEnv;

		const trailingComment = `
# Add your environment variables here
`;
		envContent += trailingComment;
		envExampleContent += trailingComment;

		await writeFile(path.join(targetDir, ".env.example"), envExampleContent);
		await writeFile(path.join(targetDir, ".env.local"), envContent);
	});

	// Generate vercel.json if --vercel flag is set
	if (options.vercel) {
		await withSpinner("Generating Vercel configuration", async () => {
			await writeFile(
				path.join(targetDir, "vercel.json"),
				generateVercelJson({ db }),
			);
		});
	}

	// Standalone utility (cn helper + shadcn config)
	await withSpinner("Setting up utilities", async () => {
		await ensureDir(path.join(targetDir, "lib"));
		await writeFile(
			path.join(targetDir, "lib", "utils.ts"),
			generateUILibUtils(),
		);
		await writeFile(
			path.join(targetDir, "components.json"),
			generateStandaloneComponentsJson(),
		);
	});

	// PostHog analytics (graceful when key is missing)
	await withSpinner("Setting up PostHog analytics", async () => {
		await ensureDir(path.join(targetDir, "components", "providers"));
		await writeFile(
			path.join(targetDir, "components", "providers", "posthog.tsx"),
			generatePostHogProvider(),
		);
		await writeFile(
			path.join(targetDir, "lib", "posthog.ts"),
			generatePostHogServer(),
		);
	});

	// Structured logging
	await withSpinner("Setting up logging", async () => {
		await ensureDir(path.join(targetDir, "lib", "logger"));
		await writeFile(
			path.join(targetDir, "lib", "logger", "client.ts"),
			generateClientLogger(),
		);
		await writeFile(
			path.join(targetDir, "lib", "logger", "server.ts"),
			generateServerLogger(),
		);
	});

	// Vitest test setup
	await withSpinner("Setting up testing", async () => {
		await ensureDir(path.join(targetDir, "__tests__", "utils"));
		await ensureDir(path.join(targetDir, "__tests__", "factories"));
		await ensureDir(path.join(targetDir, "__tests__", "unit"));
		await ensureDir(path.join(targetDir, "__tests__", "components"));
		await ensureDir(path.join(targetDir, "__tests__", "integration"));
		await writeFile(
			path.join(targetDir, "vitest.config.mts"),
			generateVitestConfig(),
		);
		await writeFile(
			path.join(targetDir, "vitest.setup.ts"),
			generateVitestSetup(),
		);
		await writeFile(
			path.join(targetDir, "__tests__", "utils", "mocks.ts"),
			generateTestMocks(),
		);
		await writeFile(
			path.join(targetDir, "__tests__", "utils", "render.tsx"),
			generateTestRenderUtils(),
		);
		await writeFile(
			path.join(targetDir, "__tests__", "factories", "user.ts"),
			generateUserFactory(auth === "workos"),
		);
		await writeFile(
			path.join(targetDir, "__tests__", "unit", "utils.test.ts"),
			generateUtilsTest(),
		);
	});

	// GitHub Actions CI
	await withSpinner("Setting up CI workflows", async () => {
		await ensureDir(path.join(targetDir, ".github", "workflows"));
		await writeFile(
			path.join(targetDir, ".github", "workflows", "checks.yml"),
			generateChecksWorkflow(),
		);
		await writeFile(
			path.join(targetDir, ".github", "workflows", "test.yml"),
			generateTestWorkflow(appName, !!db),
		);
	});

	// VS Code config
	await withSpinner("Setting up VS Code config", async () => {
		await ensureDir(path.join(targetDir, ".vscode"));
		await writeFile(
			path.join(targetDir, ".vscode", "extensions.json"),
			generateVSCodeExtensions(),
		);
		await writeFile(
			path.join(targetDir, ".vscode", "settings.json"),
			generateVSCodeSettings(),
		);
	});

	// Cursor config
	await withSpinner("Setting up Cursor config", async () => {
		await ensureDir(path.join(targetDir, ".cursor", "rules"));
		await writeFile(
			path.join(targetDir, ".cursor", "settings.json"),
			generateCursorSettingsJson(),
		);
		// Dynamic rule (depends on isMonorepo and hasDatabase)
		await writeFile(
			path.join(targetDir, ".cursor", "rules", "project-context.mdc"),
			generateCursorProjectContextRule(false, !!db),
		);
		// Static rules copied from assets
		await copyAsset(
			"cursor/rules/typescript-standards.mdc",
			path.join(targetDir, ".cursor", "rules", "typescript-standards.mdc"),
		);
		await copyAsset(
			"cursor/rules/testing.mdc",
			path.join(targetDir, ".cursor", "rules", "testing.mdc"),
		);
		await copyAsset(
			"cursor/rules/git-workflow.mdc",
			path.join(targetDir, ".cursor", "rules", "git-workflow.mdc"),
		);
		await copyAsset(
			"cursor/rules/comment-style.mdc",
			path.join(targetDir, ".cursor", "rules", "comment-style.mdc"),
		);
	});

	// Claude Code integration
	await withSpinner("Setting up Claude Code", async () => {
		await writeFile(
			path.join(targetDir, "CLAUDE.md"),
			generateClaudeMd(appName, auth, false, !!db),
		);
		await ensureDir(path.join(targetDir, ".claude"));
		await writeFile(
			path.join(targetDir, ".claude", "settings.json"),
			generateClaudeSettingsJson(),
		);
		await writeFile(
			path.join(targetDir, ".claude", "launch.json"),
			generateClaudeLaunchJson(),
		);
		await writeFile(
			path.join(targetDir, ".claude", "claude_desktop_config.example.json"),
			generateClaudeDesktopConfigExample(),
		);
		// Install skills from manifest
		const manifest = await loadSkillManifest(options.aiSkills);
		const skills = resolveSkills(manifest, { db, auth });
		await installSkills(skills, targetDir, "copy");
	});

	await withSpinner("Writing AI recommendations", async () => {
		await writeFile(
			path.join(targetDir, "FORGE_RECOMMENDATIONS.md"),
			generateForgeRecommendationsMd(),
		);
	});

	// Setup script
	await withSpinner("Creating setup script", async () => {
		await ensureDir(path.join(targetDir, "scripts"));
		await writeFile(
			path.join(targetDir, "scripts", "setup"),
			generateSetupScript(appName, auth === "workos"),
		);
		// Make setup script executable
		const { chmod } = await import("node:fs/promises");
		await chmod(path.join(targetDir, "scripts", "setup"), 0o755);

		if (db === "postgres") {
			await writeFile(
				path.join(targetDir, "scripts", "db-start"),
				generateDockerStartScript(),
			);
			await chmod(path.join(targetDir, "scripts", "db-start"), 0o755);
		}

		if (db === "supabase") {
			await writeFile(
				path.join(targetDir, "scripts", "supabase-start"),
				generateSupabaseStartScript(),
			);
			await chmod(path.join(targetDir, "scripts", "supabase-start"), 0o755);
		}
	});

	if (!options.skipInstall) {
		// Install dependencies
		await withSpinner("Installing dependencies", async () => {
			await pnpmInstall(targetDir);
		});

		// Initialize shadcn/ui (components.json + lib/utils.ts are generated earlier)
		const standaloneComponentsConfigPath = path.join(
			targetDir,
			"components.json",
		);
		if (await fileExists(standaloneComponentsConfigPath)) {
			log.info("shadcn init skipped (components.json already exists)");
		} else {
			await withSpinner("Initializing shadcn/ui", async () => {
				try {
					await execCommand("pnpm", ["dlx", "shadcn@latest", "init", "-y"], {
						cwd: targetDir,
					});
				} catch {
					log.warn(
						"shadcn init failed. You can run it manually in the project directory.",
					);
				}
			});
		}

		// Add shadcn components
		await withSpinner("Adding shadcn components", async () => {
			try {
				await execCommand(
					"pnpm",
					["dlx", "shadcn@latest", "add", ...shadcnComponents, "-y"],
					{ cwd: targetDir },
				);
			} catch {
				log.warn(
					"Some shadcn components may not have been added. You can add them manually.",
				);
			}
		});

		// Format with Biome
		await withSpinner("Formatting with Biome", async () => {
			try {
				await execCommand("pnpm", ["format"], { cwd: targetDir });
			} catch {
				// Non-critical if format fails
			}
		});
	}

	// Remove auto-generated files that should stay gitignored
	await removeFile(path.join(targetDir, "next-env.d.ts"));

	// Always initialize git repository
	const gitDir = path.join(targetDir, ".git");
	const isGitRepo = await fileExists(gitDir);

	if (!isGitRepo) {
		await withSpinner("Initializing git repository", async () => {
			await gitInit(targetDir);
			await gitAdd(targetDir, ".");
			await gitCommit("Initial commit - Created by Forge", targetDir);
		});
	}

	// Set up GitHub remote if --github flag is set
	if (options.github) {
		try {
			await setupGit(targetDir, appName);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error(`GitHub setup failed: ${message}`);
			log.info(`You can retry later with: forge setup-git ${targetDir}`);
		}
	}

	// Provision Supabase cloud project if --supabase flag is set
	if (options.supabase) {
		try {
			const supabaseResult = await setupSupabase(
				targetDir,
				appName,
				config.supabase?.token,
			);
			if (supabaseResult?.databaseUrl) {
				await writeFile(
					path.join(targetDir, ".env.development.local"),
					`# Cloud Supabase — loaded by Next.js during \`next dev\`, overrides .env.local\nDATABASE_URL=${supabaseResult.databaseUrl}\n`,
				);
				log.success("Cloud DATABASE_URL written to .env.development.local");
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error(`Supabase provisioning failed: ${message}`);
			log.info("You can provision later with: supabase projects create");
		}
	}

	// Set up Vercel if --vercel flag is set
	if (options.vercel) {
		await setupVercel(targetDir, appName, { auth, db });
	}

	log.success(`\n✨ Created ${appName} at ${targetDir}`);
	log.info("\nNext steps:");
	log.step(`  cd ${path.relative(process.cwd(), targetDir)}`);

	if (db === "supabase") {
		if (!options.supabase) {
			log.step("  # Install Supabase CLI: brew install supabase/tap/supabase");
		}
		log.step("  supabase start");
		log.step("  pnpm db:push");
	} else if (db === "postgres") {
		log.step("  docker compose up -d");
		log.step("  pnpm db:push");
	}

	if (
		auth === "workos" &&
		!(config.workos?.clientId && config.workos?.apiKey)
	) {
		log.step("  # Configure WorkOS credentials in .env.local:");
		log.step("  #   WORKOS_CLIENT_ID, WORKOS_API_KEY");
	}

	log.step("  pnpm dev");

	// Suggest git remote setup if user didn't use --github and it wasn't skipped
	if (!options.github) {
		log.blank();
		log.info("To set up GitHub remote later:");
		log.step(
			`  forge update ${path.relative(process.cwd(), targetDir)} --github`,
		);
	}
	// Suggest Vercel setup later when not already configured during creation.
	if (!options.vercel && !options.vercelSkipped) {
		log.blank();
		log.info("To set up Vercel later:");
		log.step(
			`  forge update ${path.relative(process.cwd(), targetDir)} --vercel${auth !== "none" ? ` --auth ${auth}` : ""}${db ? ` --db ${db}` : ""}`,
		);
	}
	// Suggest Supabase provisioning when using local supabase without --supabase
	if (db === "supabase" && !options.supabase) {
		log.blank();
		log.info("To provision a Supabase cloud project later:");
		log.step("  supabase projects create");
	}
}

async function createMonorepoApp(
	appName: string,
	repoName: string,
	targetDir: string,
	options: NewOptions,
): Promise<void> {
	const auth = options.auth || "none";

	// Load forge config for shared defaults (e.g. WorkOS credentials)
	const config = await loadConfig();
	const db = options.db; // undefined means no database

	log.info(`Creating monorepo: ${repoName} with app: ${appName}`);
	log.info(`  Database: ${db || "none"}`);
	log.info(`  Auth: ${auth}`);

	const appDir = path.join(targetDir, "apps", appName);

	// Create monorepo directory structure
	await withSpinner("Creating monorepo structure", async () => {
		await ensureDir(targetDir);
		await ensureDir(path.join(targetDir, "apps"));
		await ensureDir(path.join(targetDir, "packages"));
		await ensureDir(appDir);
		await ensureDir(path.join(appDir, "app"));
		await ensureDir(path.join(appDir, "app", "_components"));
		await ensureDir(path.join(appDir, "public"));

		// Create db directory only when db is configured
		if (db) {
			await ensureDir(path.join(appDir, "db"));
		}

		// Create Supabase directory at monorepo root
		if (db === "supabase") {
			await ensureDir(path.join(targetDir, "supabase"));
			await ensureDir(path.join(targetDir, "supabase", "migrations"));
		}

		// Create auth-related directories
		if (auth === "workos") {
			await ensureDir(path.join(appDir, "app", "callback"));
			await ensureDir(path.join(appDir, "app", "login"));
			await ensureDir(path.join(appDir, "app", "api", "auth", "login"));
		} else if (auth === "simple") {
			await ensureDir(path.join(appDir, "app", "login"));
			await ensureDir(path.join(appDir, "app", "api", "auth", "login"));
		} else if (auth === "better-auth") {
			await ensureDir(path.join(appDir, "app", "login"));
			await ensureDir(path.join(appDir, "app", "signup"));
			await ensureDir(path.join(appDir, "app", "api", "auth", "[...all]"));
			await ensureDir(path.join(appDir, "lib"));
		}
	});

	// Write root monorepo configuration files
	await withSpinner("Writing monorepo configuration", async () => {
		await writeFile(
			path.join(targetDir, "package.json"),
			generateMonorepoRootPackageJson(repoName),
		);
		await writeFile(path.join(targetDir, "turbo.json"), generateTurboJson());
		await writeFile(
			path.join(targetDir, "pnpm-workspace.yaml"),
			generatePnpmWorkspace(),
		);
		await writeFile(path.join(targetDir, ".gitignore"), generateGitignore());
		await writeFile(path.join(targetDir, "biome.json"), generateBiomeJson());
		await writeFile(
			path.join(targetDir, "eslint.config.mjs"),
			generateEslintConfig(),
		);
	});

	// Write database configuration at monorepo root
	if (db === "supabase") {
		await withSpinner("Setting up Supabase", async () => {
			await writeFile(
				path.join(targetDir, "supabase", "config.toml"),
				generateSupabaseConfig(appName),
			);
			await writeFile(
				path.join(targetDir, "supabase", "seed.sql"),
				generateSupabaseSeed(),
			);
		});
	} else if (db === "postgres") {
		await withSpinner("Setting up PostgreSQL", async () => {
			await writeFile(
				path.join(targetDir, "docker-compose.yml"),
				generateDockerCompose(appName),
			);
		});
	}

	// Write app configuration files
	await withSpinner("Writing app configuration", async () => {
		await writeFile(
			path.join(appDir, "package.json"),
			generateMonorepoAppPackageJson(appName, { auth, db }),
		);
		await writeFile(path.join(appDir, "tsconfig.json"), generateTsConfig());
		await writeFile(
			path.join(appDir, "next.config.ts"),
			generateMonorepoNextConfig(),
		);
		await writeFile(
			path.join(appDir, "postcss.config.mjs"),
			generatePostcssConfig(),
		);

		// Only write drizzle config when db is configured
		if (db) {
			await writeFile(
				path.join(appDir, "drizzle.config.ts"),
				generateDrizzleConfig(db),
			);
		}
	});

	// Write app files
	await withSpinner("Writing app files", async () => {
		await writeFile(
			path.join(appDir, "app", "page.tsx"),
			generatePageTsx(appName),
		);
		await writeFile(
			path.join(appDir, "app", "_components", "hero.tsx"),
			generateHeroTsx(),
		);
		await writeFile(
			path.join(appDir, "app", "_components", "footer.tsx"),
			generateFooterTsx(),
		);

		// Layout depends on auth type
		if (auth === "workos") {
			await writeFile(
				path.join(appDir, "app", "layout.tsx"),
				generateWorkosLayoutTsx(appName),
			);
		} else if (auth === "simple") {
			await writeFile(
				path.join(appDir, "app", "layout.tsx"),
				generateSimpleLayoutTsx(appName),
			);
		} else if (auth === "better-auth") {
			await writeFile(
				path.join(appDir, "app", "layout.tsx"),
				generateBetterAuthLayoutTsx(appName),
			);
		} else {
			await writeFile(
				path.join(appDir, "app", "layout.tsx"),
				generateLayoutTsx(appName),
			);
		}

		await writeFile(
			path.join(appDir, "app", "globals.css"),
			generateGlobalsCss(),
		);
	});

	// Write auth files based on auth type
	if (auth === "workos") {
		await withSpinner("Setting up WorkOS authentication", async () => {
			await writeFile(
				path.join(appDir, "middleware.ts"),
				generateWorkosMiddleware(appName),
			);
			await writeFile(
				path.join(appDir, "app", "callback", "route.ts"),
				generateWorkosCallbackRoute(),
			);
			await writeFile(
				path.join(appDir, "app", "login", "page.tsx"),
				generateWorkosLoginPage(appName),
			);
			await writeFile(
				path.join(appDir, "app", "login", "dev-login-form.tsx"),
				generateDevLoginForm(appName),
			);
			await writeFile(
				path.join(appDir, "app", "api", "auth", "login", "route.ts"),
				generateLoginApiRoute(appName),
			);
		});
	} else if (auth === "simple") {
		await withSpinner("Setting up demo authentication", async () => {
			await writeFile(
				path.join(appDir, "middleware.ts"),
				generateSimpleMiddleware(),
			);
			await writeFile(
				path.join(appDir, "app", "login", "page.tsx"),
				generateSimpleLoginPage(appName),
			);
			await writeFile(
				path.join(appDir, "app", "api", "auth", "login", "route.ts"),
				generateSimpleAuthRoute(),
			);
		});
	} else if (auth === "better-auth") {
		await withSpinner("Setting up Better Auth authentication", async () => {
			// Auth server configuration
			await writeFile(
				path.join(appDir, "lib", "auth.ts"),
				generateBetterAuthServer(db as "postgres" | "supabase"),
			);
			// Auth client for React components
			await writeFile(
				path.join(appDir, "lib", "auth-client.ts"),
				generateBetterAuthClient(),
			);
			// API route handler
			await writeFile(
				path.join(appDir, "app", "api", "auth", "[...all]", "route.ts"),
				generateBetterAuthRoute(),
			);
			// Next.js proxy for auth protection
			await writeFile(path.join(appDir, "proxy.ts"), generateBetterAuthProxy());
			// Login page
			await writeFile(
				path.join(appDir, "app", "login", "page.tsx"),
				generateBetterAuthLoginPage(),
			);
			// Signup page
			await writeFile(
				path.join(appDir, "app", "signup", "page.tsx"),
				generateBetterAuthSignupPage(),
			);
		});
	}

	// Write database client files only when db is configured
	if (db) {
		await withSpinner("Writing database files", async () => {
			await writeFile(
				path.join(appDir, "db", "schema.ts"),
				generateDbSchema({ auth }),
			);

			if (db === "supabase") {
				await writeFile(
					path.join(appDir, "db", "client.ts"),
					generateSupabaseBrowserClient(),
				);
				await writeFile(
					path.join(appDir, "db", "server.ts"),
					generateSupabaseServerClient(),
				);
				await writeFile(
					path.join(appDir, "db", "middleware.ts"),
					generateSupabaseMiddlewareClient(),
				);
			} else {
				await writeFile(
					path.join(appDir, "db", "index.ts"),
					generatePostgresClient(),
				);
			}
		});
	}

	// Copy logo assets
	await withSpinner("Creating assets", async () => {
		const logoSrc = getAssetPath("forge-logo.png");
		await copyFile(logoSrc, path.join(appDir, "public", "forge-logo.png"));
	});

	// Create environment files
	// .env.example gets safe placeholder values (committed to git).
	// .env.local gets real credentials from ~/.forge.json (gitignored).
	await withSpinner("Creating environment files", async () => {
		let envContent = "";
		let envExampleContent = "";

		if (db === "supabase") {
			const supabaseEnv = `# Supabase Local Development
# Run \`supabase start\` from the monorepo root to get these values
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Direct database connection (for Drizzle migrations)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
`;
			envContent += supabaseEnv;
			envExampleContent += supabaseEnv;
		} else if (db === "postgres") {
			const postgresEnv = `# Database (Docker PostgreSQL)
# Run \`docker compose up -d\` from the monorepo root to start the database
DATABASE_URL=postgresql://postgres:postgres@localhost:5400/${appName}
`;
			envContent += postgresEnv;
			envExampleContent += postgresEnv;
		}

		if (auth === "workos") {
			envContent += `
# WorkOS Authentication
WORKOS_CLIENT_ID=${config.workos?.clientId || ""}
WORKOS_API_KEY=${config.workos?.apiKey || ""}
WORKOS_COOKIE_PASSWORD=${crypto.randomBytes(32).toString("base64")}
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback
`;
			envExampleContent += `
# WorkOS Authentication
WORKOS_CLIENT_ID=<your-workos-client-id>
WORKOS_API_KEY=<your-workos-api-key>
WORKOS_COOKIE_PASSWORD=<generate-a-32-byte-base64-key>
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback
`;
		} else if (auth === "better-auth") {
			const betterAuthSecret = crypto.randomBytes(32).toString("base64");
			envContent += `
# Better Auth
BETTER_AUTH_SECRET=${betterAuthSecret}
BETTER_AUTH_URL=http://localhost:3000
`;
			envExampleContent += `
# Better Auth
BETTER_AUTH_SECRET=<generate-a-32-byte-base64-key>
BETTER_AUTH_URL=http://localhost:3000
`;
		}

		const posthogEnv = `
# PostHog Analytics (optional - app works without these)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=
`;
		envContent += posthogEnv;
		envExampleContent += posthogEnv;

		const trailingComment = `
# Add your environment variables here
`;
		envContent += trailingComment;
		envExampleContent += trailingComment;

		await writeFile(path.join(appDir, ".env.example"), envExampleContent);
		await writeFile(path.join(appDir, ".env.local"), envContent);
	});

	// Generate vercel.json if --vercel flag is set
	if (options.vercel) {
		await withSpinner("Generating Vercel configuration", async () => {
			await writeFile(
				path.join(appDir, "vercel.json"),
				generateMonorepoVercelJson({ db }),
			);
		});
	}

	// PostHog analytics (graceful when key is missing)
	await withSpinner("Setting up PostHog analytics", async () => {
		await ensureDir(path.join(appDir, "components", "providers"));
		await writeFile(
			path.join(appDir, "components", "providers", "posthog.tsx"),
			generatePostHogProvider(),
		);
		await ensureDir(path.join(appDir, "lib"));
		await writeFile(
			path.join(appDir, "lib", "posthog.ts"),
			generatePostHogServer(),
		);
	});

	// Structured logging
	await withSpinner("Setting up logging", async () => {
		await ensureDir(path.join(appDir, "lib", "logger"));
		await writeFile(
			path.join(appDir, "lib", "logger", "client.ts"),
			generateClientLogger(),
		);
		await writeFile(
			path.join(appDir, "lib", "logger", "server.ts"),
			generateServerLogger(),
		);
	});

	// Shared packages/ui
	await withSpinner("Setting up packages/ui", async () => {
		const uiDir = path.join(targetDir, "packages", "ui");
		await ensureDir(path.join(uiDir, "src", "components"));
		await ensureDir(path.join(uiDir, "src", "lib"));
		await ensureDir(path.join(uiDir, "src", "hooks"));
		await writeFile(path.join(uiDir, "package.json"), generateUIPackageJson());
		await writeFile(path.join(uiDir, "tsconfig.json"), generateUITsconfig());
		await writeFile(
			path.join(uiDir, "components.json"),
			generateUIComponentsJson(),
		);
		await writeFile(path.join(uiDir, "src", "index.ts"), generateUIIndex());
		await writeFile(
			path.join(uiDir, "src", "lib", "utils.ts"),
			generateUILibUtils(),
		);
	});

	// Vitest test setup
	await withSpinner("Setting up testing", async () => {
		await ensureDir(path.join(appDir, "__tests__", "utils"));
		await ensureDir(path.join(appDir, "__tests__", "factories"));
		await ensureDir(path.join(appDir, "__tests__", "unit"));
		await ensureDir(path.join(appDir, "__tests__", "components"));
		await ensureDir(path.join(appDir, "__tests__", "integration"));
		await writeFile(
			path.join(appDir, "vitest.config.mts"),
			generateVitestConfig(),
		);
		await writeFile(
			path.join(appDir, "vitest.setup.ts"),
			generateVitestSetup(),
		);
		await writeFile(
			path.join(appDir, "__tests__", "utils", "mocks.ts"),
			generateTestMocks(),
		);
		await writeFile(
			path.join(appDir, "__tests__", "utils", "render.tsx"),
			generateTestRenderUtils(),
		);
		await writeFile(
			path.join(appDir, "__tests__", "factories", "user.ts"),
			generateUserFactory(auth === "workos"),
		);
		await writeFile(
			path.join(appDir, "__tests__", "unit", "utils.test.ts"),
			generateUtilsTest(true),
		);
	});

	// GitHub Actions CI
	await withSpinner("Setting up CI workflows", async () => {
		await ensureDir(path.join(targetDir, ".github", "workflows"));
		await writeFile(
			path.join(targetDir, ".github", "workflows", "checks.yml"),
			generateChecksWorkflow(),
		);
		await writeFile(
			path.join(targetDir, ".github", "workflows", "test.yml"),
			generateTestWorkflow(appName, !!db),
		);
	});

	// VS Code config
	await withSpinner("Setting up VS Code config", async () => {
		await ensureDir(path.join(targetDir, ".vscode"));
		await writeFile(
			path.join(targetDir, ".vscode", "extensions.json"),
			generateVSCodeExtensions(),
		);
		await writeFile(
			path.join(targetDir, ".vscode", "settings.json"),
			generateVSCodeSettings(),
		);
	});

	// Cursor config
	await withSpinner("Setting up Cursor config", async () => {
		await ensureDir(path.join(targetDir, ".cursor", "rules"));
		await writeFile(
			path.join(targetDir, ".cursor", "settings.json"),
			generateCursorSettingsJson(),
		);
		// Dynamic rule (depends on isMonorepo and hasDatabase)
		await writeFile(
			path.join(targetDir, ".cursor", "rules", "project-context.mdc"),
			generateCursorProjectContextRule(true, !!db),
		);
		// Static rules copied from assets
		await copyAsset(
			"cursor/rules/typescript-standards.mdc",
			path.join(targetDir, ".cursor", "rules", "typescript-standards.mdc"),
		);
		await copyAsset(
			"cursor/rules/testing.mdc",
			path.join(targetDir, ".cursor", "rules", "testing.mdc"),
		);
		await copyAsset(
			"cursor/rules/git-workflow.mdc",
			path.join(targetDir, ".cursor", "rules", "git-workflow.mdc"),
		);
		await copyAsset(
			"cursor/rules/comment-style.mdc",
			path.join(targetDir, ".cursor", "rules", "comment-style.mdc"),
		);
	});

	// Claude Code integration
	await withSpinner("Setting up Claude Code", async () => {
		await writeFile(
			path.join(targetDir, "CLAUDE.md"),
			generateClaudeMd(repoName, auth, true, !!db),
		);
		await ensureDir(path.join(targetDir, ".claude"));
		await writeFile(
			path.join(targetDir, ".claude", "settings.json"),
			generateClaudeSettingsJson(),
		);
		await writeFile(
			path.join(targetDir, ".claude", "launch.json"),
			generateClaudeLaunchJson(),
		);
		await writeFile(
			path.join(targetDir, ".claude", "claude_desktop_config.example.json"),
			generateClaudeDesktopConfigExample(),
		);
		// Install skills from manifest
		const monoManifest = await loadSkillManifest(options.aiSkills);
		const monoSkills = resolveSkills(monoManifest, { db, auth });
		await installSkills(monoSkills, targetDir, "copy");
	});

	await withSpinner("Writing AI recommendations", async () => {
		await writeFile(
			path.join(targetDir, "FORGE_RECOMMENDATIONS.md"),
			generateForgeRecommendationsMd(),
		);
	});

	// Setup script
	await withSpinner("Creating setup script", async () => {
		await ensureDir(path.join(targetDir, "scripts"));
		await writeFile(
			path.join(targetDir, "scripts", "setup"),
			generateSetupScript(appName, auth === "workos"),
		);
		const { chmod } = await import("node:fs/promises");
		await chmod(path.join(targetDir, "scripts", "setup"), 0o755);

		if (db === "postgres") {
			await writeFile(
				path.join(targetDir, "scripts", "db-start"),
				generateDockerStartScript(),
			);
			await chmod(path.join(targetDir, "scripts", "db-start"), 0o755);
		}

		if (db === "supabase") {
			await writeFile(
				path.join(targetDir, "scripts", "supabase-start"),
				generateSupabaseStartScript(),
			);
			await chmod(path.join(targetDir, "scripts", "supabase-start"), 0o755);
		}
	});

	if (!options.skipInstall) {
		// Install dependencies
		await withSpinner("Installing dependencies", async () => {
			await pnpmInstall(targetDir);
		});

		// Initialize shadcn in packages/ui (components.json + lib/utils.ts are generated earlier)
		const uiDir = path.join(targetDir, "packages", "ui");
		const monorepoComponentsConfigPath = path.join(uiDir, "components.json");
		if (await fileExists(monorepoComponentsConfigPath)) {
			log.info("shadcn init skipped (components.json already exists)");
		} else {
			await withSpinner("Initializing shadcn/ui", async () => {
				try {
					await execCommand("pnpm", ["dlx", "shadcn@latest", "init", "-y"], {
						cwd: uiDir,
					});
				} catch {
					log.warn(
						"shadcn init failed. You can run it manually in packages/ui.",
					);
				}
			});
		}

		// Add shadcn components to packages/ui
		await withSpinner("Adding shadcn components", async () => {
			try {
				await execCommand(
					"pnpm",
					["dlx", "shadcn@latest", "add", ...shadcnComponents, "-y"],
					{ cwd: uiDir },
				);
			} catch {
				log.warn(
					"Some shadcn components may not have been added. You can add them manually.",
				);
			}
		});

		// Format with Biome
		await withSpinner("Formatting with Biome", async () => {
			try {
				await execCommand("pnpm", ["format"], { cwd: targetDir });
			} catch {
				// Non-critical if format fails
			}
		});
	}

	// Remove auto-generated files that should stay gitignored
	await removeFile(path.join(appDir, "next-env.d.ts"));

	// Always initialize git repository
	const gitDir = path.join(targetDir, ".git");
	const isGitRepo = await fileExists(gitDir);

	if (!isGitRepo) {
		await withSpinner("Initializing git repository", async () => {
			await gitInit(targetDir);
			await gitAdd(targetDir, ".");
			await gitCommit("Initial commit - Created by Forge", targetDir);
		});
	}

	// Set up GitHub remote if --github flag is set
	if (options.github) {
		try {
			await setupGit(targetDir, repoName);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error(`GitHub setup failed: ${message}`);
			log.info(`You can retry later with: forge setup-git ${targetDir}`);
		}
	}

	// Provision Supabase cloud project if --supabase flag is set
	if (options.supabase) {
		try {
			const supabaseResult = await setupSupabase(
				targetDir,
				appName,
				config.supabase?.token,
			);
			if (supabaseResult?.databaseUrl) {
				await writeFile(
					path.join(appDir, ".env.development.local"),
					`# Cloud Supabase — loaded by Next.js during \`next dev\`, overrides .env.local\nDATABASE_URL=${supabaseResult.databaseUrl}\n`,
				);
				log.success("Cloud DATABASE_URL written to .env.development.local");
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error(`Supabase provisioning failed: ${message}`);
			log.info("You can provision later with: supabase projects create");
		}
	}

	// Set up Vercel if --vercel flag is set
	if (options.vercel) {
		await setupVercel(targetDir, appName, { auth, db, appName });
	}

	log.success(
		`\n✨ Created monorepo ${repoName} with app ${appName} at ${targetDir}`,
	);
	log.info("\nNext steps:");
	log.step(`  cd ${path.relative(process.cwd(), targetDir)}`);

	if (db === "supabase") {
		log.step("  supabase start");
		log.step(`  cd apps/${appName} && pnpm db:push && cd ../..`);
	} else if (db === "postgres") {
		log.step("  docker compose up -d");
		log.step(`  cd apps/${appName} && pnpm db:push && cd ../..`);
	}

	if (
		auth === "workos" &&
		!(config.workos?.clientId && config.workos?.apiKey)
	) {
		log.step(`  # Configure WorkOS credentials in apps/${appName}/.env.local:`);
		log.step("  #   WORKOS_CLIENT_ID, WORKOS_API_KEY");
	}

	// Suggest Vercel setup later when not already configured during creation.
	if (!options.vercel && !options.vercelSkipped) {
		log.blank();
		log.info("To set up Vercel later:");
		log.step(
			`  forge update ${path.relative(process.cwd(), targetDir)} --vercel${auth !== "none" ? ` --auth ${auth}` : ""}${db ? ` --db ${db}` : ""}`,
		);
	}
	// Suggest Supabase provisioning when using local supabase without --supabase
	if (db === "supabase" && !options.supabase) {
		log.blank();
		log.info("To provision a Supabase cloud project later:");
		log.step("  supabase projects create");
	}

	log.step("  pnpm dev");
}
export const newCommand = new Command("new")
	.description("Create a new Forge-standard app")
	.argument("<app-name>", "Name of the app to create")
	.option(
		"--monorepo <path>",
		"Create a Turborepo monorepo at the specified path",
	)
	.option(
		"--auth <type>",
		"Authentication type: workos, simple, or better-auth (omit for none)",
	)
	.option("--db <type>", "Database type: postgres or supabase (omit for none)")
	.option(
		"--github",
		"Create and push to a GitHub remote repo under your configured org",
	)
	.option("--vercel", "Set up Vercel project and deployment configuration")
	.option(
		"--supabase",
		"Provision a Supabase cloud project (implies --db supabase)",
	)
	.option(
		"--ci",
		"Non-interactive mode: skip all prompts, auto-overwrite existing dirs",
	)
	.option(
		"--skip-install",
		"Skip pnpm install, shadcn, and biome format (for file-structure-only tests)",
	)
	.option(
		"--ai-skills <path>",
		"Path to a custom skills.json manifest (default: built-in)",
	)
	.action(async (appName: string, options: NewOptions) => {
		// Validate auth option
		if (
			options.auth &&
			!["workos", "simple", "better-auth"].includes(options.auth)
		) {
			log.error(
				`Invalid auth type: ${options.auth}. Use 'workos', 'simple', or 'better-auth'.`,
			);
			process.exit(1);
		}

		// Better Auth requires a database
		if (options.auth === "better-auth" && !options.db && !options.supabase) {
			log.error(
				"--auth better-auth requires a database. Specify --db postgres, --db supabase, or --supabase.",
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

		// --supabase implies --db supabase
		if (options.supabase) {
			if (options.db && options.db !== "supabase") {
				log.error(
					`--supabase conflicts with --db ${options.db}. Remove one of the flags.`,
				);
				process.exit(1);
			}
			options.db = "supabase";
		}

		// Fail fast: validate GitHub access before scaffolding when --github is used
		if (options.github) {
			const isAuthenticated = await ghAuthStatus();
			if (!isAuthenticated) {
				log.error(
					"Cannot reach GitHub. A valid GitHub token is required to push a remote repository.",
				);
				log.info("");
				log.info("To fix this, either:");
				log.step("  1. Run 'forge config' to set up your tokens");
				log.step("  2. Run 'gh auth login' to authenticate the GitHub CLI");
				log.info("");
				log.info("Once authenticated, re-run your command with --github.");
				process.exit(1);
			}
		}

		// Lazily install dependencies for selected capabilities before scaffolding starts.
		let vercelTeam: string | undefined;
		if (options.vercel) {
			vercelTeam = (await loadConfig()).vercel?.team;
			if (!vercelTeam) {
				log.error(
					"No Vercel team configured. Run 'forge config' to set one before using --vercel.",
				);
				process.exit(1);
			}
			await withSpinner("Preparing Vercel CLI", async () => {
				await ensureVercelCLI();
			});
		}
		if (!options.ci && options.db === "postgres") {
			await withSpinner("Preparing PostgreSQL local tooling", async () => {
				await ensureDocker();
				await ensurePostgresClient();
			});
		}
		if (!options.ci && options.db === "supabase") {
			await withSpinner("Preparing Supabase local tooling", async () => {
				await ensureDockerRunning();
				await ensureSupabaseCLI();
				await ensurePostgresClient();
			});
		}

		if (options.monorepo) {
			log.warn(
				"⚠️  Monorepo mode is experimental and has not been fully tested. Proceed with caution.",
			);

			// For monorepo: app name is the argument, monorepo path is the option value
			const targetDir = path.resolve(process.cwd(), options.monorepo);
			const repoName = path.basename(targetDir);

			// Pre-flight: check if local directory already exists
			if (await fileExists(targetDir)) {
				if (options.ci) {
					await withSpinner(
						`Removing existing directory: ${options.monorepo}`,
						async () => {
							await removeDir(targetDir);
						},
					);
				} else {
					log.warn(`Directory "${options.monorepo}" already exists.`);
					const { overwrite } = await prompts({
						type: "confirm",
						name: "overwrite",
						message: "Do you want to overwrite it?",
						initial: false,
					});
					if (!overwrite) {
						log.info("Aborting.");
						return;
					}
					await withSpinner(
						`Removing existing directory: ${options.monorepo}`,
						async () => {
							await removeDir(targetDir);
						},
					);
				}
			}

			// Pre-flight: check if Vercel project already exists
			if (options.vercel) {
				const exists = await vercelProjectExists(appName, vercelTeam as string);
				if (exists) {
					if (options.ci) {
						log.info("Skipping Vercel setup (CI mode).");
						options.vercel = false;
						options.vercelSkipped = true;
					} else {
						log.warn(`Vercel project "${appName}" already exists.`);
						const { relink } = await prompts({
							type: "confirm",
							name: "relink",
							message:
								"Would you like to relink the repository to this Vercel project?",
							initial: true,
						});
						if (!relink) {
							log.info("Skipping Vercel setup.");
							options.vercel = false;
							options.vercelSkipped = true;
						}
					}
				}
			}

			await createMonorepoApp(appName, repoName, targetDir, options);
		} else {
			// For standalone: resolve the directory and extract a clean app name
			const targetDir = path.resolve(process.cwd(), appName);
			const resolvedName = path.basename(targetDir);

			// Pre-flight: check if local directory already exists
			if (await fileExists(targetDir)) {
				if (options.ci) {
					// In CI mode, automatically overwrite existing directories
					await withSpinner(
						`Removing existing directory: ${appName}`,
						async () => {
							await removeDir(targetDir);
						},
					);
				} else {
					log.warn(`Directory "${appName}" already exists.`);
					const { overwrite } = await prompts({
						type: "confirm",
						name: "overwrite",
						message: "Do you want to overwrite it?",
						initial: false,
					});
					if (!overwrite) {
						log.info("Aborting.");
						return;
					}
					await withSpinner(
						`Removing existing directory: ${appName}`,
						async () => {
							await removeDir(targetDir);
						},
					);
				}
			}

			// Pre-flight: check if Vercel project already exists
			if (options.vercel) {
				const exists = await vercelProjectExists(
					resolvedName,
					vercelTeam as string,
				);
				if (exists) {
					if (options.ci) {
						log.info("Skipping Vercel setup (CI mode).");
						options.vercel = false;
						options.vercelSkipped = true;
					} else {
						log.warn(`Vercel project "${resolvedName}" already exists.`);
						const { relink } = await prompts({
							type: "confirm",
							name: "relink",
							message:
								"Would you like to relink the repository to this Vercel project?",
							initial: true,
						});
						if (!relink) {
							log.info("Skipping Vercel setup.");
							options.vercel = false;
							options.vercelSkipped = true;
						}
					}
				}
			}

			await createStandaloneApp(resolvedName, targetDir, options);
		}
	});
