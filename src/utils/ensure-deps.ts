import path from "node:path";
import { execCommand } from "./exec.js";
import { log } from "./logger.js";
import { getForgeRoot } from "./version.js";

/** Absolute path to the vercel CLI binary bundled with forge. */
export function getVercelBin(): string {
	return path.join(getForgeRoot(), "node_modules", ".bin", "vercel");
}

async function commandExists(command: string): Promise<boolean> {
	try {
		await execCommand("which", [command]);
		return true;
	} catch {
		return false;
	}
}

async function ensureBrewAvailable(): Promise<void> {
	if (await commandExists("brew")) {
		return;
	}

	log.error("Homebrew is required to install this dependency.");
	log.info("Install Homebrew first: https://brew.sh/");
	process.exit(1);
}

/**
 * No-op: vercel is bundled as a local dependency of forge and resolved via
 * getVercelBin(). Nothing to install or check at runtime.
 */
export async function ensureVercelCLI(): Promise<void> {}

export async function ensureDocker(): Promise<void> {
	if (await commandExists("docker")) {
		return;
	}

	await ensureBrewAvailable();
	log.info(
		"Installing Docker Desktop - needed to run a local Postgres database.",
	);
	await execCommand("brew", ["install", "--cask", "docker"]);
	log.success("Docker Desktop ready");
	log.info("Launch Docker Desktop once to finish setup.");
}

/**
 * Verify the Docker daemon is actually running (not just installed).
 * Surfaces clear, friendly guidance for both engineers and non-engineers.
 */
export async function ensureDockerRunning(): Promise<void> {
	try {
		await execCommand("docker", ["info"]);
		return;
	} catch {
		// Docker daemon is not running — give actionable guidance
	}

	log.blank();
	log.error("Docker is not running.");
	log.blank();
	log.info("Docker is required to run your local database.");
	log.info(
		"Here's how to start it depending on how you have Docker installed:",
	);
	log.blank();
	log.step("Option 1 — Docker Desktop (most common):");
	log.info(
		'  Open the Docker Desktop app on your Mac. Look for the whale icon in your menu bar — if it\'s not there, open "Docker Desktop" from your Applications folder.',
	);
	log.blank();
	log.step("Option 2 — Homebrew (advanced):");
	log.info("  brew services start colima");
	log.info("  or: open -a Docker");
	log.blank();
	log.info(
		"Once Docker is running, come back here and run the same command again.",
	);
	log.blank();
	process.exit(1);
}

/** Minimum Supabase CLI version required for stable --password + --yes support. */
const SUPABASE_MIN_VERSION = "2.78.0";

function parseVersion(v: string): [number, number, number] {
	const match = v.trim().match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) return [0, 0, 0];
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionBelow(
	installed: [number, number, number],
	min: [number, number, number],
): boolean {
	for (let i = 0; i < 3; i++) {
		if (installed[i] < min[i]) return true;
		if (installed[i] > min[i]) return false;
	}
	return false;
}

export async function ensureSupabaseCLI(): Promise<void> {
	if (await commandExists("supabase")) {
		// Check version and upgrade if below minimum required
		try {
			const { stdout } = await execCommand("supabase", ["--version"]);
			const installed = parseVersion(stdout);
			const min = parseVersion(SUPABASE_MIN_VERSION);
			if (isVersionBelow(installed, min)) {
				log.info(
					`Supabase CLI v${stdout.trim()} is below minimum v${SUPABASE_MIN_VERSION}. Upgrading...`,
				);
				await ensureBrewAvailable();
				try {
					await execCommand("brew", ["tap", "supabase/tap"]);
				} catch {
					// Tap may already exist.
				}
				await execCommand("brew", ["upgrade", "supabase/tap/supabase"]);
				log.success("Supabase CLI upgraded");
			}
		} catch {
			// Non-fatal — version check is best-effort.
		}
		return;
	}

	await ensureBrewAvailable();
	log.info(
		"Installing Supabase CLI - needed to manage your local Supabase instance.",
	);
	try {
		await execCommand("brew", ["tap", "supabase/tap"]);
	} catch {
		// Continue if tap already exists or returns a benign warning.
	}
	await execCommand("brew", ["install", "supabase"]);
	log.success("Supabase CLI ready");
}

export async function ensurePostgresClient(): Promise<void> {
	if (await commandExists("psql")) {
		return;
	}

	await ensureBrewAvailable();
	log.info(
		"Installing PostgreSQL client tools - needed to run database migrations.",
	);
	await execCommand("brew", ["install", "postgresql@16"]);
	log.success("PostgreSQL client tools ready");
}
