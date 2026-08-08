/**
 * Browser integration tests for Better Auth signup/login flow.
 *
 * These tests verify that a scaffolded Better Auth app:
 * 1. Starts successfully with `pnpm dev`
 * 2. Shows the signup page
 * 3. Allows account creation
 * 4. Redirects to home after signup
 * 5. Allows login with created credentials
 *
 * Requires: Docker (for PostgreSQL), agent-browser CLI
 *
 * Run manually with: pnpm test:integration
 * NOT included in standard `pnpm test` or CI workflows.
 */
import { type ChildProcess, execSync, spawn } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const FORGE_CLI = join(FORGE_ROOT, "src/index.ts");

// Use a unique port to avoid conflicts with other running postgres instances
const TEST_DB_PORT = 5533;

function run(cmd: string, cwd: string, timeoutMs = 180_000): string {
	return execSync(cmd, { cwd, timeout: timeoutMs, encoding: "utf8" });
}

// Default scaffold port for postgres (matches docker-compose.ts template)
const SCAFFOLD_DB_PORT = 5400;

// Generate unique test credentials for each test run to avoid "User already exists" errors
const TEST_EMAIL = `tester-${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-123";

/**
 * Update docker-compose.yml and .env.local to use a unique port for the test database.
 */
function patchDbPort(appDir: string): void {
	// Patch docker-compose.yml
	const dockerComposePath = join(appDir, "docker-compose.yml");
	let dockerCompose = readFileSync(dockerComposePath, "utf8");
	dockerCompose = dockerCompose.replace(
		`"${SCAFFOLD_DB_PORT}:5432"`,
		`"${TEST_DB_PORT}:5432"`,
	);
	writeFileSync(dockerComposePath, dockerCompose);

	// Patch .env.local
	const envLocalPath = join(appDir, ".env.local");
	let envLocal = readFileSync(envLocalPath, "utf8");
	envLocal = envLocal.replace(
		new RegExp(`:${SCAFFOLD_DB_PORT}/`, "g"),
		`:${TEST_DB_PORT}/`,
	);
	writeFileSync(envLocalPath, envLocal);
}

function browser(cmd: string, cwd: string, timeoutMs = 30_000): string {
	return execSync(`npx agent-browser ${cmd}`, {
		cwd,
		timeout: timeoutMs,
		encoding: "utf8",
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(
	url: string,
	timeoutMs = 30_000,
): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) return true;
		} catch {
			// Server not ready yet
		}
		await sleep(1000);
	}
	return false;
}

describe("Better Auth browser flow", () => {
	let tmpDir: string;
	let appDir: string;
	let devServer: ChildProcess | null = null;

	beforeAll(async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-better-auth-browser-"));
		appDir = join(tmpDir, "better-auth-browser-app");

		// Scaffold the app
		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth better-auth --db postgres --ci`,
			FORGE_ROOT,
			300_000,
		);

		// Patch database port to avoid conflicts with other running postgres instances
		patchDbPort(appDir);

		// Start PostgreSQL via Docker
		run("docker compose up -d", appDir, 60_000);

		// Wait for database to be ready
		await sleep(3000);

		// Push database schema
		run("pnpm db:push", appDir, 60_000);

		// Start dev server in background
		devServer = spawn("pnpm", ["dev"], {
			cwd: appDir,
			stdio: "pipe",
			detached: true,
		});

		// Wait for server to be ready
		const serverReady = await waitForServer("http://localhost:3000", 30_000);
		if (!serverReady) {
			throw new Error("Dev server failed to start");
		}
	}, 400_000);

	afterAll(async () => {
		// Close browser
		try {
			browser("close", appDir);
		} catch {
			// Browser may already be closed
		}

		// Kill dev server
		if (devServer?.pid) {
			try {
				process.kill(-devServer.pid);
			} catch {
				// Process may already be dead
			}
		}

		// Stop Docker containers
		try {
			run("docker compose down -v", appDir, 30_000);
		} catch {
			// Ignore cleanup errors
		}

		// Clean up temp directory
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("loads the signup page", () => {
		const output = browser("open http://localhost:3000/signup", appDir);
		expect(output).toContain("localhost:3000/signup");

		const snapshot = browser("snapshot -i", appDir);
		expect(snapshot).toContain("Name");
		expect(snapshot).toContain("Email");
		expect(snapshot).toContain("Password");
		expect(snapshot).toContain("Create Account");
	});

	it("creates an account via signup form", async () => {
		// Use semantic locators to fill the form (more robust than hardcoded refs)
		browser('find label "Name" fill "Tester"', appDir);
		browser(`find label "Email" fill "${TEST_EMAIL}"`, appDir);
		browser(`find label "Password" fill "${TEST_PASSWORD}"`, appDir);

		// Submit the form using the button text
		browser('find text "Create Account" click', appDir);

		// Wait for navigation
		await sleep(3000);

		// Verify redirect to home
		const snapshot = browser("snapshot", appDir);
		expect(snapshot).toContain("Welcome");
	});

	it("loads the login page", () => {
		const output = browser("open http://localhost:3000/login", appDir);
		expect(output).toContain("localhost:3000/login");

		const snapshot = browser("snapshot -i", appDir);
		expect(snapshot).toContain("Email");
		expect(snapshot).toContain("Password");
		expect(snapshot).toContain("Sign In");
	});

	it("logs in with created credentials", async () => {
		// Use semantic locators to fill login form
		browser(`find label "Email" fill "${TEST_EMAIL}"`, appDir);
		browser(`find label "Password" fill "${TEST_PASSWORD}"`, appDir);

		// Submit using button text
		browser('find text "Sign In" click', appDir);

		// Wait for navigation
		await sleep(3000);

		// Verify redirect to home
		const snapshot = browser("snapshot", appDir);
		expect(snapshot).toContain("Welcome");
	});
});
