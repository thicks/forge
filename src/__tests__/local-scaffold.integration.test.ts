/**
 * Integration tests for local scaffold variations of `forge new` and `forge update`.
 *
 * These tests verify that all "local" command variations (no remote GitHub, Vercel,
 * or cloud Supabase) produce the expected file structure.
 *
 * Run manually with: pnpm test:integration
 * NOT included in standard `pnpm test` or CI workflows due to long execution time.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const FORGE_CLI = join(FORGE_ROOT, "src/index.ts");

function run(cmd: string, cwd: string, timeoutMs = 180_000): string {
	return execSync(cmd, { cwd, timeout: timeoutMs, encoding: "utf8" });
}

function readJson(filePath: string): Record<string, unknown> {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

// Common file assertions for all scaffolds
function assertBaseFiles(appDir: string): void {
	const baseFiles = [
		"package.json",
		"next.config.ts",
		"tsconfig.json",
		"biome.json",
		".gitignore",
		"app/layout.tsx",
		"app/page.tsx",
		"app/globals.css",
		"vitest.config.mts",
		"vitest.setup.ts",
		"lib/utils.ts",
		"lib/posthog.ts",
		"lib/logger/client.ts",
		"lib/logger/server.ts",
		"components/providers/posthog.tsx",
		"__tests__/unit/utils.test.ts",
		"__tests__/utils/mocks.ts",
		"__tests__/factories/user.ts",
		".github/workflows/test.yml",
		".github/workflows/checks.yml",
		".vscode/settings.json",
		".cursor/settings.json",
		".cursor/rules/project-context.mdc",
		".cursor/rules/typescript-standards.mdc",
		".cursor/rules/testing.mdc",
		".cursor/rules/git-workflow.mdc",
		".cursor/rules/comment-style.mdc",
		".claude/settings.json",
		"CLAUDE.md",
		"FORGE_RECOMMENDATIONS.md",
		".env.local",
		".env.example",
		"scripts/setup",
	];

	for (const file of baseFiles) {
		expect(existsSync(join(appDir, file)), `Missing: ${file}`).toBe(true);
	}
}

function assertPostgresFiles(appDir: string): void {
	const postgresFiles = [
		"docker-compose.yml",
		"db/schema.ts",
		"db/index.ts",
		"drizzle.config.ts",
		"scripts/db-start",
	];

	for (const file of postgresFiles) {
		expect(
			existsSync(join(appDir, file)),
			`Missing postgres file: ${file}`,
		).toBe(true);
	}

	const envLocal = readFileSync(join(appDir, ".env.local"), "utf8");
	expect(envLocal).toContain("DATABASE_URL=");
}

function assertSupabaseFiles(appDir: string): void {
	const supabaseFiles = [
		"supabase/config.toml",
		"supabase/seed.sql",
		"db/schema.ts",
		"db/client.ts",
		"db/server.ts",
		"db/middleware.ts",
		"drizzle.config.ts",
		"scripts/supabase-start",
	];

	for (const file of supabaseFiles) {
		expect(
			existsSync(join(appDir, file)),
			`Missing supabase file: ${file}`,
		).toBe(true);
	}

	const envLocal = readFileSync(join(appDir, ".env.local"), "utf8");
	expect(envLocal).toContain("NEXT_PUBLIC_SUPABASE_URL=");
	expect(envLocal).toContain("DATABASE_URL=");
}

function assertSimpleAuthFiles(appDir: string): void {
	const simpleAuthFiles = [
		"middleware.ts",
		"app/login/page.tsx",
		"app/api/auth/login/route.ts",
	];

	for (const file of simpleAuthFiles) {
		expect(
			existsSync(join(appDir, file)),
			`Missing simple auth file: ${file}`,
		).toBe(true);
	}
}

function assertWorkosAuthFiles(appDir: string): void {
	const workosAuthFiles = [
		"middleware.ts",
		"app/login/page.tsx",
		"app/login/dev-login-form.tsx",
		"app/callback/route.ts",
		"app/api/auth/login/route.ts",
	];

	for (const file of workosAuthFiles) {
		expect(
			existsSync(join(appDir, file)),
			`Missing workos auth file: ${file}`,
		).toBe(true);
	}

	const pkgJson = readJson(join(appDir, "package.json")) as {
		dependencies?: Record<string, string>;
	};
	expect(pkgJson.dependencies?.["@workos-inc/authkit-nextjs"]).toBeDefined();
}

function assertBetterAuthFiles(appDir: string): void {
	const betterAuthFiles = [
		"lib/auth.ts",
		"lib/auth-client.ts",
		"proxy.ts",
		"app/login/page.tsx",
		"app/signup/page.tsx",
		"app/api/auth/[...all]/route.ts",
	];

	for (const file of betterAuthFiles) {
		expect(
			existsSync(join(appDir, file)),
			`Missing better-auth file: ${file}`,
		).toBe(true);
	}

	const pkgJson = readJson(join(appDir, "package.json")) as {
		dependencies?: Record<string, string>;
	};
	expect(pkgJson.dependencies?.["better-auth"]).toBeDefined();

	const envLocal = readFileSync(join(appDir, ".env.local"), "utf8");
	expect(envLocal).toContain("BETTER_AUTH_SECRET=");
	expect(envLocal).toContain("BETTER_AUTH_URL=");
}

function assertAiScaffoldFiles(appDir: string): void {
	const aiFiles = [
		"CLAUDE.md",
		"FORGE_RECOMMENDATIONS.md",
		".claude/settings.json",
		".cursor/settings.json",
		".cursor/rules/project-context.mdc",
		".cursor/rules/typescript-standards.mdc",
		".cursor/rules/testing.mdc",
		".cursor/rules/git-workflow.mdc",
		".cursor/rules/comment-style.mdc",
	];

	for (const file of aiFiles) {
		expect(
			existsSync(join(appDir, file)),
			`Missing AI scaffold file: ${file}`,
		).toBe(true);
	}
}

// ============================================================================
// forge new - Local Variations
// ============================================================================

describe("forge new - minimal (no db, no auth)", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-minimal-"));
		appDir = join(tmpDir, "minimal-app");

		run(`npx tsx "${FORGE_CLI}" new "${appDir}" --ci`, FORGE_ROOT, 300_000);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("does not create database files", () => {
		expect(existsSync(join(appDir, "db"))).toBe(false);
		expect(existsSync(join(appDir, "drizzle.config.ts"))).toBe(false);
		expect(existsSync(join(appDir, "docker-compose.yml"))).toBe(false);
		expect(existsSync(join(appDir, "supabase"))).toBe(false);
	});

	it("does not create auth files", () => {
		expect(existsSync(join(appDir, "middleware.ts"))).toBe(false);
		expect(existsSync(join(appDir, "app/login"))).toBe(false);
		expect(existsSync(join(appDir, "app/callback"))).toBe(false);
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);

	it("tests pass", () => {
		run("pnpm test", appDir, 60_000);
	}, 70_000);
});

describe("forge new --db postgres", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-postgres-"));
		appDir = join(tmpDir, "postgres-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --db postgres --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates postgres database files", () => {
		assertPostgresFiles(appDir);
	});

	it("does not create auth files", () => {
		expect(existsSync(join(appDir, "middleware.ts"))).toBe(false);
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge new --db supabase", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-supabase-"));
		appDir = join(tmpDir, "supabase-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --db supabase --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates supabase database files", () => {
		assertSupabaseFiles(appDir);
	});

	it("does not create auth files", () => {
		expect(existsSync(join(appDir, "middleware.ts"))).toBe(false);
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge new --auth simple", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-simple-auth-"));
		appDir = join(tmpDir, "simple-auth-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth simple --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates simple auth files", () => {
		assertSimpleAuthFiles(appDir);
	});

	it("does not create database files", () => {
		expect(existsSync(join(appDir, "db"))).toBe(false);
		expect(existsSync(join(appDir, "drizzle.config.ts"))).toBe(false);
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge new --auth workos", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-workos-auth-"));
		appDir = join(tmpDir, "workos-auth-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth workos --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates workos auth files", () => {
		assertWorkosAuthFiles(appDir);
	});

	it("does not create database files", () => {
		expect(existsSync(join(appDir, "db"))).toBe(false);
		expect(existsSync(join(appDir, "drizzle.config.ts"))).toBe(false);
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge new --auth better-auth --db postgres", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-better-auth-pg-"));
		appDir = join(tmpDir, "better-auth-pg-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth better-auth --db postgres --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates better-auth files", () => {
		assertBetterAuthFiles(appDir);
	});

	it("creates postgres database files", () => {
		assertPostgresFiles(appDir);
	});

	it("schema includes Better Auth tables", () => {
		const schema = readFileSync(join(appDir, "db", "schema.ts"), "utf8");
		expect(schema).toContain("export const user = pgTable");
		expect(schema).toContain("export const session = pgTable");
		expect(schema).toContain("export const account = pgTable");
		expect(schema).toContain("export const verification = pgTable");
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge new --auth better-auth --db supabase", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-better-auth-sb-"));
		appDir = join(tmpDir, "better-auth-sb-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --auth better-auth --db supabase --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates better-auth files", () => {
		assertBetterAuthFiles(appDir);
	});

	it("creates supabase database files", () => {
		assertSupabaseFiles(appDir);
	});

	it("schema includes Better Auth tables", () => {
		const schema = readFileSync(join(appDir, "db", "schema.ts"), "utf8");
		expect(schema).toContain("export const user = pgTable");
		expect(schema).toContain("export const session = pgTable");
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge new --db postgres --auth simple (combined)", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-pg-simple-"));
		appDir = join(tmpDir, "pg-simple-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --db postgres --auth simple --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates postgres database files", () => {
		assertPostgresFiles(appDir);
	});

	it("creates simple auth files", () => {
		assertSimpleAuthFiles(appDir);
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge new --db supabase --auth workos (combined)", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-sb-workos-"));
		appDir = join(tmpDir, "sb-workos-app");

		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --db supabase --auth workos --ci`,
			FORGE_ROOT,
			300_000,
		);
	}, 320_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("creates all base files", () => {
		assertBaseFiles(appDir);
	});

	it("creates supabase database files", () => {
		assertSupabaseFiles(appDir);
	});

	it("creates workos auth files", () => {
		assertWorkosAuthFiles(appDir);
	});

	it("builds successfully", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

// ============================================================================
// forge update - Local Variations
// ============================================================================

describe("forge update --db postgres", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-update-pg-"));
		appDir = join(tmpDir, "update-pg-app");

		// First create a minimal app
		run(`npx tsx "${FORGE_CLI}" new "${appDir}" --ci`, FORGE_ROOT, 300_000);

		// Then update with postgres
		run(
			`npx tsx "${FORGE_CLI}" update "${appDir}" --db postgres`,
			FORGE_ROOT,
			180_000,
		);
	}, 500_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("preserves base files", () => {
		assertBaseFiles(appDir);
	});

	it("adds postgres database files", () => {
		assertPostgresFiles(appDir);
	});

	it("builds successfully after update", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge update --db supabase", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-update-sb-"));
		appDir = join(tmpDir, "update-sb-app");

		// First create a minimal app
		run(`npx tsx "${FORGE_CLI}" new "${appDir}" --ci`, FORGE_ROOT, 300_000);

		// Then update with supabase
		run(
			`npx tsx "${FORGE_CLI}" update "${appDir}" --db supabase`,
			FORGE_ROOT,
			180_000,
		);
	}, 500_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("preserves base files", () => {
		assertBaseFiles(appDir);
	});

	it("adds supabase database files", () => {
		assertSupabaseFiles(appDir);
	});

	it("builds successfully after update", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});

describe("forge update --ai", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-update-ai-"));
		appDir = join(tmpDir, "update-ai-app");

		// First create a minimal app
		run(`npx tsx "${FORGE_CLI}" new "${appDir}" --ci`, FORGE_ROOT, 300_000);

		// Delete some AI files to simulate outdated scaffold
		rmSync(join(appDir, "CLAUDE.md"));
		rmSync(join(appDir, ".cursor", "rules", "testing.mdc"));

		// Then update with --ai
		run(`npx tsx "${FORGE_CLI}" update "${appDir}" --ai`, FORGE_ROOT, 60_000);
	}, 400_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("restores AI scaffold files", () => {
		assertAiScaffoldFiles(appDir);
	});

	it("preserves base app files", () => {
		expect(existsSync(join(appDir, "package.json"))).toBe(true);
		expect(existsSync(join(appDir, "app/page.tsx"))).toBe(true);
	});
});

describe("forge update --db postgres --ai (combined)", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-int-update-pg-ai-"));
		appDir = join(tmpDir, "update-pg-ai-app");

		// First create a minimal app
		run(`npx tsx "${FORGE_CLI}" new "${appDir}" --ci`, FORGE_ROOT, 300_000);

		// Then update with both postgres and AI
		run(
			`npx tsx "${FORGE_CLI}" update "${appDir}" --db postgres --ai`,
			FORGE_ROOT,
			180_000,
		);
	}, 500_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("adds postgres database files", () => {
		assertPostgresFiles(appDir);
	});

	it("updates AI scaffold files", () => {
		assertAiScaffoldFiles(appDir);
	});

	it("builds successfully after update", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);
});
