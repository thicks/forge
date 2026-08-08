import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const FORGE_CLI = join(FORGE_ROOT, "src/index.ts");

function run(cmd: string, cwd: string, timeoutMs = 120_000): string {
	return execSync(cmd, { cwd, timeout: timeoutMs, encoding: "utf8" });
}

describe("forge create smoke test (standalone, no db, no auth)", () => {
	let tmpDir: string;
	let appDir: string;

	beforeAll(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "forge-smoke-"));
		appDir = join(tmpDir, "smoke-app");

		// Scaffold a minimal standalone app (no db, no auth, no git/vercel) in CI mode
		run(
			`npx tsx "${FORGE_CLI}" new "${appDir}" --ci`,
			FORGE_ROOT,
			// Scaffolding installs deps which can take a while
			180_000,
		);
	}, 200_000);

	afterAll(() => {
		if (tmpDir && existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// --- File existence ---

	it("creates package.json", () => {
		expect(existsSync(join(appDir, "package.json"))).toBe(true);
	});

	it("creates next.config.ts", () => {
		expect(existsSync(join(appDir, "next.config.ts"))).toBe(true);
	});

	it("creates tsconfig.json", () => {
		expect(existsSync(join(appDir, "tsconfig.json"))).toBe(true);
	});

	it("creates app/layout.tsx", () => {
		expect(existsSync(join(appDir, "app", "layout.tsx"))).toBe(true);
	});

	it("creates app/page.tsx", () => {
		expect(existsSync(join(appDir, "app", "page.tsx"))).toBe(true);
	});

	it("creates app/globals.css", () => {
		expect(existsSync(join(appDir, "app", "globals.css"))).toBe(true);
	});

	it("creates vitest.config.mts", () => {
		expect(existsSync(join(appDir, "vitest.config.mts"))).toBe(true);
	});

	it("creates vitest.setup.ts", () => {
		expect(existsSync(join(appDir, "vitest.setup.ts"))).toBe(true);
	});

	it("creates __tests__/unit/utils.test.ts", () => {
		expect(existsSync(join(appDir, "__tests__", "unit", "utils.test.ts"))).toBe(
			true,
		);
	});

	it("creates __tests__/utils/mocks.ts", () => {
		expect(existsSync(join(appDir, "__tests__", "utils", "mocks.ts"))).toBe(
			true,
		);
	});

	it("creates __tests__/factories/user.ts", () => {
		expect(existsSync(join(appDir, "__tests__", "factories", "user.ts"))).toBe(
			true,
		);
	});

	it("creates .github/workflows/test.yml", () => {
		expect(existsSync(join(appDir, ".github", "workflows", "test.yml"))).toBe(
			true,
		);
	});

	it("creates lib/utils.ts", () => {
		expect(existsSync(join(appDir, "lib", "utils.ts"))).toBe(true);
	});

	it("creates biome.json", () => {
		expect(existsSync(join(appDir, "biome.json"))).toBe(true);
	});

	it("creates .gitignore", () => {
		expect(existsSync(join(appDir, ".gitignore"))).toBe(true);
	});

	// --- Build verification ---

	it("builds successfully with pnpm build", () => {
		run("pnpm build", appDir, 120_000);
	}, 130_000);

	// --- Test suite in scaffolded app ---

	it("scaffolded pnpm test passes (utils.test.ts)", () => {
		run("pnpm test", appDir, 60_000);
	}, 70_000);
});
