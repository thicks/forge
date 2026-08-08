import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import prompts from "prompts";
import { loadConfig } from "../utils/config-manager.js";
import {
	assertSafeCleanTarget,
	execCommand,
	fileExists,
	ghAuthStatus,
	ghRepoView,
	gitRemoteGetUrl,
	log,
	withSpinner,
} from "../utils/index.js";

/**
 * Parse a GitHub org/repo from a git remote URL.
 * Handles both SSH and HTTPS formats.
 */
function parseGitHubRepo(remoteUrl: string): string | null {
	// SSH: git@github.com:org/repo.git
	const sshMatch = remoteUrl.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
	if (sshMatch) return sshMatch[1];

	// HTTPS: https://github.com/org/repo.git
	const httpsMatch = remoteUrl.match(/github\.com\/(.+?\/.+?)(?:\.git)?$/);
	if (httpsMatch) return httpsMatch[1];

	return null;
}

/**
 * Validate that the resolved path is safe to delete.
 * Blocks filesystem root, home directory, and common dangerous paths.
 */
function isSafePath(resolved: string): boolean {
	// macOS APFS is case-insensitive by default — compare case-insensitively there
	const normalize = (p: string) =>
		process.platform === "darwin" ? p.toLowerCase() : p;
	const target = normalize(path.resolve(resolved));
	const home = normalize(path.resolve(os.homedir()));

	const dangerous = new Set([
		"/",
		home,
		...["Desktop", "Documents", "Downloads", "Applications"].map((dir) =>
			normalize(path.join(os.homedir(), dir)),
		),
	]);

	if (dangerous.has(target)) return false;

	// Require the target to be strictly inside the home directory.
	// path.relative is segment-aware, so sibling prefixes like
	// /Users/treyhicks2 don't false-positive against /Users/treyhicks.
	// This blocks the home directory itself, its ancestors, and anything
	// outside the home dir.
	const relative = path.relative(home, target);
	if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative))
		return false;

	return true;
}

interface CleanOptions {
	github?: boolean;
	vercel?: boolean;
}

