import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import prompts from "prompts";
import type { EnvVar, ForgeConfig } from "../types/config.js";
import {
	getDefaultConfigPath,
	loadConfig,
	saveConfig,
} from "../utils/config-manager.js";
import { execCommand, vercelGetAuthToken } from "../utils/exec.js";
import { log } from "../utils/logger.js";
import {
	validateGitHubToken,
	validateSupabaseToken,
	validateVercelToken,
} from "../utils/token-validator.js";

// ── Token Resolution ────────────────────────────────────────────────

/**
 * Attempt to get the GitHub token from the gh CLI.
 */
async function getGhCliToken(): Promise<string | null> {
	try {
		const { stdout } = await execCommand("gh", ["auth", "token"]);
		const token = stdout.trim();
		return token || null;
	} catch {
		return null;
	}
}

/**
 * Resolve GitHub token from various sources.
 */
async function resolveGitHubToken(): Promise<string | null> {
	// Check environment variables
	const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (envToken) {
		return envToken;
	}

	// Check gh CLI
	const ghToken = await getGhCliToken();
	if (ghToken) {
		return ghToken;
	}

	return null;
}

/**
 * Get GitHub org, email, and name from git config.
 */
async function getGitMetadata(): Promise<{
	email?: string;
	name?: string;
}> {
	const metadata: { email?: string; name?: string } = {};

	try {
		const { stdout: email } = await execCommand("git", [
			"config",
			"--global",
			"user.email",
		]);
		metadata.email = email.trim();
	} catch {
		// Ignore if not set
	}

	try {
		const { stdout: name } = await execCommand("git", [
			"config",
			"--global",
			"user.name",
		]);
		metadata.name = name.trim();
	} catch {
		// Ignore if not set
	}

	return metadata;
}

/**
 * Resolve Vercel token from various sources.
 */
async function resolveVercelToken(): Promise<string | null> {
	// Check environment variable
	const envToken = process.env.VERCEL_TOKEN;
	if (envToken) {
		return envToken;
	}

	// Check Vercel CLI auth file
	const cliToken = await vercelGetAuthToken();
	if (cliToken) {
		return cliToken;
	}

	return null;
}

/**
 * Resolve Supabase token from various sources.
 */
async function resolveSupabaseToken(): Promise<string | null> {
	// Check environment variable
	const envToken = process.env.SUPABASE_ACCESS_TOKEN;
	if (envToken) {
		return envToken;
	}

	// Check macOS keychain
	if (process.platform === "darwin") {
		try {
			const { stdout } = await execCommand("security", [
				"find-generic-password",
				"-s",
				"Supabase CLI",
				"-w",
			]);
			const keychainValue = stdout.trim();

			// Supabase stores it as "go-keyring-base64:<base64>" or just the token
			if (keychainValue.startsWith("go-keyring-base64:")) {
				const base64Token = keychainValue.replace("go-keyring-base64:", "");
				return Buffer.from(base64Token, "base64").toString("utf-8");
			}
			if (keychainValue) {
				return keychainValue;
			}
		} catch {
			// Not in keychain
		}
	}

	// Check config files
	const configPaths = [
		path.join(os.homedir(), ".supabase", "access-token"),
		path.join(os.homedir(), ".config", "supabase", "access-token"),
	];

	for (const configPath of configPaths) {
		try {
			const fs = await import("node:fs/promises");
			const token = await fs.readFile(configPath, "utf-8");
			return token.trim();
		} catch {
			// Continue to next path
		}
	}

	return null;
}

/**
 * Normalize user-provided token values that may include accidental wrapping quotes.
 */
function normalizeSecretValue(value?: string | null): string | undefined {
	if (!value) {
		return undefined;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		const unwrapped = trimmed.slice(1, -1).trim();
		return unwrapped || undefined;
	}

	return trimmed;
}

// ── Main Config Flow ────────────────────────────────────────────────

