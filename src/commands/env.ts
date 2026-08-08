import { join, resolve } from "node:path";
import { Command } from "commander";
import kleur from "kleur";
import prompts from "prompts";
import { runEnvTui } from "../tui/env-app.js";
import { loadConfig } from "../utils/config-manager.js";
import {
	backupEnvFile,
	diffEnvVars,
	isSensitiveVar,
	parseLocalEnvFile,
	writeEnvFile,
} from "../utils/env-diff.js";
import { vercelEnvAdd } from "../utils/exec.js";
import {
	type VercelEnvTarget,
	findVercelProjectJson,
	listVercelEnvVars,
	upsertVercelEnvVar,
} from "../utils/vercel-env.js";

type TargetEnv = "development" | "preview" | "production";

function isValidTarget(val: string): val is TargetEnv {
	return ["development", "preview", "production"].includes(val);
}

/** Resolve the project dir from process cwd. */
function resolveProjectDir(): string {
	return resolve(process.cwd());
}

/** Returns the per-environment Vercel snapshot file path. */
function vercelEnvFilePath(dir: string, env: TargetEnv): string {
	return join(dir, `.env.vercel.${env}`);
}

/** Prompt user to select a Vercel environment interactively. */
async function promptEnv(): Promise<TargetEnv> {
	const { env } = await prompts({
		type: "select",
		name: "env",
		message: "Which Vercel environment?",
		choices: [
			{ title: "development", value: "development" },
			{ title: "preview", value: "preview" },
			{ title: "production", value: "production" },
		],
	});
	if (!env) process.exit(0);
	return env as TargetEnv;
}

/**
 * Prompt user to optionally pick a local .env file to merge pulled vars into.
 * Returns the full path to the chosen file, or null if the user opts out.
 */
async function promptLocalEnvTarget(
	projectDir: string,
): Promise<string | null> {
	const { target } = await prompts({
		type: "select",
		name: "target",
		message: "Update a local .env file?",
		choices: [
			{ title: ".env.local", value: ".env.local" },
			{ title: ".env.development.local", value: ".env.development.local" },
			{ title: "No, exit", value: null },
		],
	});
	// undefined means Ctrl+C
	if (target === undefined) return null;
	return target ? join(projectDir, target) : null;
}

const envCommand = new Command("env").description(
	"Sync environment variables between .env.vercel.{env} and Vercel",
);

// --------------------------------------------------------------------------
// forge env pull
// --------------------------------------------------------------------------

