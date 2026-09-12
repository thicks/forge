import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { execCommand, fileExists, log, withSpinner } from "../utils/index.js";

const DEFAULT_FORGE_DIR = path.join(os.homedir(), ".forge", "cli");
const DEFAULT_REF = "main";

export async function selfUpdate(ref: string): Promise<void> {
	const forgeDir = process.env.FORGE_INSTALL_DIR || DEFAULT_FORGE_DIR;
	const installerPath = path.join(forgeDir, "install.sh");

	if (!(await fileExists(installerPath))) {
		log.error(`Forge installer not found at ${installerPath}`);
		log.info(
			"If you installed forge to a different location, set FORGE_INSTALL_DIR.",
		);
		log.info("To reinstall from scratch, run the bootstrap installer instead.");
		process.exit(1);
	}

	await withSpinner(`Updating forge from ${ref}`, async () => {
		await execCommand(
			"bash",
			[installerPath, "--branch", ref, "--install-dir", forgeDir],
			{
				cwd: os.homedir(),
				env: { ...process.env, FORGE_SKIP_POST_INSTALL: "1" },
			},
		);
	});

	log.success(`Updated forge to ${ref}`);
}

export const selfUpdateCommand = new Command("self-update")
	.description("Update the forge CLI to the latest version")
	.argument("[ref]", "Branch or tag to update to", DEFAULT_REF)
	.action(async (ref: string) => {
		await selfUpdate(ref);
	});