async function runConfig(options: {
	output?: string;
	refresh?: boolean;
}): Promise<void> {
	const configPath = options.output || getDefaultConfigPath();

	log.blank();
	log.step("Setting up forge");
	log.info("We'll save your credentials locally in ~/.forge.json.");
	log.info("That keeps future project setup fast and repeatable.");
	log.blank();

	// Load existing config if present
	const existingConfig = await loadConfig(configPath);
	const config: ForgeConfig = { ...existingConfig };

	// ── GitHub ────────────────────────────────────────────────────────
	log.info("GitHub");

	let githubToken = await resolveGitHubToken();
	if (!githubToken) {
		log.info(
			"Generate one at: https://github.com/settings/tokens (repo + read:org scopes)",
		);
		const response = await prompts({
			type: "password",
			name: "token",
			message: "Paste your GitHub personal access token:",
			validate: (value: string) =>
				value.trim().length > 0 || "Token cannot be empty",
		});
		githubToken = response.token?.trim();
	} else {
		log.success("GitHub token found");
	}

	if (!githubToken) {
		log.error("GitHub token is required");
		process.exit(1);
	}

	// Get git metadata
	const gitMetadata = await getGitMetadata();

	// Prompt for GitHub org if not in refresh mode or not already set
	let githubOrg = existingConfig.github?.org;
	if (!options.refresh || !githubOrg) {
		const orgResponse = await prompts({
			type: "text",
			name: "org",
			message:
				"Enter your GitHub organization (optional, press Enter to leave unset):",
			initial: existingConfig.github?.org || "",
		});
		githubOrg = orgResponse.org?.trim() || undefined;
	}

	config.github = {
		org: githubOrg,
		token: githubToken,
		email: gitMetadata.email,
		name: gitMetadata.name,
	};

	log.blank();

	// ── Vercel ────────────────────────────────────────────────────────
	log.info("Vercel");
	log.info(
		"Only needed if you plan to deploy with 'forge new --vercel' or 'forge setup-vercel'.",
	);

	if (!options.refresh || !existingConfig.vercel?.token) {
		const configureVercel = await prompts({
			type: "confirm",
			name: "configure",
			message: "Configure Vercel deployment credentials?",
			initial: !!existingConfig.vercel?.token,
		});

		if (configureVercel.configure) {
			let vercelToken = await resolveVercelToken();
			if (!vercelToken) {
				log.info(
					"Create a token at: https://vercel.com/account/settings/tokens",
				);
				const response = await prompts({
					type: "password",
					name: "token",
					message: "Paste your Vercel access token:",
					validate: (value: string) =>
						value.trim().length > 0 || "Token cannot be empty",
				});
				vercelToken = response.token?.trim();
			} else {
				log.success("Vercel token found");
			}

			if (!vercelToken) {
				log.error("Vercel token cannot be empty");
				process.exit(1);
			}

			const teamResponse = await prompts({
				type: "text",
				name: "team",
				message:
					"Enter your Vercel team slug (optional, press Enter to leave unset):",
				initial: existingConfig.vercel?.team || "",
			});

			config.vercel = {
				team: teamResponse.team?.trim() || undefined,
				token: vercelToken,
			};

			log.success("Vercel credentials configured");
		} else {
			config.vercel = existingConfig.vercel;
		}
	}

	log.blank();

	// ── Database Selection ────────────────────────────────────────────
	if (!options.refresh || !existingConfig.database) {
		log.info("Database");

		const dbResponse = await prompts({
			type: "select",
			name: "type",
			message: "Which database will you use?",
			choices: [
				{
					title:
						"Postgres - local Docker for dev, hosted Postgres for production",
					value: "postgres",
				},
				{
					title: "Supabase - managed Postgres with auth, storage, and realtime",
					value: "supabase",
				},
			],
			initial: existingConfig.database?.type === "supabase" ? 1 : 0,
		});

		config.database = { type: dbResponse.type };

		// ── Supabase (conditional) ────────────────────────────────────
		if (config.database.type === "supabase") {
			log.blank();
			log.info("Configuring Supabase...");

			let supabaseToken = await resolveSupabaseToken();
			if (!supabaseToken) {
				log.info("Run 'supabase login' first, or paste your access token.");
				const response = await prompts({
					type: "password",
					name: "token",
					message: "Paste your Supabase access token:",
					validate: (value: string) =>
						value.trim().length > 0 || "Token cannot be empty",
				});
				supabaseToken = response.token?.trim();
			} else {
				log.success(`Found Supabase token (${supabaseToken.slice(0, 8)}****)`);
			}

			if (!supabaseToken) {
				log.error("Supabase token is required when using Supabase");
				process.exit(1);
			}

			// Prompt for org and region
			const supabaseOrgResponse = await prompts({
				type: "text",
				name: "org",
				message: "Enter your Supabase organization ID (slug):",
				initial: existingConfig.supabase?.org,
			});

			const supabaseRegionResponse = await prompts({
				type: "text",
				name: "region",
				message: "Enter your preferred Supabase region:",
				initial: existingConfig.supabase?.region || "us-east-1",
			});

			config.supabase = {
				org: supabaseOrgResponse.org?.trim(),
				region: supabaseRegionResponse.region?.trim(),
				token: supabaseToken,
			};
		} else {
			// Postgres selected - no Supabase config needed
			config.supabase = undefined;
		}

		log.blank();
	}

	// ── WorkOS (optional shared defaults) ─────────────────────────────
	if (!options.refresh || !existingConfig.workos) {
		const configureWorkos = await prompts({
			type: "confirm",
			name: "configure",
			message:
				"Configure default WorkOS credentials? (used when --auth workos is passed)",
			initial: !!existingConfig.workos,
		});

		if (configureWorkos.configure) {
			log.blank();
			log.info("Configuring WorkOS defaults (https://dashboard.workos.com)...");
			log.info(
				"These will be used as shared defaults for new projects with --auth workos.",
			);

			const clientIdResponse = await prompts({
				type: "text",
				name: "clientId",
				message: "Enter your WORKOS_CLIENT_ID:",
				initial: existingConfig.workos?.clientId,
				validate: (value: string) =>
					value.trim().length > 0 || "Client ID cannot be empty",
			});

			const apiKeyResponse = await prompts({
				type: "password",
				name: "apiKey",
				message: "Enter your WORKOS_API_KEY:",
				validate: (value: string) =>
					value.trim().length > 0 || "API key cannot be empty",
			});

			config.workos = {
				clientId: clientIdResponse.clientId?.trim(),
				apiKey: apiKeyResponse.apiKey?.trim(),
			};

			log.success("WorkOS defaults configured");
		} else {
			config.workos = existingConfig.workos;
		}

		log.blank();
	}

	// ── PostHog Analytics ─────────────────────────────────────────────
	if (!options.refresh || !config.posthog?.projectApiKey) {
		const existingPosthog = config.posthog || existingConfig.posthog;
		const configurePosthogResponse = await prompts({
			type: "confirm",
			name: "configure",
			message: "Would you like to configure PostHog analytics?",
			initial: !!existingPosthog?.projectApiKey,
		});

		if (configurePosthogResponse.configure) {
			const apiKeyResponse = await prompts({
				type: "text",
				name: "projectApiKey",
				message: "PostHog project API key (NEXT_PUBLIC_POSTHOG_KEY):",
				initial: existingPosthog?.projectApiKey || "",
				validate: (value: string) =>
					value.trim().length > 0 || "API key cannot be empty",
			});

			const hostResponse = await prompts({
				type: "text",
				name: "host",
				message: "PostHog host (leave default for US cloud):",
				initial: existingPosthog?.host || "https://us.i.posthog.com",
			});

			const posthogKey = normalizeSecretValue(apiKeyResponse.projectApiKey);
			if (!posthogKey) {
				log.error("PostHog API key cannot be empty");
				process.exit(1);
			}

			config.posthog = {
				projectApiKey: posthogKey,
				host: hostResponse.host?.trim() || "https://us.i.posthog.com",
			};

			log.success("PostHog analytics configured");
		} else {
			config.posthog = existingConfig.posthog;
		}

		log.blank();
	}

	// ── Custom Environment Variables ──────────────────────────────────
	if (!options.refresh) {
		const addEnvVarsResponse = await prompts({
			type: "confirm",
			name: "addEnvVars",
			message: "Would you like to add custom environment variables?",
			initial: false,
		});

		if (addEnvVarsResponse.addEnvVars) {
			const envVars: EnvVar[] = [];
			let addMore = true;

			while (addMore) {
				log.blank();

				const keyResponse = await prompts({
					type: "text",
					name: "key",
					message: "Environment variable name:",
				});

				if (!keyResponse.key) break;

				const valueResponse = await prompts({
					type: "password",
					name: "value",
					message: `Value for ${keyResponse.key}:`,
				});

				const environmentsResponse = await prompts({
					type: "multiselect",
					name: "environments",
					message: "Which environments should this variable be set in?",
					choices: [
						{ title: "Production", value: "production", selected: true },
						{ title: "Preview", value: "preview", selected: true },
						{ title: "Development", value: "development", selected: true },
					],
				});

				const sensitiveResponse = await prompts({
					type: "confirm",
					name: "sensitive",
					message: "Is this a sensitive value?",
					initial: true,
				});

				const value = valueResponse.value?.trim();
				if (value === undefined) break;

				envVars.push({
					key: keyResponse.key.trim(),
					value,
					environments: environmentsResponse.environments,
					sensitive: sensitiveResponse.sensitive,
				});

				const continueResponse = await prompts({
					type: "confirm",
					name: "continue",
					message: "Add another environment variable?",
					initial: false,
				});

				addMore = continueResponse.continue;
			}

			config.envVars = envVars;
		}
	}

	// ── Save Configuration ────────────────────────────────────────────
	await saveConfig(config, configPath);

	log.blank();
	log.success(`Configuration saved to ${configPath}`);
	log.blank();
	log.info("Summary:");
	log.info(
		`  GitHub: ${config.github?.org || "no org set"} (${config.github?.email || "no email"})`,
	);
	log.info(`  Vercel: ${config.vercel?.team || "no team set"}`);
	log.info(`  Database: ${config.database?.type || "not configured"}`);
	if (config.supabase) {
		log.info(`  Supabase: ${config.supabase.org} (${config.supabase.region})`);
	}
	if (config.workos) {
		log.info(`  WorkOS: ${config.workos.clientId} (default credentials)`);
	}
	if (config.envVars && config.envVars.length > 0) {
		log.info(`  Custom env vars: ${config.envVars.length}`);
	}

	const suggestedDbFlag = config.database?.type
		? ` --db ${config.database.type}`
		: "";
	const suggestedAuthFlag =
		config.workos?.clientId && config.workos?.apiKey ? " --auth workos" : "";
	const suggestedNewCommand = `forge new my-app${suggestedDbFlag}${suggestedAuthFlag} --vercel`;

	log.blank();
	log.info("Start your first project:");
	log.step(`  ${suggestedNewCommand}`);
	log.info("Or explore commands:");
	log.step("  forge --help");
	log.blank();
}

