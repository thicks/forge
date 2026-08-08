import { type Options, execa } from "execa";
import { getVercelBin } from "./ensure-deps.js";

export async function execCommand(
	command: string,
	args: string[],
	options?: Options,
): Promise<{ stdout: string; stderr: string }> {
	const result = await execa(command, args, {
		stdio: "pipe",
		...options,
	});
	return {
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
	};
}

export async function pnpmInstall(cwd: string): Promise<void> {
	await execCommand("pnpm", ["install"], { cwd });
}

export async function pnpmAdd(
	packages: string[],
	cwd: string,
	dev = false,
): Promise<void> {
	const args = ["add", ...(dev ? ["-D"] : []), ...packages];
	await execCommand("pnpm", args, { cwd });
}

export async function pnpmRun(script: string, cwd: string): Promise<void> {
	await execCommand("pnpm", ["run", script], { cwd });
}

export async function npxCommand(
	command: string,
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	return await execCommand("npx", [command, ...args], { cwd });
}

export async function gitInit(cwd: string): Promise<void> {
	try {
		// Prefer explicit default branch to avoid inheriting user/system git defaults.
		await execCommand("git", ["init", "--initial-branch=main"], { cwd });
	} catch (error) {
		// Fallback only for older Git versions that do not support --initial-branch.
		const { message = "", stderr = "" } = (error ?? {}) as {
			message?: string;
			stderr?: string;
		};
		const output = `${message}\n${stderr}`;
		if (
			!output.includes("unknown option") &&
			!output.includes("unrecognized option")
		) {
			throw error;
		}
		await execCommand("git", ["init"], { cwd });
		await execCommand("git", ["branch", "-M", "main"], { cwd });
	}
}

export async function gitAdd(cwd: string, files = "."): Promise<void> {
	await execCommand("git", ["add", files], { cwd });
}

export async function gitCommit(message: string, cwd: string): Promise<void> {
	await execCommand("git", ["commit", "-m", message], { cwd });
}

// Interactive execution for commands that need user input
export async function execInteractive(
	command: string,
	args: string[],
	cwd: string,
	env?: NodeJS.ProcessEnv,
): Promise<void> {
	await execa(command, args, {
		stdio: "inherit",
		cwd,
		...(env ? { env } : {}),
	});
}

