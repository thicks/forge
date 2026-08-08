import { readFile } from "node:fs/promises";
import { parse as parseDotenv } from "dotenv";
import type { VercelEnvVar } from "./vercel-env.js";

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface EnvDiffEntry {
	key: string;
	status: DiffStatus;
	localValue: string | undefined;
	remoteValue: string | undefined;
	/** True for keys matching sensitive naming patterns or Vercel sensitive/secret type */
	isSensitive: boolean;
	/** Vercel env var ID (undefined for keys that only exist locally) */
	remoteId?: string;
}

const SENSITIVE_KEY_PATTERN =
	/SECRET|KEY|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|CERT|API_KEY/i;

/** Parse a dotenv file, returning key→value map (empty map if missing). */
export async function parseLocalEnvFile(
	filePath: string,
): Promise<Map<string, string>> {
	try {
		const content = await readFile(filePath, "utf-8");
		const parsed = parseDotenv(content);
		return new Map(Object.entries(parsed));
	} catch {
		return new Map();
	}
}

/** Determine whether a key or Vercel type is considered sensitive. */
export function isSensitiveVar(
	key: string,
	type?: VercelEnvVar["type"],
): boolean {
	if (type === "sensitive" || type === "secret") return true;
	return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Compute the diff between local env vars and remote Vercel env vars.
 *
 * - "added"    = exists in remote but not in local (pull direction: would add to local)
 * - "removed"  = exists in local but not in remote (push direction: would add to remote)
 * - "modified" = exists in both but values differ
 * - "unchanged" = exists in both with the same value
 */
export function diffEnvVars(
	local: Map<string, string>,
	remote: VercelEnvVar[],
): EnvDiffEntry[] {
	const remoteMap = new Map<string, VercelEnvVar>(
		remote.map((v) => [v.key, v]),
	);
	const allKeys = new Set([...local.keys(), ...remoteMap.keys()]);

	const entries: EnvDiffEntry[] = [];

	for (const key of allKeys) {
		const localValue = local.get(key);
		const remoteVar = remoteMap.get(key);
		const remoteValue = remoteVar?.value;

		let status: DiffStatus;
		if (remoteVar?.decrypted === false) {
			status = "unchanged";
		} else if (localValue === undefined) {
			status = "added"; // only in remote
		} else if (remoteValue === undefined) {
			status = "removed"; // only in local
		} else if (localValue !== remoteValue) {
			status = "modified";
		} else {
			status = "unchanged";
		}

		entries.push({
			key,
			status,
			localValue,
			remoteValue,
			isSensitive: isSensitiveVar(key, remoteVar?.type),
			remoteId: remoteVar?.id,
		});
	}

	// Sort: changed entries first, then alphabetically
	return entries.sort((a, b) => {
		const order: Record<DiffStatus, number> = {
			added: 0,
			modified: 1,
			removed: 2,
			unchanged: 3,
		};
		const orderDiff = order[a.status] - order[b.status];
		if (orderDiff !== 0) return orderDiff;
		return a.key.localeCompare(b.key);
	});
}

/** Mask a sensitive value for display purposes. */
export function maskValue(value: string): string {
	if (value.length <= 4) return "****";
	return `${value.slice(0, 4)}${"*".repeat(Math.min(value.length - 4, 12))}`;
}

/** Serialize a key→value map to dotenv format. */
export async function writeEnvFile(
	filePath: string,
	vars: Map<string, string>,
): Promise<void> {
	const { writeFile } = await import("node:fs/promises");
	const lines: string[] = [];

	for (const [key, value] of vars) {
		// Quote values that contain spaces or special characters,
		// escaping backslashes and embedded double quotes
		const needsQuote = /[\s#"'`]/.test(value);
		if (needsQuote) {
			const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			lines.push(`${key}="${escaped}"`);
		} else {
			lines.push(`${key}=${value}`);
		}
	}

	await writeFile(filePath, `${lines.join("\n")}\n`, {
		encoding: "utf-8",
		mode: 0o600,
	});
	const { chmod } = await import("node:fs/promises");
	await chmod(filePath, 0o600);
}

/** Create a timestamped backup of a dotenv file before overwriting. */
export async function backupEnvFile(filePath: string): Promise<string | null> {
	const { copyFile, access } = await import("node:fs/promises");
	try {
		await access(filePath);
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.slice(0, 19);
		const backupPath = `${filePath}.bak.${timestamp}`;
		await copyFile(filePath, backupPath);
		return backupPath;
	} catch {
		// File doesn't exist yet, no backup needed
		return null;
	}
}
