import { lstat, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function normalizeForComparison(value: string): string {
	return process.platform === "darwin" ? value.toLowerCase() : value;
}

function isWithin(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return (
		relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
	);
}

async function resolveTarget(target: string): Promise<string> {
	const resolved = path.resolve(target);
	try {
		return await realpath(resolved);
	} catch {
		return path.join(
			await realpath(path.dirname(resolved)),
			path.basename(resolved),
		);
	}
}

export async function assertSafeNewTarget(
	target: string,
	workingDirectory = process.cwd(),
): Promise<void> {
	const lexicalTarget = path.resolve(target);
	const cwd = await realpath(path.resolve(workingDirectory));
	const realTarget = normalizeForComparison(await resolveTarget(lexicalTarget));
	const realCwd = normalizeForComparison(cwd);

	if (realTarget === realCwd || isWithin(realTarget, realCwd)) {
		throw new Error(
			`Refusing to replace the current directory or one of its ancestors: ${lexicalTarget}`,
		);
	}

	const stat = await lstat(lexicalTarget).catch(() => null);
	if (stat?.isSymbolicLink()) {
		throw new Error(`Refusing to replace a symbolic link: ${lexicalTarget}`);
	}
}

export async function assertSafeCleanTarget(target: string): Promise<void> {
	const home = normalizeForComparison(await realpath(os.homedir()));
	const realTarget = normalizeForComparison(await resolveTarget(target));
	const protectedPaths = new Set([
		"/",
		home,
		...["Desktop", "Documents", "Downloads", "Applications"].map((dir) =>
			normalizeForComparison(path.join(home, dir)),
		),
	]);

	if (protectedPaths.has(realTarget) || !isWithin(home, realTarget)) {
		throw new Error(
			`Refusing to delete a protected or out-of-home path: ${path.resolve(target)}`,
		);
	}

	const stat = await lstat(path.resolve(target));
	if (stat.isSymbolicLink()) {
		throw new Error(
			`Refusing to delete a symbolic link: ${path.resolve(target)}`,
		);
	}
}
