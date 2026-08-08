import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertSafeCleanTarget,
	assertSafeNewTarget,
} from "../utils/path-safety.js";

const created: string[] = [];

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	for (const directory of created.splice(0))
		await rm(directory, { recursive: true, force: true });
});

describe("destructive path safety", () => {
	it("rejects the current directory and its ancestors as new targets", async () => {
		await expect(assertSafeNewTarget(".")).rejects.toThrow();
		await expect(assertSafeNewTarget("..")).rejects.toThrow();
	});

	it("accepts a normal child target", async () => {
		const parent = await mkdtemp(path.join(os.tmpdir(), "forge-path-"));
		created.push(parent);
		await expect(
			assertSafeNewTarget(path.join(parent, "app"), parent),
		).resolves.toBeUndefined();
	});

	it("rejects a clean target reached through an intermediate symlink", async () => {
		const homeChild = await mkdtemp(path.join(os.homedir(), "forge-path-"));
		const outside = await mkdtemp(path.join(os.tmpdir(), "forge-outside-"));
		const link = path.join(homeChild, "link");
		created.push(homeChild, outside);
		await mkdir(path.join(outside, "project"));
		await symlink(outside, link);
		await expect(
			assertSafeCleanTarget(path.join(link, "project")),
		).rejects.toThrow();
	});
});