export const cleanCommand = new Command("clean")
	.description(
		"Delete local project directory and optionally remote GitHub repo and Vercel project",
	)
	.argument("<project-path>", "Path to the project directory")
	.option("--github", "Also delete the GitHub repository")
	.option("--vercel", "Also delete the Vercel project")
	.action(async (projectPath: string, options: CleanOptions) => {
		const cwd = path.resolve(process.cwd(), projectPath);

		// Explicit opt-in flags for remote cleanup
		const cleanGitHub = !!options.github;
		const cleanVercel = !!options.vercel;

		// Guard against dangerous paths like /, ~, system directories, and symlinks.
		if (!isSafePath(cwd)) {
			log.error(
				`Refusing to delete "${cwd}" — this path is too broad or points to a protected directory.`,
			);
			process.exit(1);
		}
		try {
			await assertSafeCleanTarget(cwd);
		} catch (error) {
			log.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}

		// Check if directory exists
		if (!(await fileExists(cwd))) {
			log.error(`Directory ${projectPath} does not exist`);
			process.exit(1);
		}

		// Verify the target looks like a project (has package.json or .git)
		const hasPackageJson = await fileExists(path.join(cwd, "package.json"));
		const hasGit = await fileExists(path.join(cwd, ".git"));
		if (!hasPackageJson && !hasGit) {
			log.error(
				`Directory "${projectPath}" does not look like a project (no package.json or .git found).`,
			);
			log.info("The clean command only targets project directories.");
			process.exit(1);
		}

		// Monorepo guard — clean is not yet safe for monorepos
		const isMonorepo =
			(await fileExists(path.join(cwd, "pnpm-workspace.yaml"))) ||
			(await fileExists(path.join(cwd, "turbo.json")));
		if (isMonorepo) {
			log.error(
				"Clean does not support monorepo projects yet. Skipping all destructive steps.",
			);
			log.info(
				"To clean up manually, delete the local directory, GitHub repo, and Vercel project individually.",
			);
			return;
		}

		// Detect GitHub remote
		let githubRepo: string | null = null;
		if (cleanGitHub) {
			const remoteUrl = await gitRemoteGetUrl("origin", cwd);
			if (remoteUrl) {
				githubRepo = parseGitHubRepo(remoteUrl);
			}

			// Fallback: if no origin remote, check if a repo with this name exists on GitHub
			if (!githubRepo) {
				const projectName = path.basename(cwd);
				const config = await loadConfig();
				const githubOrg = config.github?.org;

				if (githubOrg) {
					const exists = await ghRepoView(githubOrg, projectName);
					if (exists) {
						githubRepo = `${githubOrg}/${projectName}`;
						log.info(
							`No origin remote found locally, but ${githubRepo} exists on GitHub.`,
						);
					}
				}
			}
		}

		// Detect Vercel project
		let vercelProjectName: string | null = null;
		let vercelProjectDisplayName: string | null = null;
		if (cleanVercel) {
			const vercelProjectPath = path.join(cwd, ".vercel", "project.json");
			if (await fileExists(vercelProjectPath)) {
				try {
					const raw = await readFile(vercelProjectPath, "utf-8");
					const project = JSON.parse(raw);
					vercelProjectName = project.projectId || null;
					vercelProjectDisplayName = project.projectName || null;
				} catch {
					// Ignore parse errors
				}
			}
		}

		// Show what will be cleaned up
		log.info("Resources to clean:");
		log.step(`  Local directory: ${projectPath}`);

		if (cleanGitHub) {
			if (githubRepo) {
				log.step(`  GitHub: ${githubRepo}`);
			} else {
				log.info("  GitHub: none detected (--github flag provided)");
			}
		}
		if (cleanVercel) {
			if (vercelProjectName) {
				log.step(`  Vercel: ${vercelProjectDisplayName || vercelProjectName}`);
			} else {
				log.info("  Vercel: none detected (--vercel flag provided)");
			}
		}

		// Ask all confirmation prompts up front, before any deletion
		log.blank();
		const { confirmRemote } = await prompts({
			type: "confirm",
			name: "confirmRemote",
			message: "Delete the remote resources listed above?",
			initial: false,
		});

		if (!confirmRemote) {
			log.info("Skipping remote deletions");
		}

		const { deleteLocal } = await prompts({
			type: "confirm",
			name: "deleteLocal",
			message: `Delete local directory "${projectPath}"?`,
			initial: true,
		});

		if (!confirmRemote && !deleteLocal) {
			log.info("Clean cancelled");
			return;
		}

		// Execute deletions — each failure is non-fatal so one failure
		// doesn't block the remaining deletions.

		// Delete remote GitHub repository
		if (githubRepo && cleanGitHub && confirmRemote) {
			const isAuthenticated = await ghAuthStatus();
			if (!isAuthenticated) {
				log.warn(
					"Cannot reach GitHub. A valid GitHub token is required to delete the repository.",
				);
				log.info("Run 'forge config' or 'gh auth login' to authenticate.");
			} else {
				try {
					await withSpinner(`Deleting GitHub repo: ${githubRepo}`, async () => {
						await execCommand("gh", [
							"repo",
							"delete",
							githubRepo as string,
							"--yes",
						]);
					});
					log.success(`Deleted GitHub repository: ${githubRepo}`);
				} catch (error) {
					const stderr =
						error instanceof Error && "stderr" in error
							? String((error as { stderr: unknown }).stderr)
							: "";

					if (stderr.includes("delete_repo")) {
						log.warn(
							`Could not delete GitHub repo: missing "delete_repo" scope.`,
						);
						log.info("Run: gh auth refresh -h github.com -s delete_repo");
					} else {
						log.warn(
							`Could not delete GitHub repo "${githubRepo}". You may need to delete it manually.`,
						);
						if (stderr) {
							log.info(stderr);
						}
					}
				}
			}
		}

		// Delete Vercel project
		if (vercelProjectName && cleanVercel && confirmRemote) {
			try {
				await withSpinner("Removing Vercel project", async () => {
					await execCommand(
						"vercel",
						["remove", vercelProjectName as string, "--yes"],
						{
							cwd,
						},
					);
				});
				log.success("Removed Vercel project");
			} catch {
				log.warn(
					"Could not remove Vercel project. You may need to delete it from the Vercel dashboard.",
				);
			}
		}

		// Delete local directory
		if (deleteLocal) {
			const { rm } = await import("node:fs/promises");
			try {
				await withSpinner(`Deleting ${projectPath}`, async () => {
					await rm(cwd, { recursive: true, force: true });
				});
				log.success(`Deleted ${projectPath}`);
			} catch {
				log.warn(
					`Could not delete local directory "${projectPath}". You may need to delete it manually.`,
				);
			}
		}

		log.blank();
		log.success("Clean complete!");
	});
