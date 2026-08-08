import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import type { ForgeConfig } from "../types/config.js";

const DEFAULT_CONFIG_FILENAME = ".forge.json";

/**
 * Get the default config file path in the user's home directory.
 */
export function getDefaultConfigPath(): string {
	return path.join(os.homedir(), DEFAULT_CONFIG_FILENAME);
}

/**
 * Load configuration from a JSON file.
 * @param configPath Optional path to config file. Defaults to ~/.forge.json
 * @returns The configuration object, or an empty object if file doesn't exist
 */
export async function loadConfig(configPath?: string): Promise<ForgeConfig> {
	const filePath = configPath || getDefaultConfigPath();

	if (!(await fs.pathExists(filePath))) {
		return {};
	}

	try {
		const config = await fs.readJson(filePath);
		return config as ForgeConfig;
	} catch (error) {
		throw new Error(
			`Failed to parse config file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Save configuration to a JSON file with pretty formatting.
 * @param config The configuration object to save
 * @param configPath Optional path to config file. Defaults to ~/.forge.json
 */
export async function saveConfig(
	config: ForgeConfig,
	configPath?: string,
): Promise<void> {
	const filePath = configPath || getDefaultConfigPath();

	try {
		await fs.writeJson(filePath, config, { spaces: 2, mode: 0o600 });
		await fs.chmod(filePath, 0o600);
	} catch (error) {
		throw new Error(
			`Failed to write config file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Check if a config file exists.
 * @param configPath Optional path to config file. Defaults to ~/.forge.json
 */
export async function configExists(configPath?: string): Promise<boolean> {
	const filePath = configPath || getDefaultConfigPath();
	return await fs.pathExists(filePath);
}

/**
 * Basic validation of config structure.
 * @param config The configuration object to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateConfig(config: ForgeConfig): string[] {
	const errors: string[] = [];

	// Validate GitHub config
	if (config.github) {
		if (!config.github.token) {
			errors.push("GitHub token is missing");
		}
	}

	// Validate Vercel config
	if (config.vercel) {
		if (!config.vercel.token) {
			errors.push("Vercel token is missing");
		}
	}

	// Validate database config
	if (config.database) {
		if (!["postgres", "supabase"].includes(config.database.type)) {
			errors.push("Database type must be 'postgres' or 'supabase'");
		}

		// If Supabase is selected, validate Supabase config
		if (config.database.type === "supabase") {
			if (!config.supabase) {
				errors.push(
					"Supabase config is missing but database type is 'supabase'",
				);
			} else {
				if (!config.supabase.token) {
					errors.push("Supabase token is missing");
				}
				if (!config.supabase.org) {
					errors.push("Supabase org is missing");
				}
			}
		}
	}

	// Validate envVars
	if (config.envVars) {
		for (const envVar of config.envVars) {
			if (!envVar.key) {
				errors.push("Environment variable is missing key");
			}
			if (!envVar.environments || envVar.environments.length === 0) {
				errors.push(
					`Environment variable ${envVar.key} has no environments specified`,
				);
			}
		}
	}

	return errors;
}