// ── Config Check Subcommand ─────────────────────────────────────────

async function runConfigCheck(options: { json?: boolean }): Promise<void> {
	const configPath = getDefaultConfigPath();
	const config = await loadConfig(configPath);

	const results: Record<string, { valid: boolean; error?: string }> = {};

	// Validate GitHub
	if (config.github?.token) {
		log.info("Validating GitHub token...");
		const result = await validateGitHubToken(config.github.token);
		results.github = { valid: result.valid, error: result.error };
	} else {
		results.github = { valid: false, error: "No GitHub token configured" };
	}

	// Validate Vercel
	if (config.vercel?.token) {
		log.info("Validating Vercel token...");
		const result = await validateVercelToken(
			config.vercel.token,
			config.vercel.team,
		);
		results.vercel = { valid: result.valid, error: result.error };
	} else {
		results.vercel = { valid: false, error: "No Vercel token configured" };
	}

	// Validate Supabase (if configured)
	if (config.supabase?.token) {
		log.info("Validating Supabase token...");
		const result = await validateSupabaseToken(config.supabase.token);
		results.supabase = { valid: result.valid, error: result.error };
	}

	// Output results
	if (options.json) {
		console.log(JSON.stringify(results, null, 2));
	} else {
		log.blank();
		log.info("Validation Results:");
		log.blank();

		for (const [service, result] of Object.entries(results)) {
			if (result.valid) {
				log.success(`${service}: Valid`);
			} else {
				log.error(`${service}: Invalid - ${result.error}`);
			}
		}

		log.blank();
	}

	// Exit with error code if any validation failed
	const allValid = Object.values(results).every((r) => r.valid);
	if (!allValid) {
		process.exit(1);
	}
}

// ── Command Definition ──────────────────────────────────────────────

export const configCommand = new Command()
	.name("config")
	.description("Configure GitHub, Vercel, and database credentials")
	.option("-o, --output <path>", "Output path for config file")
	.option("--refresh", "Refresh tokens, keep existing metadata")
	.action(runConfig);

// Add check subcommand
const checkCommand = new Command()
	.name("check")
	.description("Validate tokens in config file")
	.option("--json", "Output as JSON")
	.action(runConfigCheck);

configCommand.addCommand(checkCommand);
