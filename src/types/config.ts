/**
 * Configuration type definitions for forge.
 * Defines the structure of ~/.forge.json
 */

export interface ForgeConfig {
	github?: {
		org?: string;
		token?: string;
		email?: string;
		name?: string;
		/** Default repository visibility for gh repo create (internal, private, public). Defaults to internal. */
		visibility?: "internal" | "private" | "public";
	};
	vercel?: {
		team?: string;
		token?: string;
	};
	database?: {
		type: "postgres" | "supabase";
	};
	supabase?: {
		// Only present if database.type === "supabase"
		org?: string;
		region?: string;
		token?: string;
	};
	workos?: {
		// Shared default WorkOS credentials for new projects
		clientId?: string;
		apiKey?: string;
	};
	posthog?: {
		// PostHog analytics credentials
		projectApiKey?: string;
		host?: string;
	};
	envVars?: EnvVar[];
}

export interface EnvVar {
	key: string;
	value: string;
	environments: ("production" | "preview" | "development")[];
	sensitive?: boolean;
}

// ---------------------------------------------------------------------------
// Skills manifest types (assets/skills.json)
// ---------------------------------------------------------------------------

export interface LocalSkillEntry {
	id: string;
	source: "local";
	/** Path relative to the assets/ directory (e.g. "claude/skills/typecheck") */
	asset: string;
	always?: true;
	/** Condition string evaluated against scaffold context (e.g. "db", "auth:workos") */
	when?: string;
}

export interface RepoSkillEntry {
	id: string;
	source: "repo";
	/** GitHub repository URL */
	repo: string;
	/** Skill names to install from the repo via `npx skills add` */
	skills: string[];
	always?: true;
	/** Condition string evaluated against scaffold context (e.g. "db", "auth:betterauth") */
	when?: string;
}

export type SkillEntry = LocalSkillEntry | RepoSkillEntry;

export interface SkillManifest {
	skills: SkillEntry[];
}
