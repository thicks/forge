import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const pnpmAddMock = vi.hoisted(() =>
	vi.fn().mockImplementation(() => Promise.resolve()),
);

vi.mock("prompts", () => ({
	default: vi
		.fn()
		.mockResolvedValueOnce({ clientId: "client_unit_app" })
		.mockResolvedValueOnce({ apiKey: "sk_unit_secret" }),
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

import { update } from "../commands/update.js";

describe("forge update --auth workos", () => {
	let tmpDir: string;

	afterEach(async () => {
		if (tmpDir) {
			await rm(tmpDir, { recursive: true, force: true });
		}
		vi.clearAllMocks();
	});

	it("scaffolds WorkOS files and env when AuthKit is not yet configured", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-workos-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify({ name: "unit-app", version: "0.0.0" }, null, 2),
			"utf-8",
		);

		await update(tmpDir, "unit-app", { auth: "workos" });

		expect(pnpmAddMock).toHaveBeenCalledWith(
			["@workos-inc/authkit-nextjs"],
			tmpDir,
		);

		const middleware = await readFile(join(tmpDir, "middleware.ts"), "utf-8");
		expect(middleware).toContain("authkitMiddleware");

		const envLocal = await readFile(join(tmpDir, ".env.local"), "utf-8");
		expect(envLocal).toContain("WORKOS_CLIENT_ID=client_unit_app");
		expect(envLocal).toContain("WORKOS_API_KEY=sk_unit_secret");
		expect(envLocal).toContain("WORKOS_COOKIE_PASSWORD=");
		expect(envLocal).toContain(
			"NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback",
		);

		const envExample = await readFile(join(tmpDir, ".env.example"), "utf-8");
		expect(envExample).toContain("WORKOS_CLIENT_ID=<your-workos-client-id>");
		expect(envExample).not.toContain("WORKOS_API_KEY");
		expect(envExample).toContain("WORKOS_COOKIE_PASSWORD=");
	});

	it("skips scaffolding when AuthKit and WorkOS middleware already exist", async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "forge-update-workos-skip-"));
		await writeFile(
			join(tmpDir, "package.json"),
			JSON.stringify(
				{
					name: "skip-app",
					version: "0.0.0",
					dependencies: { "@workos-inc/authkit-nextjs": "^2.0.0" },
				},
				null,
				2,
			),
			"utf-8",
		);
		await writeFile(
			join(tmpDir, "middleware.ts"),
			`import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
export default authkitMiddleware();
`,
			"utf-8",
		);

		await update(tmpDir, "skip-app", { auth: "workos" });

		expect(pnpmAddMock).not.toHaveBeenCalled();
	});
});
