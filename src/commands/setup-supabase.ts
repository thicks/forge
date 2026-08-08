import crypto from "node:crypto";
import { writeFile as fsWriteFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import prompts from "prompts";
import {
	execCommand,
	fileExists,
	log,
	supabaseLink,
	supabaseOrgsList,
	supabaseProjectStatus,
	supabaseProjectsCreate,
	supabaseProjectsList,
	supabaseVersion,
	withSpinner,
} from "../utils/index.js";

export interface SupabaseProvisionResult {
	projectRef: string;
	databaseUrl: string | null;
}

/**
 * Provision (or link) a Supabase cloud project and return the project ref
 * and a constructed DATABASE_URL. This is the shared core used by both the
 * standalone `--supabase` flag and the Vercel setup pipeline.
 */
export async function setupSupabase(
	cwd: string,
	projectName: string,
	token?: string,
	options: { ci?: boolean } = {},
): Promise<SupabaseProvisionResult | null> {
	log.info(`Provisioning Supabase project: ${projectName}`);
	if (options.ci) {
		throw new Error(
			"Supabase cloud provisioning requires interactive project and database credentials; run it outside --ci or pre-link the project and provide its password.",
		);
	}

	const version = await supabaseVersion();
	if (!version) {
		log.error(
			"Supabase CLI is not installed. Install it with: brew install supabase/tap/supabase",
		);
		return null;
	}

	const supabaseDir = path.join(cwd, ".supabase");

	// Check if already linked
	const projectRefPath = path.join(supabaseDir, ".project-ref");
	let projectRef: string | null = null;

	if (await fileExists(projectRefPath)) {
		const savedRef = (await readFile(projectRefPath, "utf-8")).trim();

		// Validate the saved ref is still live — it may be stale from a prior failed run
		const status = await supabaseProjectStatus(savedRef, token);
		if (status === "ACTIVE_HEALTHY") {
			projectRef = savedRef;
			log.info(`Already linked to Supabase project: ${projectRef}`);
		} else {
			log.warn(
				`Saved project ref ${savedRef} is not healthy (status: ${status ?? "not found"}).`,
			);
			const { action } = await prompts({
				type: "select",
				name: "action",
				message: "What would you like to do?",
				choices: [
					{
						title: "Clear stale state and reprovision",
						value: "clear",
					},
					{ title: "Use this ref anyway", value: "keep" },
				],
			});

			if (action === "keep") {
				projectRef = savedRef;
				log.info(`Using ref anyway: ${projectRef}`);
			} else {
				// Remove stale files so createOrLinkSupabaseProject runs fresh
				try {
					await import("node:fs/promises").then((fs) =>
						fs.rm(supabaseDir, { recursive: true, force: true }),
					);
				} catch {
					// Non-fatal — directory may not exist
				}
				log.info("Cleared stale Supabase state. Reprovisioning...");
			}
		}
	}

	if (!projectRef) {
		projectRef = await createOrLinkSupabaseProject(
			cwd,
			supabaseDir,
			projectName,
			token,
		);
	}

	if (!projectRef) {
		log.warn("Supabase project not configured");
		return null;
	}

	// Wait for database to be ready
	const isReady = await waitForSupabaseReady(projectRef, token);
	if (!isReady) {
		log.warn(
			"Database did not reach ACTIVE_HEALTHY status. You may need to configure it manually.",
		);
		return { projectRef, databaseUrl: null };
	}

	// Ensure .db-password exists before linking — read it outside the spinner
	// so a missing file fails fast with a clear error rather than hanging
	const dbPasswordPath = path.join(supabaseDir, ".db-password");
	let dbPassword: string;
	if (await fileExists(dbPasswordPath)) {
		dbPassword = (await readFile(dbPasswordPath, "utf-8")).trim();
	} else {
		log.warn("Database password not found. Please enter it to continue.");
		const { password } = await prompts({
			type: "password",
			name: "password",
			message:
				"Enter the database password for this Supabase project (Settings → Database in the dashboard):",
		});
		if (!password) {
			log.error("Database password is required to link the Supabase project.");
			return null;
		}
		await mkdir(supabaseDir, { recursive: true });
		await fsWriteFile(dbPasswordPath, password, { mode: 0o600 });
		dbPassword = password;
	}

	// Link supabase project locally
	await withSpinner("Linking Supabase project", async () => {
		await supabaseLink(projectRef, cwd, dbPassword, token);
	});

	const databaseUrl = await constructDatabaseUrl(supabaseDir, projectRef);

	log.success(`Supabase project provisioned: ${projectRef}`);
	return { projectRef, databaseUrl };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function createOrLinkSupabaseProject(
	supabaseRoot: string,
	supabaseDir: string,
	projectName: string,
	token?: string,
): Promise<string | null> {
	const projects = await supabaseProjectsList(token);
	const existing = projects.find((p) => p.name === projectName);

	if (existing) {
		log.info(
			`Supabase project '${projectName}' already exists (ref: ${existing.id})`,
		);

		const { action } = await prompts({
			type: "select",
			name: "action",
			message: "Project already exists. What would you like to do?",
			choices: [
				{ title: "Link to existing project", value: "link" },
				{ title: "Create with different name", value: "rename" },
				{ title: "Cancel", value: "cancel" },
			],
		});

		if (action === "link") {
			const { dbPassword } = await prompts({
				type: "password",
				name: "dbPassword",
				message:
					"Enter the database password for this Supabase project (Settings → Database in the dashboard):",
			});
			if (!dbPassword) return null;
			await mkdir(supabaseDir, { recursive: true });
			await fsWriteFile(path.join(supabaseDir, ".db-password"), dbPassword, {
				mode: 0o600,
			});
			await saveProjectRef(supabaseDir, existing.id, existing.region);
			return existing.id;
		}
		if (action === "rename") {
			const { newName } = await prompts({
				type: "text",
				name: "newName",
				message: "Enter new project name:",
			});
			if (!newName) return null;
			return await createNewSupabaseProject(
				supabaseRoot,
				supabaseDir,
				newName,
				token,
			);
		}
		return null;
	}

	return await createNewSupabaseProject(
		supabaseRoot,
		supabaseDir,
		projectName,
		token,
	);
}

async function createNewSupabaseProject(
	supabaseRoot: string,
	supabaseDir: string,
	name: string,
	token?: string,
): Promise<string | null> {
	const orgs = await supabaseOrgsList(token);
	if (orgs.length === 0) {
		log.error("No Supabase organizations found. Create one at supabase.com.");
		return null;
	}

	let orgId: string;
	if (orgs.length === 1) {
		orgId = orgs[0].id;
		log.info(`Using organization: ${orgs[0].name}`);
	} else {
		const { selectedOrg } = await prompts({
			type: "select",
			name: "selectedOrg",
			message: "Select Supabase organization:",
			choices: orgs.map((org) => ({ title: org.name, value: org.id })),
		});
		if (!selectedOrg) return null;
		orgId = selectedOrg;
	}

	const dbPassword = crypto
		.randomBytes(18)
		.toString("base64")
		.replace(/[^a-zA-Z0-9]/g, "")
		.slice(0, 20);

	log.info(`Creating Supabase project: ${name}`);
	log.info("The CLI will prompt you to select a region.");

	try {
		await supabaseProjectsCreate(name, orgId, dbPassword, supabaseRoot, token);
	} catch {
		log.error("Could not create Supabase project via CLI");
		return null;
	}

	// Persist password for DATABASE_URL construction
	await mkdir(supabaseDir, { recursive: true });
	await fsWriteFile(path.join(supabaseDir, ".db-password"), dbPassword, {
		mode: 0o600,
	});

	// Poll for the newly-created project reference
	log.info("Fetching project details...");
	let projectRef: string | null = null;
	let region: string | null = null;

	for (let attempt = 0; attempt < 10; attempt++) {
		const projects = await supabaseProjectsList(token);
		const found = projects.find((p) => p.name === name);
		if (found) {
			projectRef = found.id;
			region = found.region;
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 10000));
	}

	if (!projectRef) {
		log.warn("Could not find project automatically.");
		const { manualRef } = await prompts({
			type: "text",
			name: "manualRef",
			message:
				"Enter the project reference (from Supabase dashboard > Settings > General):",
		});
		projectRef = manualRef || null;
	}

	if (projectRef) {
		await saveProjectRef(supabaseDir, projectRef, region);
	}

	return projectRef;
}

async function saveProjectRef(
	supabaseDir: string,
	projectRef: string,
	region: string | null,
): Promise<void> {
	await mkdir(supabaseDir, { recursive: true });
	await fsWriteFile(path.join(supabaseDir, ".project-ref"), projectRef);
	if (region) {
		await fsWriteFile(path.join(supabaseDir, ".region"), region);
	}
}

async function waitForSupabaseReady(
	projectRef: string,
	token?: string,
): Promise<boolean> {
	log.info("Waiting for database to be ready...");

	for (let attempt = 1; attempt <= 12; attempt++) {
		const status = await supabaseProjectStatus(projectRef, token);

		if (status === "ACTIVE_HEALTHY") {
			log.success("Database is ready");
			// Give pooler endpoints a moment to become fully available
			await new Promise((resolve) => setTimeout(resolve, 5000));
			return true;
		}

		log.info(
			`  Waiting for database to provision (attempt ${attempt}/12, status: ${status || "unknown"})...`,
		);
		await new Promise((resolve) => setTimeout(resolve, 60000));
	}

	return false;
}

/**
 * Construct the session pooler DATABASE_URL from saved credentials.
 * Uses aws-1 (session pooler, port 5432) which supports DDL operations.
 */
export async function constructDatabaseUrl(
	supabaseDir: string,
	projectRef: string,
): Promise<string | null> {
	try {
		const dbPassword = (
			await readFile(path.join(supabaseDir, ".db-password"), "utf-8")
		).trim();
		const region = (
			await readFile(path.join(supabaseDir, ".region"), "utf-8")
		).trim();

		return `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-1-${region}.pooler.supabase.com:5432/postgres`;
	} catch {
		return null;
	}
}
