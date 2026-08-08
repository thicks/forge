import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const FORGE_CLI = join(FORGE_ROOT, "src/index.ts");

function run(cmd: string, cwd: string, timeoutMs = 120_000): string {
	return execSync(cmd, { cwd, timeout: timeoutMs, encoding: "utf8" });
}

function runExpectFail(cmd: string, cwd: string): string {
	try {
		execSync(cmd, { cwd, timeout: 30_000, encoding: "utf8", stdio: "pipe" });
		throw new Error("Command should have failed but succeeded");
	} catch (error) {
		if (error instanceof Error && "stdout" in error) {
			// CLI errors go to stdout via the logger
			const execError = error as Error & { stdout?: string; stderr?: string };
			const stdout = execError.stdout || "";
			const stderr = execError.stderr || "";
			return stdout + stderr;
		}
		throw error;
	}
}

describe("auth option validation", () => {
	let tmpDir: string;

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("rejects --auth better-auth without --db flag", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-auth-test-"));
		const appDir = join(tmpDir, "no-db-app");

		const output = runExpectFail(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth better-auth --ci`,
			FORGE_ROOT,
		);

		expect(output).toContain("--auth better-auth requires a database");
	});

	it("rejects invalid auth type", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-auth-test-"));
		const appDir = join(tmpDir, "invalid-auth-app");

		const output = runExpectFail(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth invalid --ci`,
			FORGE_ROOT,
		);

		expect(output).toContain("Invalid auth type");
	});
});

describe("auth simple (no db required)", () => {
	let tmpDir: string;
	let appDir: string;

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("scaffolds --auth simple without --db", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-simple-auth-"));
		appDir = join(tmpDir, "simple-auth-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth simple --ci --skip-install`,
			FORGE_ROOT,
			30_000,
		);

		expect(existsSync(join(appDir, "middleware.ts"))).toBe(true);
		expect(existsSync(join(appDir, "app", "login", "page.tsx"))).toBe(true);
		expect(
			existsSync(join(appDir, "app", "api", "auth", "login", "route.ts")),
		).toBe(true);
	}, 30_000);
});

describe("auth workos (no db required)", () => {
	let tmpDir: string;
	let appDir: string;

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("scaffolds --auth workos without --db", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-workos-auth-"));
		appDir = join(tmpDir, "workos-auth-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth workos --ci --skip-install`,
			FORGE_ROOT,
			30_000,
		);

		expect(existsSync(join(appDir, "middleware.ts"))).toBe(true);
		expect(existsSync(join(appDir, "app", "login", "page.tsx"))).toBe(true);
		expect(existsSync(join(appDir, "app", "callback", "route.ts"))).toBe(true);

		const pkgJson = JSON.parse(
			readFileSync(join(appDir, "package.json"), "utf8"),
		);
		expect(pkgJson.dependencies["@workos-inc/authkit-nextjs"]).toBeDefined();
	}, 30_000);
});

describe("auth better-auth with postgres", () => {
	let tmpDir: string;
	let appDir: string;

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("scaffolds --auth better-auth --db postgres", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-better-auth-pg-"));
		appDir = join(tmpDir, "better-auth-pg-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth better-auth --db postgres --ci --skip-install`,
			FORGE_ROOT,
			30_000,
		);

		// Better Auth files
		expect(existsSync(join(appDir, "lib", "auth.ts"))).toBe(true);
		expect(existsSync(join(appDir, "lib", "auth-client.ts"))).toBe(true);
		expect(existsSync(join(appDir, "proxy.ts"))).toBe(true);
		expect(existsSync(join(appDir, "app", "login", "page.tsx"))).toBe(true);
		expect(existsSync(join(appDir, "app", "signup", "page.tsx"))).toBe(true);
		expect(
			existsSync(join(appDir, "app", "api", "auth", "[...all]", "route.ts")),
		).toBe(true);

		// Database files
		expect(existsSync(join(appDir, "db", "schema.ts"))).toBe(true);
		expect(existsSync(join(appDir, "docker-compose.yml"))).toBe(true);

		// Check package.json for better-auth dependency
		const pkgJson = JSON.parse(
			readFileSync(join(appDir, "package.json"), "utf8"),
		);
		expect(pkgJson.dependencies["better-auth"]).toBeDefined();

		// Check schema includes Better Auth tables
		const schema = readFileSync(join(appDir, "db", "schema.ts"), "utf8");
		expect(schema).toContain("export const user = pgTable");
		expect(schema).toContain("export const session = pgTable");
		expect(schema).toContain("export const account = pgTable");
		expect(schema).toContain("export const verification = pgTable");

		// Check env file has Better Auth vars
		const envLocal = readFileSync(join(appDir, ".env.local"), "utf8");
		expect(envLocal).toContain("BETTER_AUTH_SECRET=");
		expect(envLocal).toContain("BETTER_AUTH_URL=");
	}, 30_000);
});

describe("auth better-auth with supabase", () => {
	let tmpDir: string;
	let appDir: string;

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("scaffolds --auth better-auth --db supabase", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-better-auth-sb-"));
		appDir = join(tmpDir, "better-auth-sb-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth better-auth --db supabase --ci --skip-install`,
			FORGE_ROOT,
			30_000,
		);

		// Better Auth files
		expect(existsSync(join(appDir, "lib", "auth.ts"))).toBe(true);
		expect(existsSync(join(appDir, "lib", "auth-client.ts"))).toBe(true);

		// Supabase files
		expect(existsSync(join(appDir, "supabase", "config.toml"))).toBe(true);
		expect(existsSync(join(appDir, "db", "client.ts"))).toBe(true);
		expect(existsSync(join(appDir, "db", "server.ts"))).toBe(true);

		// Check package.json
		const pkgJson = JSON.parse(
			readFileSync(join(appDir, "package.json"), "utf8"),
		);
		expect(pkgJson.dependencies["better-auth"]).toBeDefined();
		expect(pkgJson.dependencies["@supabase/supabase-js"]).toBeDefined();
	}, 30_000);
});
