import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const pnpmAddMock = vi.hoisted(() =>
	vi.fn().mockImplementation(() => Promise.resolve()),
);

const ensureSupabaseCLIMock = vi.hoisted(() =>
	vi.fn().mockResolvedValue(undefined),
);
const ensurePostgresClientMock = vi.hoisted(() =>
	vi.fn().mockResolvedValue(undefined),
);

vi.mock("../utils/index.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../utils/index.js")>();
	return {
		...actual,
		pnpmAdd: pnpmAddMock,
		ensureSupabaseCLI: ensureSupabaseCLIMock,
		ensurePostgresClient: ensurePostgresClientMock,
		withSpinner: async <T>(_text: string, fn: () => Promise<T>): Promise<T> =>
			await fn(),
	};
});

const setupSupabaseMock = vi.hoisted(() =>
	vi.fn().mockResolvedValue({
		projectRef: "test-ref",
		databaseUrl:
			"postgresql://postgres.x:secret@aws-1-us-east-2.pooler.supabase.com:5432/postgres",
	}),
);

vi.mock("../commands/setup-supabase.js", () => ({
	setupSupabase: setupSupabaseMock,
}));

import { update } from "../commands/update.js";

const minimalDrizzleSupabase = `import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
`;

describe("forge update supabase", () => {
	let tmpDir: string;

	afterEach(async () => {
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
		}
		vi.clearAllMocks();
	});

	it("reconciles missing db scripts when supabase is already configured", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-sb-reconcile-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify(
				{
					name: "reconcile-app",
					version: "0.0.0",
					scripts: { dev: "next dev", build: "next build" },
				},
				null,
				2,
			),
			"utf-8",
		);
		await writeFile(join(tmpDir, "drizzle.config.ts"), minimalDrizzleSupabase);

		await update(tmpDir, "reconcile-app", { db: "supabase" });

		expect(pnpmAddMock).toHaveBeenCalled();
		const pkg = JSON.parse(
			await readFile(join(tmpDir, "package.json"), "utf-8"),
		) as { scripts: Record<string, string> };
		expect(pkg.scripts["db:generate"]).toBe("drizzle-kit generate");
		expect(pkg.scripts["supabase:start"]).toBe("./scripts/supabase-start");
	});

	it("provisions cloud Supabase when --supabase and .supabase/.project-ref is absent", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-sb-cloud-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "cloud-app", version: "0.0.0", scripts: {} }),
			"utf-8",
		);
		await writeFile(join(tmpDir, "drizzle.config.ts"), minimalDrizzleSupabase);

		await update(tmpDir, "cloud-app", { db: "supabase", supabase: true });

		expect(setupSupabaseMock).toHaveBeenCalledWith(tmpDir, "cloud-app");
		const envDev = await readFile(
			join(tmpDir, ".env.development.local"),
			"utf-8",
		);
		expect(envDev).toContain("DATABASE_URL=postgresql://postgres.x:secret@");
	});

	it("skips setupSupabase when .supabase/.project-ref already exists", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-sb-skip-cloud-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "skip-cloud", version: "0.0.0", scripts: {} }),
			"utf-8",
		);
		await writeFile(join(tmpDir, "drizzle.config.ts"), minimalDrizzleSupabase);
		await mkdir(join(tmpDir, ".supabase"), { recursive: true });
		await writeFile(join(tmpDir, ".supabase", ".project-ref"), "existing-ref");

		await update(tmpDir, "skip-cloud", { db: "supabase", supabase: true });

		expect(setupSupabaseMock).not.toHaveBeenCalled();
	});
});