const envPullCommand = new Command("pull")
	.description(
		"Pull env vars from Vercel into .env.vercel.{env}, then optionally merge into a local .env file",
	)
	.option(
		"--env <environment>",
		"Target environment: development | preview | production",
	)
	.option("--dry-run", "Show diff without writing any changes", false)
	.action(async (opts: { env?: string; dryRun: boolean }) => {
		const { dryRun } = opts;

		// Resolve env from flag or interactive prompt
		let targetEnv: TargetEnv;
		if (opts.env) {
			if (!isValidTarget(opts.env)) {
				console.error(
					kleur.red(
						`Invalid environment "${opts.env}". Use development, preview, or production.`,
					),
				);
				process.exit(1);
			}
			targetEnv = opts.env;
		} else {
			targetEnv = await promptEnv();
		}

		const isProduction = targetEnv === "production";
		const projectDir = resolveProjectDir();
		const vercelFilePath = vercelEnvFilePath(projectDir, targetEnv);

		// Locate Vercel project
		const project = await findVercelProjectJson(projectDir);
		if (!project) {
			console.error(
				kleur.red(
					"No .vercel/project.json found. Run `vercel link` to link this project first.",
				),
			);
			process.exit(1);
		}

		console.log(
			kleur.cyan(
				`Fetching ${targetEnv} env vars from Vercel project ${project.projectId}…`,
			),
		);

		let remoteVars: Awaited<ReturnType<typeof listVercelEnvVars>>;
		try {
			remoteVars = await listVercelEnvVars(
				project.projectId,
				project.orgId,
				targetEnv,
			);
		} catch (err) {
			console.error(kleur.red(`Failed to fetch Vercel env vars: ${err}`));
			process.exit(1);
		}

		// Phase 1: always write full snapshot to .env.vercel.{env}
		if (!dryRun) {
			const remoteMap = new Map(
				remoteVars
					.filter((v) => v.value !== undefined)
					.map((v) => [v.key, v.value as string]),
			);
			await writeEnvFile(vercelFilePath, remoteMap);
			console.log(
				kleur.green(
					`✓ Saved ${remoteVars.length} variable(s) to .env.vercel.${targetEnv}`,
				),
			);
		}

		// Phase 2: optionally merge into a local .env file
		const localFilePath = await promptLocalEnvTarget(projectDir);
		if (!localFilePath) {
			return;
		}

		const localVars = await parseLocalEnvFile(localFilePath);
		const diff = diffEnvVars(localVars, remoteVars);

		// Pull only acts on vars that exist in Vercel: new remote vars (added) and
		// conflicting values (modified). Local-only vars are never touched on pull.
		const pullableDiff = diff.filter(
			(e) => e.status === "added" || e.status === "modified",
		);

		const localFileName = localFilePath.split("/").pop() ?? localFilePath;

		if (pullableDiff.length === 0) {
			console.log(
				kleur.green(`✓ ${localFileName} is already in sync with Vercel.`),
			);
			return;
		}

		if (dryRun) {
			console.log(
				kleur.bold(
					`\nDry run — changes that would be applied to ${localFileName}:\n`,
				),
			);
			for (const entry of pullableDiff) {
				const prefix =
					entry.status === "added" ? kleur.green("+") : kleur.yellow("~");
				console.log(`${prefix} ${entry.key}`);
			}
			console.log(
				kleur.dim(`\n${pullableDiff.length} change(s) — no files written.`),
			);
			return;
		}

		// Launch Ink TUI with pull-relevant entries plus unchanged for context
		const selectedKeys = await runEnvTui({
			entries: [
				...pullableDiff,
				...diff.filter((e) => e.status === "unchanged"),
			],
			mode: "pull",
			targetEnv,
			isProduction,
		});

		if (!selectedKeys || selectedKeys.length === 0) {
			console.log(kleur.dim("No changes applied."));
			return;
		}

		// Backup existing local file before writing
		const backupPath = await backupEnvFile(localFilePath);
		if (backupPath) {
			console.log(kleur.dim(`  Backed up ${localFileName} → ${backupPath}`));
		}

		// Apply selected remote values; local-only vars are always preserved
		const remoteMap = new Map(
			remoteVars
				.filter((v) => v.value !== undefined)
				.map((v) => [v.key, v.value as string]),
		);
		const updated = new Map(localVars);

		for (const key of selectedKeys) {
			const remoteVal = remoteMap.get(key);
			if (remoteVal !== undefined) updated.set(key, remoteVal);
		}

		await writeEnvFile(localFilePath, updated);
		console.log(
			kleur.green(
				`✓ Applied ${selectedKeys.length} change(s) to ${localFileName}`,
			),
		);
	});

// --------------------------------------------------------------------------
// forge env push
// --------------------------------------------------------------------------

