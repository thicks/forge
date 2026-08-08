import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const pnpmAddMock = vi.hoisted(() =>
	vi.fn().mockImplementation(() => Promise.resolve()),
);
const promptsMock = vi.hoisted(() => vi.fn());

vi.mock("prompts", () => ({
	default: promptsMock,
}));

vi.mock("../utils/index.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../utils/index.js")>();
	return {
		...actual,
		pnpmAdd: pnpmAddMock,
		withSpinner: async <T>(_text: string, fn: () => Promise<T>): Promise<T> =>
			await fn(),
	};
});

const setupGitMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../commands/setup-git.js", () => ({
	setupGit: setupGitMock,
}));

const setupVercelMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../commands/setup-vercel.js", () => ({
	setupVercel: setupVercelMock,
}));

import { update } from "../commands/update.js";
import { log } from "../utils/logger.js";

const minimalDrizzleSupabase = `import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
`;

describe("forge update guard paths", () => {
	let tmpDir: string;

	afterEach(async () => {
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
		}
		vi.clearAllMocks();
	});

	it("warns and does nothing when no update option is selected", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-noop-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "noop-app", version: "0.0.0" }),
			"utf-8",
		);
		const warnSpy = vi.spyOn(log, "warn").mockImplementation(() => {});

		await update(tmpDir, "noop-app", {});

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("No update option selected"),
		);
		expect(pnpmAddMock).not.toHaveBeenCalled();
	});

	it("exits when the target directory has no package.json", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-nopkg-"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called");
		});
		const errorSpy = vi.spyOn(log, "error").mockImplementation(() => {});

		await expect(
			update(tmpDir, "nopkg-app", { db: "postgres" }),
		).rejects.toThrow("process.exit called");

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("does not look like a forge project"),
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("exits when --github is used without a git repo", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-nogit-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "nogit-app", version: "0.0.0" }),
			"utf-8",
		);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called");
		});
		const errorSpy = vi.spyOn(log, "error").mockImplementation(() => {});

		await expect(update(tmpDir, "nogit-app", { github: true })).rejects.toThrow(
			"process.exit called",
		);

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("not a git repository"),
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(setupGitMock).not.toHaveBeenCalled();
	});

	it("exits when --vercel is used without a git repo", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-novercel-git-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "novercel-app", version: "0.0.0" }),
			"utf-8",
		);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called");
		});
		vi.spyOn(log, "error").mockImplementation(() => {});

		await expect(
			update(tmpDir, "novercel-app", { vercel: true }),
		).rejects.toThrow("process.exit called");

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(setupVercelMock).not.toHaveBeenCalled();
	});

	it("skips reconfiguration when the user declines to overwrite a conflicting db config", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-decline-overwrite-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "decline-app", version: "0.0.0" }),
			"utf-8",
		);
		await writeFile(join(tmpDir, "drizzle.config.ts"), minimalDrizzleSupabase);
		promptsMock.mockResolvedValueOnce({ shouldOverwrite: false });
		const infoSpy = vi.spyOn(log, "info").mockImplementation(() => {});

		await update(tmpDir, "decline-app", { db: "postgres" });

		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringContaining("Skipped database update"),
		);
		expect(pnpmAddMock).not.toHaveBeenCalled();
	});

	it("skips supabase cloud provisioning when .supabase/.project-ref already exists via --db supabase --supabase", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-cloud-linked-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "linked-app", version: "0.0.0" }),
			"utf-8",
		);
		await mkdir(join(tmpDir, ".supabase"), { recursive: true });
		await writeFile(join(tmpDir, ".supabase", ".project-ref"), "existing-ref");
		const infoSpy = vi.spyOn(log, "info").mockImplementation(() => {});

		await update(tmpDir, "linked-app", { supabase: true, db: "supabase" });

		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringContaining("already linked"),
		);
	});
});
