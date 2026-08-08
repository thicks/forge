import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import {
	execCommand,
	fileExists,
	log,
	pnpmInstall,
	pnpmRun,
	withSpinner,
} from "../utils/index.js";

const DEFAULT_FORGE_DIR = path.join(os.homedir(), ".forge", "cli");
const DEFAULT_REF = "main";

async function getCurrentRef(cwd: string): Promise<string> {
	try {
		const { stdout } = await execCommand(
			"git",
			["rev-parse", "--short", "HEAD"],
			{ cwd },
		);
		return stdout.trim();
	} catch {
		return "unknown";
	}
}

async function getCurrentBranch(cwd: string): Promise<string> {
	try {
		const { stdout } = await execCommand(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd },
		);
		return stdout.trim();
	} catch {
		return "unknown";
	}
}

export async function selfUpdate(ref: string): Promise<void> {
	const forgeDir = process.env.FORGE_INSTALL_DIR || DEFAULT_FORGE_DIR;

	if (!(await fileExists(path.join(forgeDir, ".git")))) {
		log.error(`Forge source not found at ${forgeDir}`);
		log.info(
			"If you installed forge to a different location, set FORGE_INSTALL_DIR.",
		);
		log.info("To reinstall from scratch, run the bootstrap installer instead.");
		process.exit(1);
	}

	const beforeRef = await getCurrentRef(forgeDir);
	const currentBranch = await getCurrentBranch(forgeDir);

	// Fetch and checkout the target ref.
	await withSpinner(`Fetching latest from ${ref}`, async () => {
		await execCommand("git", ["fetch", "origin", ref], { cwd: forgeDir });
	});

	// If the user is switching branches, check out the target.
	if (currentBranch !== ref) {
		await withSpinner(`Switching to ${ref}`, async () => {
			await execCommand("git", ["checkout", ref], { cwd: forgeDir });
		});
	}

	// Stash any local changes so the pull can proceed cleanly, then restore them.
	let stashed = false;
	try {
		const { stdout } = await execCommand(
			"git",
			["stash", "--include-untracked"],
			{ cwd: forgeDir },
		);
		stashed = !stdout.trim().startsWith("No local changes");
	} catch {
		// If stash fails we still attempt the pull
	}

	await withSpinner("Pulling latest changes", async () => {
		await execCommand("git", ["pull", "--ff-only", "origin", ref], {
			cwd: forgeDir,
		});
	});

	if (stashed) {
		try {
			await execCommand("git", ["stash", "pop"], { cwd: forgeDir });
		} catch {
			log.warn(
				"Local changes were stashed before the update but could not be restored. Run `git stash pop` in ~/.forge/cli to recover them.",
			);
		}
	}

	const afterRef = await getCurrentRef(forgeDir);

	if (beforeRef === afterRef) {
		log.success(`Already up to date (${afterRef})`);
		return;
	}

	// Reinstall dependencies and rebuild the CLI binary.
	await withSpinner("Installing dependencies", async () => {
		await pnpmInstall(forgeDir);
	});

	await withSpinner("Building forge", async () => {
		await pnpmRun("install:forge", forgeDir);
	});

	log.success(`Updated ${beforeRef} → ${afterRef}`);
}

export const selfUpdateCommand = new Command("self-update")
	.description("Update the forge CLI to the latest version")
	.argument("[ref]", "Branch or tag to update to", DEFAULT_REF)
	.action(async (ref: string) => {
		await selfUpdate(ref);
	});
