import path from "node:path";
import { Command } from "commander";
import { loadConfig } from "../utils/config-manager.js";
import {
	fileExists,
	ghAuthScopes,
	ghAuthStatus,
	ghRepoCreate,
	ghRepoView,
	gitCurrentBranch,
	gitLsRemote,
	gitPush,
	gitRemoteAdd,
	gitRemoteGetUrl,
	log,
	withSpinner,
} from "../utils/index.js";

/**
 * Set up a GitHub repository for a project — fully non-interactive.
 *
 * Designed to be called by agents or CI without any terminal prompts.
 * All configuration comes from ~/.forge.json:
 *   - github.org        → GitHub organisation (required)
 *   - github.visibility  → Repo visibility (default: "internal")
 *
 * Behaviour:
 *   1. If origin is already set and accessible → no-op.
 *   2. If the repo already exists on GitHub    → link + push.
 *   3. Otherwise                               → create + link + push.
 */
export async function setupGit(
	cwd: string,
	projectName: string,
): Promise<void> {
	log.info(`Setting up GitHub repository for ${projectName}`);

	// Load GitHub org and visibility from config
	const config = await loadConfig();
	const githubOrg = config.github?.org;
	const visibility: "internal" | "private" | "public" =
		config.github?.visibility || "internal";

	if (!githubOrg) {
		log.error(
			"No GitHub organization configured. Run 'forge config' to set one before using --github.",
		);
		process.exit(1);
	}

	// Verify gh CLI is installed
	try {
		await withSpinner("Checking for GitHub CLI", async () => {
			const { execCommand } = await import("../utils/exec.js");
			await execCommand("gh", ["--version"]);
		});
	} catch {
		log.error(
			"GitHub CLI (gh) is not installed. Install it from https://cli.github.com/",
		);
		process.exit(1);
	}

	// Verify authentication — fail fast, no interactive login
	const isAuthenticated = await ghAuthStatus();
	if (!isAuthenticated) {
		log.error(
			"Not authenticated with GitHub. Run 'gh auth login' or 'forge config' before using --github.",
		);
		process.exit(1);
	}

	// Check that the token has the 'workflow' scope — required to push workflow files
	const scopes = await ghAuthScopes();
	if (!scopes.includes("workflow")) {
		log.error(
			'Your GitHub token is missing the "workflow" scope, which is required to push workflow files.',
		);
		log.error('Run: gh auth refresh --scopes "repo,workflow"');
		log.error("Then retry the command.");
		process.exit(1);
	}

	// If origin already exists and is reachable, nothing to do
	const existingOrigin = await gitRemoteGetUrl("origin", cwd);
	if (existingOrigin) {
		log.info(`Found existing origin remote: ${existingOrigin}`);
		const isAccessible = await gitLsRemote("origin", cwd);
		if (isAccessible) {
			log.success("Origin remote is accessible. GitHub setup complete!");
			return;
		}
		// Origin exists but isn't accessible — clear the stale remote and re-link below
		log.warn(
			"Origin remote exists but is not accessible. Removing stale remote...",
		);
		const { execCommand } = await import("../utils/exec.js");
		await execCommand("git", ["remote", "remove", "origin"], { cwd });
	}

	// Check if the repo already exists on GitHub
	const repoFullName = `${githubOrg}/${projectName}`;
	const repoExists = await ghRepoView(githubOrg, projectName);

	if (repoExists) {
		// Repo exists but no local origin — link and push
		log.info(`Repository ${repoFullName} already exists on GitHub. Linking...`);
		const repoUrl = `git@github.com:${repoFullName}.git`;
		await gitRemoteAdd("origin", repoUrl, cwd);
		const branch = await gitCurrentBranch(cwd);
		try {
			await withSpinner("Pushing to remote", async () => {
				await gitPush("origin", branch, cwd, true);
			});
		} catch (error) {
			log.error(
				`Could not push to ${repoFullName} without overwriting remote history. Reconcile the remote manually and retry: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
		log.success(`Linked and pushed to ${repoFullName}`);
		return;
	}

	// Repo doesn't exist — create, link, push
	await createGitHubRepo(cwd, projectName, githubOrg, visibility);
}

/**
 * Create a GitHub repository and link it to the local project.
 * Non-interactive: visibility is determined by config/defaults.
 */
async function createGitHubRepo(
	cwd: string,
	name: string,
	githubOrg: string,
	visibility: "internal" | "private" | "public",
): Promise<void> {
	const repoFullName = `${githubOrg}/${name}`;

	log.info(`Creating ${repoFullName} (${visibility})...`);
	await ghRepoCreate(githubOrg, name, visibility, cwd);

	// Verify origin was actually set by gh repo create
	const origin = await gitRemoteGetUrl("origin", cwd);
	if (origin) {
		log.success(`Created and pushed to ${repoFullName}`);
	} else {
		// gh created the repo but didn't link origin — add manually and push
		log.warn(
			"Repository created on GitHub but origin remote was not set. Linking manually...",
		);
		const repoUrl = `git@github.com:${repoFullName}.git`;
		await gitRemoteAdd("origin", repoUrl, cwd);
		const branch = await gitCurrentBranch(cwd);
		await gitPush("origin", branch, cwd, true);
		log.success(`Linked and pushed to ${repoFullName}`);
	}
}

export const setupGitCommand = new Command("setup-git")
	.description("Setup GitHub repository for an existing project")
	.argument("<path>", "Path to the project directory")
	.action(async (projectPath: string) => {
		const cwd = path.resolve(process.cwd(), projectPath);

		// Check if directory exists
		if (!(await fileExists(cwd))) {
			log.error(`Directory ${projectPath} does not exist`);
			process.exit(1);
		}

		// Check if it's a git repository
		const gitDir = path.join(cwd, ".git");
		if (!(await fileExists(gitDir))) {
			log.error(
				`${projectPath} is not a git repository. Run 'git init' first.`,
			);
			process.exit(1);
		}

		// Get project name from directory
		const projectName = path.basename(cwd);

		await setupGit(cwd, projectName);
	});
