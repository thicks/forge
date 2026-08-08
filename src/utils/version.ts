import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the forge CLI root (directory containing package.json with name "forge").
 * Works when run from repo (src/ or dist/), from bundled chunks, or from installed ~/.forge/cli.
 */
export function getForgeRoot(): string {
	let dir = path.dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 10; i++) {
		const pkgPath = path.join(dir, "package.json");
		try {
			const raw = fs.readFileSync(pkgPath, "utf-8");
			const pkg = JSON.parse(raw) as { name?: string };
			if (pkg.name === "forge") {
				return dir;
			}
		} catch {
			// no package.json or invalid
		}
		dir = path.resolve(dir, "..");
	}
	// Fallback: assume we're in dist/ or src/utils/
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/**
 * Returns the short git commit hash for the current repo, or empty string if not a git repo.
 */
function getShortGitHash(root: string): string {
	try {
		const out = execSync("git rev-parse --short HEAD", {
			cwd: root,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return (out?.trim() ?? "") || "";
	} catch {
		return "";
	}
}

/**
 * Returns the current git branch name, or empty string if not a git repo or detached HEAD.
 */
function getCurrentBranch(root: string): string {
	try {
		const out = execSync("git branch --show-current", {
			cwd: root,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return (out?.trim() ?? "") || "";
	} catch {
		return "";
	}
}

/**
 * Published version string: package version plus short commit hash when available.
 * e.g. "0.1.0", "0.1.0.abc1234", or "0.1.0.abc1234 (feature-branch)"
 */
export function getVersion(): string {
	const root = getForgeRoot();
	const pkgPath = path.join(root, "package.json");
	let version = "0.1.0";
	try {
		const raw = fs.readFileSync(pkgPath, "utf-8");
		const pkg = JSON.parse(raw) as { version?: string };
		if (typeof pkg.version === "string") {
			version = pkg.version;
		}
	} catch {
		// keep default
	}
	const hash = getShortGitHash(root);
	const branch = getCurrentBranch(root);
	const base = hash ? `${version}.${hash}` : version;
	const showBranch = branch && branch !== "main";
	return showBranch ? `${base} (${branch})` : base;
}