const envPushCommand = new Command("push")
	.description("Push .env.vercel.{env} vars to Vercel with an interactive diff")
	.option(
		"--env <environment>",
		"Target environment: development | preview | production",
	)
	.option("--dry-run", "Show diff without pushing any changes", false)
	.action(async (opts: { env?: string; dryRun: boolean }) => {
		const { dryRun } = opts;

		// Resolve env from flag or interactive prompt
		let targetEnv: TargetEnv;
		if (opts.env) {
			if (!isValidTarget(opts.env)) {
				console.error(
					kleur.red(
						`Invalid environment "${opts.env}". Use development, preview, or production.`,
					),
				);
				process.exit(1);
			}
			targetEnv = opts.env;
		} else {
			targetEnv = await promptEnv();
		}

		const isProduction = targetEnv === "production";
		const projectDir = resolveProjectDir();
		const sourceFilePath = vercelEnvFilePath(projectDir, targetEnv);

		// Locate Vercel project
		const project = await findVercelProjectJson(projectDir);
		if (!project) {
			console.error(
				kleur.red(
					"No .vercel/project.json found. Run `vercel link` to link this project first.",
				),
			);
			process.exit(1);
		}

		const localVars = await parseLocalEnvFile(sourceFilePath);
		if (localVars.size === 0) {
			console.error(
				kleur.red(
					`No variables found in .env.vercel.${targetEnv}. Run \`forge env pull --env ${targetEnv}\` first.`,
				),
			);
			process.exit(1);
		}

		console.log(
			kleur.cyan(
				`Fetching ${targetEnv} env vars from Vercel project ${project.projectId}…`,
			),
		);

		let remoteVars: Awaited<ReturnType<typeof listVercelEnvVars>>;
		try {
			remoteVars = await listVercelEnvVars(
				project.projectId,
				project.orgId,
				targetEnv,
			);
		} catch (err) {
			console.error(kleur.red(`Failed to fetch Vercel env vars: ${err}`));
			process.exit(1);
		}

		const diff = diffEnvVars(localVars, remoteVars);
		// For push we only act on vars that exist locally: local-only vars
		// (status "removed") are added to the remote, "modified" vars are updated.
		const changes = diff.filter(
			(e) => e.localValue !== undefined && e.status !== "unchanged",
		);

		if (changes.length === 0) {
			console.log(
				kleur.green(
					`✓ Vercel is already in sync with .env.vercel.${targetEnv}.`,
				),
			);
			return;
		}

		if (dryRun) {
			console.log(kleur.bold("\nDry run — variables that would be pushed:\n"));
			for (const entry of changes) {
				const prefix =
					entry.remoteValue === undefined
						? kleur.green("+")
						: kleur.yellow("~");
				console.log(`${prefix} ${entry.key}`);
			}
			console.log(kleur.dim(`\n${changes.length} change(s) — nothing pushed.`));
			return;
		}

		// Show TUI with original diff so the user can see local vs remote
		const selectedKeys = await runEnvTui({
			entries: diff.filter((e) => e.localValue !== undefined),
			mode: "push",
			targetEnv,
			isProduction,
		});

		if (!selectedKeys || selectedKeys.length === 0) {
			console.log(kleur.dim("No changes pushed."));
			return;
		}

		const remoteMap = new Map(remoteVars.map((v) => [v.key, v]));
		const team = (await loadConfig()).vercel?.team;

		let pushed = 0;
		for (const key of selectedKeys) {
			const localValue = localVars.get(key);
			if (localValue === undefined) continue;

			const existingRemote = remoteMap.get(key);

			try {
				await upsertVercelEnvVar(
					project.projectId,
					project.orgId,
					key,
					localValue,
					Array.from(new Set([...(existingRemote?.target ?? []), targetEnv])),
					existingRemote?.id,
					isSensitiveVar(key, existingRemote?.type) ? "sensitive" : "plain",
				);
				pushed++;
			} catch (apiErr) {
				// Fallback: shell out to `vercel env add`
				if (!team) {
					console.error(
						kleur.red(
							`  API failed for ${key} and no Vercel team is configured for the CLI fallback. Run 'forge config' to set one.`,
						),
					);
					continue;
				}
				console.log(
					kleur.dim(`  API failed for ${key}, falling back to vercel CLI…`),
				);
				try {
					await vercelEnvAdd(key, localValue, targetEnv, projectDir, team, {
						sensitive: isSensitiveVar(key, existingRemote?.type),
						force: !!existingRemote,
					});
					pushed++;
				} catch (cliErr) {
					console.error(kleur.red(`  Failed to push ${key}: ${cliErr}`));
				}
			}
		}

		console.log(
			kleur.green(`✓ Pushed ${pushed} variable(s) to Vercel (${targetEnv})`),
		);
	});

envCommand.addCommand(envPullCommand);
envCommand.addCommand(envPushCommand);

export { envCommand };
