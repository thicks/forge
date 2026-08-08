import path from "node:path";
import fs from "fs-extra";
import type {
	LocalSkillEntry,
	SkillEntry,
	SkillManifest,
} from "../types/config.js";
import { npxCommand } from "./exec.js";
import { copyAsset, fileExists, getAssetPath, readFile } from "./fs.js";
import { log } from "./logger.js";

// ---------------------------------------------------------------------------
// Skill context used by resolveSkills to evaluate conditional inclusion
// ---------------------------------------------------------------------------

export interface SkillContext {
	db?: string;
	auth?: string;
}

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

/**
 * Load the skills manifest from either a custom file path or the built-in
 * asset at assets/skills.json. The manifest is read-only -- it is never
 * copied into scaffolded projects.
 */
export async function loadSkillManifest(
	customPath?: string,
): Promise<SkillManifest> {
	const manifestPath = customPath
		? path.resolve(customPath)
		: getAssetPath("skills.json");

	const raw = await readFile(manifestPath);
	return JSON.parse(raw) as SkillManifest;
}

// ---------------------------------------------------------------------------
// Conditional resolution
// ---------------------------------------------------------------------------

/**
 * Evaluate a `when` condition string against the scaffold context.
 *
 * Supported patterns:
 *   "db"             — truthy when context.db is set
 *   "auth:workos"    — truthy when context.auth === "workos"
 *   "auth:betterauth" — truthy when context.auth matches
 *   "auth:simple"    — truthy when context.auth === "simple"
 */
function evaluateCondition(when: string, ctx: SkillContext): boolean {
	if (when === "db") {
		return !!ctx.db;
	}

	if (when.startsWith("auth:")) {
		const requiredAuth = when.slice("auth:".length);
		return ctx.auth === requiredAuth;
	}

	log.warn(`Unknown skill condition: "${when}" — skipping skill`);
	return false;
}

/** Filter the manifest to only skills whose conditions are met. */
export function resolveSkills(
	manifest: SkillManifest,
	ctx: SkillContext,
): SkillEntry[] {
	return manifest.skills.filter((entry) => {
		if (entry.always) return true;
		if (entry.when) return evaluateCondition(entry.when, ctx);
		return true;
	});
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

/**
 * Copy an asset file only when the destination is missing or its content
 * differs from the source asset. Used during `forge update --ai` to avoid
 * unnecessary writes.
 */
async function copyAssetFileIfChanged(
	assetFilePath: string,
	destPath: string,
): Promise<void> {
	const srcContent = await readFile(getAssetPath(assetFilePath));
	if (await fileExists(destPath)) {
		const existing = await readFile(destPath);
		if (existing === srcContent) {
			log.info(`Skipping ${path.basename(destPath)} (unchanged).`);
			return;
		}
		log.info(`Updating ${path.basename(destPath)} (changed).`);
	}
	await copyAsset(assetFilePath, destPath);
}

/**
 * Walk the files inside a local skill asset directory and copy each one
 * with a content-change check so unchanged files are skipped.
 */
async function updateLocalSkill(
	entry: LocalSkillEntry,
	targetDir: string,
): Promise<void> {
	const assetDir = getAssetPath(entry.asset);
	const destDir = path.join(targetDir, ".claude", "skills", entry.id);
	const files = await fs.readdir(assetDir);

	for (const file of files) {
		const stat = await fs.stat(path.join(assetDir, file));
		if (stat.isFile()) {
			await copyAssetFileIfChanged(
				`${entry.asset}/${file}`,
				path.join(destDir, file),
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Install orchestrator
// ---------------------------------------------------------------------------

export type InstallMode = "copy" | "update";

/**
 * Install resolved skills into a project directory.
 *
 * - `copy` mode: used by `forge new` — overwrites unconditionally
 * - `update` mode: used by `forge update --ai` — skips unchanged files
 */
export async function installSkills(
	skills: SkillEntry[],
	targetDir: string,
	mode: InstallMode,
): Promise<void> {
	for (const entry of skills) {
		if (entry.source === "local") {
			const dest = path.join(targetDir, ".claude", "skills", entry.id);
			if (mode === "copy") {
				await copyAsset(entry.asset, dest);
			} else {
				await updateLocalSkill(entry, targetDir);
			}
		} else {
			// Repo-sourced skills installed via the `skills` CLI
			try {
				await npxCommand(
					"skills",
					[
						"add",
						entry.repo,
						"--skill",
						...entry.skills,
						"-a",
						"claude-code",
						"-y",
					],
					targetDir,
				);
			} catch (error) {
				log.warn(
					`Failed to install skills from ${entry.repo}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}
}
