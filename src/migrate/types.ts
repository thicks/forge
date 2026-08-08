/** Shared types for the migrate command pipeline */

export type AuthType = "workos" | "demo" | "none";
export type DbType = "postgres" | "supabase";

export interface MigrateOptions {
	db: DbType;
	auth: AuthType;
	dryRun: boolean;
	verbose: boolean;
}

/** An Express route extracted from the source app */
export interface ExtractedRoute {
	method: "get" | "post" | "put" | "patch" | "delete";
	path: string;
	middleware: string[];
	startLine: number;
	endLine: number;
	handlerBody: string;
}

/** A React page route extracted from the wouter Router */
export interface ExtractedPage {
	path: string;
	componentName: string;
	componentFile: string;
	requiresAuth: boolean;
	isAdmin: boolean;
}

/** Metadata about a source component or file to migrate */
export interface SourceFile {
	relativePath: string;
	absolutePath: string;
	hasReplitDeps: boolean;
	replitImports: string[];
}

/** Parsed .replit configuration */
export interface ReplitConfig {
	modules: string[];
	run: string;
	port: number;
	deploymentTarget: string;
	integrations: string[];
}

/** The full manifest produced by the analyzer */
export interface MigrationManifest {
	appName: string;
	sourceDir: string;
	replitConfig: ReplitConfig | null;
	routes: ExtractedRoute[];
	pages: ExtractedPage[];
	schemaFile: string | null;
	storageFile: string | null;
	drizzleConfigFile: string | null;
	migrationFiles: string[];
	components: SourceFile[];
	uiComponents: SourceFile[];
	hooks: SourceFile[];
	libFiles: SourceFile[];
	staticAssets: string[];
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
	replitDependencies: string[];
	serverDependencies: string[];
	warnings: string[];
}

/** Summary of what was converted, used by the report generator */
export interface MigrationResult {
	routesConverted: number;
	routesNeedingReview: string[];
	pagesConverted: number;
	componentsCopied: number;
	componentsFlagged: string[];
	filesWritten: string[];
	warnings: string[];
}