// GitHub CLI utilities
export async function ghAuthStatus(): Promise<boolean> {
	try {
		await execCommand("gh", ["auth", "status"]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns the list of OAuth scopes granted to the active gh auth token.
 * Parses the "Token scopes: ..." line from `gh auth status` stderr output.
 * Returns an empty array if not authenticated or if scopes cannot be determined.
 */
export async function ghAuthScopes(): Promise<string[]> {
	try {
		// gh auth status writes all output to stderr; capture it even on success
		const result = await execa("gh", ["auth", "status"], {
			stdio: "pipe",
			reject: false,
		});
		const output =
			(typeof result.stderr === "string" ? result.stderr : "") +
			(typeof result.stdout === "string" ? result.stdout : "");
		// Line format: "  Token scopes: 'repo', 'workflow', 'read:org'"
		const match = output.match(/Token scopes:\s*(.+)/i);
		if (!match) return [];
		return match[1]
			.split(",")
			.map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
			.filter(Boolean);
	} catch {
		return [];
	}
}

export async function ghAuthLogin(cwd: string): Promise<void> {
	await execInteractive("gh", ["auth", "login", "--web"], cwd);
}

export async function ghRepoView(org: string, name: string): Promise<boolean> {
	try {
		await execCommand("gh", ["repo", "view", `${org}/${name}`]);
		return true;
	} catch {
		return false;
	}
}

export async function ghRepoCreate(
	org: string,
	name: string,
	visibility: "public" | "private" | "internal",
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	return await execCommand(
		"gh",
		[
			"repo",
			"create",
			`${org}/${name}`,
			`--${visibility}`,
			"--source=.",
			"--push",
		],
		{ cwd },
	);
}

// Git utilities
export async function gitRemoteGetUrl(
	remoteName: string,
	cwd: string,
): Promise<string | null> {
	try {
		const { stdout } = await execCommand(
			"git",
			["remote", "get-url", remoteName],
			{ cwd },
		);
		return stdout.trim();
	} catch {
		return null;
	}
}

export async function gitRemoteAdd(
	remoteName: string,
	url: string,
	cwd: string,
): Promise<void> {
	await execCommand("git", ["remote", "add", remoteName, url], { cwd });
}

export async function gitLsRemote(
	remoteName: string,
	cwd: string,
): Promise<boolean> {
	try {
		await execCommand("git", ["ls-remote", remoteName], { cwd });
		return true;
	} catch {
		return false;
	}
}

export async function gitPush(
	remoteName: string,
	branch: string,
	cwd: string,
	setUpstream = false,
	force = false,
): Promise<void> {
	const args = ["push"];
	if (force) {
		args.push("--force");
	}
	if (setUpstream) {
		args.push("-u");
	}
	args.push(remoteName, branch);
	await execCommand("git", args, { cwd });
}

export async function gitCurrentBranch(cwd: string): Promise<string> {
	const { stdout } = await execCommand(
		"git",
		["rev-parse", "--abbrev-ref", "HEAD"],
		{ cwd },
	);
	return stdout.trim();
}

export async function gitStatus(cwd: string): Promise<string> {
	const { stdout } = await execCommand("git", ["status", "--porcelain"], {
		cwd,
	});
	return stdout;
}

export async function gitLog(
	cwd: string,
	range: string,
): Promise<string | null> {
	try {
		const { stdout } = await execCommand("git", ["log", range, "--oneline"], {
			cwd,
		});
		return stdout;
	} catch {
		return null;
	}
}

// Vercel CLI utilities

/** Prepend --scope to Vercel CLI args so all commands target the configured team. */
function withScope(args: string[], team: string): string[] {
	return ["--scope", team, ...args];
}

export async function vercelWhoami(team: string): Promise<string | null> {
	try {
		const { stdout } = await execCommand(
			getVercelBin(),
			withScope(["whoami"], team),
		);
		return stdout.trim();
	} catch {
		return null;
	}
}

export async function vercelLogin(cwd: string): Promise<void> {
	await execInteractive(getVercelBin(), ["login"], cwd);
}

export async function vercelLink(
	projectName: string,
	cwd: string,
	team: string,
): Promise<void> {
	await execInteractive(
		getVercelBin(),
		withScope(["link", "--project", projectName, "--yes"], team),
		cwd,
	);
}

export async function vercelGitConnect(
	gitUrl: string,
	cwd: string,
	team: string,
): Promise<void> {
	await execCommand(
		getVercelBin(),
		withScope(["git", "connect", gitUrl, "--yes"], team),
		{
			cwd,
		},
	);
}

export async function vercelEnvAdd(
	name: string,
	value: string,
	environment: "production" | "preview" | "development",
	cwd: string,
	team: string,
	options: { sensitive?: boolean; force?: boolean } = {},
): Promise<void> {
	// Vercel CLI ≥50.23 requires an explicit git branch for preview in
	// non-interactive mode. Passing "" targets all preview branches.
	const positionalArgs =
		environment === "preview"
			? ["env", "add", name, environment, "", "--yes"]
			: ["env", "add", name, environment, "--yes"];

	const fullArgs = withScope(
		[
			...positionalArgs,
			...(options.sensitive ? ["--sensitive"] : []),
			...(options.force ? ["--force"] : []),
		],
		team,
	);

	// Pipe value via stdin — the canonical non-interactive approach for
	// vercel env add. Using --value can hang when combined with --sensitive.
	await execa(getVercelBin(), fullArgs, { stdio: "pipe", input: value, cwd });
}

export async function vercelEnvRemove(
	name: string,
	environment: "production" | "preview" | "development",
	cwd: string,
	team: string,
): Promise<void> {
	try {
		await execCommand(
			getVercelBin(),
			withScope(["env", "rm", name, environment, "--yes"], team),
			{
				cwd,
			},
		);
	} catch {
		// Ignore errors if variable doesn't exist
	}
}

export async function vercelEnvPull(
	cwd: string,
	team: string,
	targetFile = ".env.local",
): Promise<void> {
	await execCommand(
		getVercelBin(),
		withScope(["env", "pull", targetFile, "--yes"], team),
		{
			cwd,
		},
	);
}

export async function vercelDeploy(
	cwd: string,
	team: string,
	production = false,
): Promise<void> {
	const args = [];
	if (production) {
		args.push("--prod");
	}
	args.push("--yes");
	await execInteractive(getVercelBin(), withScope(args, team), cwd);
}

// Vercel API utilities

/**
 * Read the Vercel CLI auth token from the local config file.
 * macOS: ~/Library/Application Support/com.vercel.cli/auth.json
 * Linux: ~/.config/com.vercel.cli/auth.json
 */
export async function vercelGetAuthToken(): Promise<string | null> {
	const { readFile } = await import("node:fs/promises");
	const { homedir, platform } = await import("node:os");
	const pathMod = await import("node:path");

	const home = homedir();
	const configPaths =
		platform() === "darwin"
			? [
					pathMod.join(
						home,
						"Library",
						"Application Support",
						"com.vercel.cli",
						"auth.json",
					),
				]
			: [pathMod.join(home, ".config", "com.vercel.cli", "auth.json")];

	for (const configPath of configPaths) {
		try {
			const content = await readFile(configPath, "utf-8");
			const parsed = JSON.parse(content);
			if (parsed.token) {
				return parsed.token;
			}
		} catch {
			// Config file not found or unreadable, try next path
		}
	}

	return null;
}

/**
 * Set the root directory for a Vercel project via the API.
 * Used for monorepos where the app lives in a subdirectory (e.g. apps/<appName>).
 */
export async function vercelSetRootDirectory(
	projectId: string,
	rootDir: string,
): Promise<boolean> {
	const token = await vercelGetAuthToken();
	if (!token) {
		return false;
	}

	try {
		const response = await fetch(
			`https://api.vercel.com/v9/projects/${projectId}`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ rootDirectory: rootDir }),
			},
		);
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Check whether a Vercel project with the given name already exists under the team.
 * Uses the Vercel REST API so no interactive prompt is required.
 */
export async function vercelProjectExists(
	projectName: string,
	team: string,
): Promise<boolean> {
	const token = await vercelGetAuthToken();
	if (!token) return false;

	try {
		const response = await fetch(
			`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}?teamSlug=${encodeURIComponent(team)}`,
			{
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		return response.ok;
	} catch {
		return false;
	}
}

// Supabase CLI utilities

/** Build the env override to pass an forge-config Supabase token to the Supabase CLI. */
function supabaseEnv(token?: string): NodeJS.ProcessEnv | undefined {
	return token ? { ...process.env, SUPABASE_ACCESS_TOKEN: token } : undefined;
}

export async function supabaseVersion(): Promise<string | null> {
	try {
		const { stdout } = await execCommand("supabase", ["--version"]);
		return stdout.trim();
	} catch {
		return null;
	}
}

export async function supabaseProjectsList(
	token?: string,
): Promise<
	Array<{ id: string; name: string; status: string; region: string }>
> {
	try {
		const { stdout } = await execCommand(
			"supabase",
			["projects", "list", "-o", "json"],
			{ env: supabaseEnv(token) },
		);
		return JSON.parse(stdout);
	} catch {
		return [];
	}
}

export async function supabaseOrgsList(
	token?: string,
): Promise<Array<{ id: string; name: string }>> {
	try {
		const { stdout } = await execCommand(
			"supabase",
			["orgs", "list", "-o", "json"],
			{ env: supabaseEnv(token) },
		);
		return JSON.parse(stdout);
	} catch {
		return [];
	}
}

/**
 * Create a new Supabase project. Interactive because of the region selection prompt.
 * Note: the CLI has no env-var alternative to --db-password, but callers only
 * pass CLI-generated random passwords here, so process-list exposure is low-risk.
 */
export async function supabaseProjectsCreate(
	name: string,
	orgId: string,
	dbPassword: string,
	cwd: string,
	token?: string,
): Promise<void> {
	await execInteractive(
		"supabase",
		[
			"projects",
			"create",
			name,
			"--org-id",
			orgId,
			"--db-password",
			dbPassword,
		],
		cwd,
		supabaseEnv(token),
	);
}

// ---------------------------------------------------------------------------
// Git URL parsing and normalisation
// ---------------------------------------------------------------------------

/**
 * Extract org and repo name from a GitHub remote URL.
 * Handles SSH (git@github.com:org/repo.git) and HTTPS
 * (https://github.com/org/repo) formats.
 */
export function parseGitRemoteUrl(
	url: string,
): { org: string; name: string } | null {
	// SSH format: git@github.com:org/repo.git (repo names may contain dots)
	const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (sshMatch) {
		return { org: sshMatch[1], name: sshMatch[2] };
	}

	// HTTPS format: https://github.com/org/repo(.git)
	const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (httpsMatch) {
		return { org: httpsMatch[1], name: httpsMatch[2] };
	}

	return null;
}

/**
 * Convert a git remote URL to HTTPS format for Vercel CLI compatibility.
 * Returns the original URL unchanged if it cannot be parsed.
 */
export function normalizeGitUrlToHttps(url: string): string {
	const parsed = parseGitRemoteUrl(url);
	if (!parsed) return url;
	return `https://github.com/${parsed.org}/${parsed.name}`;
}

// ---------------------------------------------------------------------------
// GitHub App installation management
// ---------------------------------------------------------------------------

/**
 * Find the Vercel GitHub App installation ID for a GitHub organization.
 * Uses the GitHub API via the gh CLI.
 */
export async function ghGetVercelInstallationId(
	org: string,
): Promise<number | null> {
	try {
		const { stdout } = await execCommand("gh", [
			"api",
			`/orgs/${org}/installations`,
			"--jq",
			'.installations[] | select(.app_slug=="vercel") | .id',
		]);
		const id = Number.parseInt(stdout.trim(), 10);
		return Number.isNaN(id) ? null : id;
	} catch {
		return null;
	}
}

/**
 * Get the numeric ID of a GitHub repository.
 */
export async function ghGetRepoId(
	org: string,
	name: string,
): Promise<number | null> {
	try {
		const { stdout } = await execCommand("gh", [
			"api",
			`/repos/${org}/${name}`,
			"--jq",
			".id",
		]);
		const id = Number.parseInt(stdout.trim(), 10);
		return Number.isNaN(id) ? null : id;
	} catch {
		return null;
	}
}

/**
 * Add a repository to a GitHub App installation's accessible repositories.
 * This grants the app (e.g. Vercel) access to the specified repository.
 */
export async function ghAddRepoToInstallation(
	installationId: number,
	repoId: number,
): Promise<boolean> {
	try {
		await execCommand("gh", [
			"api",
			"-X",
			"PUT",
			`/user/installations/${installationId}/repositories/${repoId}`,
		]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Grant the Vercel GitHub App access to a repository.
 *
 * When the Vercel GitHub App is installed with "Only select repositories",
 * newly created repos are not automatically visible to Vercel. This function
 * finds the Vercel installation on the org and adds the repo to it so that
 * `vercel git connect` can succeed.
 */
export async function ghGrantVercelRepoAccess(
	org: string,
	repoName: string,
): Promise<boolean> {
	const installationId = await ghGetVercelInstallationId(org);
	if (!installationId) {
		return false;
	}

	const repoId = await ghGetRepoId(org, repoName);
	if (!repoId) {
		return false;
	}

	return await ghAddRepoToInstallation(installationId, repoId);
}

// ---------------------------------------------------------------------------
// Supabase CLI utilities
// ---------------------------------------------------------------------------

export async function supabaseLink(
	projectRef: string,
	cwd: string,
	dbPassword: string,
	token?: string,
): Promise<void> {
	// Pass the password via env (SUPABASE_DB_PASSWORD) instead of argv so it
	// is not visible in the process list while the command runs.
	const env: NodeJS.ProcessEnv = {
		...process.env,
		SUPABASE_DB_PASSWORD: dbPassword,
		...(token ? { SUPABASE_ACCESS_TOKEN: token } : {}),
	};
	await execCommand(
		"supabase",
		["link", "--project-ref", projectRef, "--yes"],
		{ cwd, env },
	);
}

/**
 * Get the status of a Supabase project by its ref.
 * Returns the status string (e.g. "ACTIVE_HEALTHY") or null if not found.
 */
export async function supabaseProjectStatus(
	projectRef: string,
	token?: string,
): Promise<string | null> {
	const projects = await supabaseProjectsList(token);
	const project = projects.find((p) => p.id === projectRef);
	return project?.status ?? null;
}
