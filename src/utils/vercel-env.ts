import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vercelGetAuthToken } from "./exec.js";

export type VercelEnvTarget = "development" | "preview" | "production";
export type VercelEnvType = "plain" | "secret" | "encrypted" | "sensitive";

export interface VercelEnvVar {
	id: string;
	key: string;
	value?: string;
	target: VercelEnvTarget[];
	type: VercelEnvType;
	/** Whether the value is readable (sensitive vars may be unreadable) */
	decrypted?: boolean;
}

interface VercelProjectJson {
	projectId: string;
	orgId: string;
}

const VERCEL_API_BASE = "https://api.vercel.com";

/** Walk up the directory tree looking for a .vercel/project.json file. */
export async function findVercelProjectJson(
	startDir: string,
): Promise<{ projectId: string; orgId: string; dir: string } | null> {
	let current = startDir;
	for (let depth = 0; depth < 10; depth++) {
		const candidate = join(current, ".vercel", "project.json");
		try {
			const raw = await readFile(candidate, "utf-8");
			const parsed = JSON.parse(raw) as VercelProjectJson;
			if (parsed.projectId && parsed.orgId) {
				return {
					projectId: parsed.projectId,
					orgId: parsed.orgId,
					dir: current,
				};
			}
		} catch {
			// not found at this level
		}
		const parent = join(current, "..");
		if (parent === current) break;
		current = parent;
	}
	return null;
}

/** Build Authorization header and team query param. */
async function getAuthHeaders(
	orgId: string,
): Promise<{ headers: Record<string, string>; teamParam: string }> {
	const token = await vercelGetAuthToken();
	if (!token) {
		throw new Error("No Vercel auth token found. Run `vercel login` first.");
	}
	return {
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		teamParam: `teamId=${orgId}`,
	};
}

/** List all env vars for a project, filtered by target environment. */
export async function listVercelEnvVars(
	projectId: string,
	orgId: string,
	target: VercelEnvTarget,
): Promise<VercelEnvVar[]> {
	const { headers, teamParam } = await getAuthHeaders(orgId);
	const url = `${VERCEL_API_BASE}/v9/projects/${projectId}/env?${teamParam}&decrypt=true`;

	const res = await fetch(url, { headers });
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Vercel API error ${res.status}: ${body}`);
	}

	const data = (await res.json()) as { envs: VercelEnvVar[] };
	return (data.envs ?? [])
		.filter((v) => v.target.includes(target))
		.map((v) => (v.decrypted === false ? { ...v, value: undefined } : v));
}

/** Create or update an env var for a project via the Vercel REST API. */
export async function upsertVercelEnvVar(
	projectId: string,
	orgId: string,
	key: string,
	value: string,
	target: VercelEnvTarget[],
	existingId?: string,
	type: VercelEnvType = "plain",
): Promise<void> {
	const { headers, teamParam } = await getAuthHeaders(orgId);

	if (existingId) {
		// Patch existing variable
		const url = `${VERCEL_API_BASE}/v9/projects/${projectId}/env/${existingId}?${teamParam}`;
		const res = await fetch(url, {
			method: "PATCH",
			headers,
			body: JSON.stringify({ value, target, type }),
		});
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Failed to update env var ${key}: ${body}`);
		}
		return;
	}

	// Create new variable
	const url = `${VERCEL_API_BASE}/v10/projects/${projectId}/env?${teamParam}`;
	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify({ key, value, target, type }),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Failed to create env var ${key}: ${body}`);
	}
}

/** Delete an env var by ID. */
export async function deleteVercelEnvVar(
	projectId: string,
	orgId: string,
	envId: string,
	key: string,
): Promise<void> {
	const { headers, teamParam } = await getAuthHeaders(orgId);
	const url = `${VERCEL_API_BASE}/v9/projects/${projectId}/env/${envId}?${teamParam}`;

	const res = await fetch(url, { method: "DELETE", headers });
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Failed to delete env var ${key}: ${body}`);
	}
}
