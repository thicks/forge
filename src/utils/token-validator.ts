import { execCommand } from "./exec.js";

export interface ValidationResult {
	valid: boolean;
	error?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Validate GitHub token by calling the GitHub API.
 * Also fetches user email and name if token is valid.
 */
export async function validateGitHubToken(
	token: string,
): Promise<ValidationResult> {
	try {
		// Use gh CLI to validate token and get user info
		const { stdout } = await execCommand("gh", ["api", "user"], {
			env: { ...process.env, GH_TOKEN: token },
		});

		const user = JSON.parse(stdout);
		return {
			valid: true,
			metadata: {
				email: user.email || null,
				name: user.name || user.login,
				login: user.login,
			},
		};
	} catch (error) {
		return {
			valid: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to validate GitHub token",
		};
	}
}

/**
 * Validate Vercel token by calling the Vercel API.
 */
export async function validateVercelToken(
	token: string,
	team?: string,
): Promise<ValidationResult> {
	try {
		const headers = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};

		const url = team
			? `https://api.vercel.com/v2/teams/${team}`
			: "https://api.vercel.com/v2/user";

		const response = await fetch(url, { headers });

		if (!response.ok) {
			return {
				valid: false,
				error: `Vercel API returned ${response.status}: ${response.statusText}`,
			};
		}

		const data = await response.json();
		return {
			valid: true,
			metadata: team ? { team: data } : { user: data },
		};
	} catch (error) {
		return {
			valid: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to validate Vercel token",
		};
	}
}

/**
 * Validate Supabase token by calling the Supabase Management API.
 */
export async function validateSupabaseToken(
	token: string,
): Promise<ValidationResult> {
	try {
		const headers = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};

		const response = await fetch("https://api.supabase.com/v1/organizations", {
			headers,
		});

		if (!response.ok) {
			return {
				valid: false,
				error: `Supabase API returned ${response.status}: ${response.statusText}`,
			};
		}

		const orgs = await response.json();
		return {
			valid: true,
			metadata: { organizations: orgs },
		};
	} catch (error) {
		return {
			valid: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to validate Supabase token",
		};
	}
}
