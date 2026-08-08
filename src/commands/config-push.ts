import { Command } from "commander";
import { getDefaultConfigPath } from "../utils/config-manager.js";
import { execCommand } from "../utils/exec.js";
import { fileExists } from "../utils/fs.js";
import { log } from "../utils/logger.js";

async function runConfigPush(
	sshHost: string,
	options: { config?: string },
): Promise<void> {
	const configPath = options.config || getDefaultConfigPath();

	// Check if config file exists
	if (!(await fileExists(configPath))) {
		log.error(`Config file not found: ${configPath}`);
		log.info("Run 'forge config' to create a configuration file first");
		process.exit(1);
	}

	log.blank();
	log.step(`Pushing config to ${sshHost}...`);

	try {
		// Use scp to copy the config file to the remote host's home directory
		const remoteConfigName = configPath.split("/").pop() || ".forge.json";
		await execCommand("scp", [configPath, `${sshHost}:~/${remoteConfigName}`]);

		log.success(`Config pushed to ${sshHost}:~/${remoteConfigName}`);
		log.blank();
	} catch (error) {
		log.error(
			`Failed to push config: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

export const configPushCommand = new Command()
	.name("config-push")
	.description("Push config to a remote server via SSH")
	.argument("<ssh-host>", "SSH host (user@hostname)")
	.option("-c, --config <path>", "Config file to push")
	.action(runConfigPush);
