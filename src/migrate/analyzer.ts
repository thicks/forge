import path from "node:path";
import fs from "fs-extra";
import { fileExists, readFile } from "../utils/index.js";
import type {
	ExtractedPage,
	ExtractedRoute,
	MigrationManifest,
	ReplitConfig,
	SourceFile,
} from "./types.js";

/** Dependencies that are Replit-platform-specific */
const REPLIT_DEPS = [
	"@replit/vite-plugin-runtime-error-modal",
	"@replit/vite-plugin-cartographer",
	"@replit/vite-plugin-dev-banner",
	"openid-client",
	"passport",
	"connect-pg-simple",
	"@google-cloud/storage",
];

/** Dependencies tied to the Express/Vite server that Next.js replaces */
const SERVER_DEPS = [
	"express",
	"express-session",
	"express-rate-limit",
	"csurf",
	"cookie-parser",
	"cors",
	"compression",
	"vite",
	"@vitejs/plugin-react",
	"esbuild",
	"tsx",
	"memoizee",
];

/** Replit-specific import patterns to flag in source files */
const REPLIT_IMPORT_PATTERNS = [
	"@replit/",
	"replit_integrations",
	"@google-cloud/storage",
	"openid-client",
	"passport",
];

// ─── .replit parser ───────────────────────────────────────────────────

async function parseReplitConfig(
	sourceDir: string,
): Promise<ReplitConfig | null> {
	const replitPath = path.join(sourceDir, ".replit");
	if (!(await fileExists(replitPath))) return null;

	const content = await readFile(replitPath);
	const config: ReplitConfig = {
		modules: [],
		run: "",
		port: 5000,
		deploymentTarget: "",
		integrations: [],
	};

	// Parse modules
	const modulesMatch = content.match(/modules\s*=\s*\[([^\]]*)\]/);
	if (modulesMatch) {
		config.modules = modulesMatch[1]
			.split(",")
			.map((m) => m.trim().replace(/"/g, ""))
			.filter(Boolean);
	}

	// Parse run command
	const runMatch = content.match(/^run\s*=\s*"([^"]+)"/m);
	if (runMatch) config.run = runMatch[1];

	// Parse port
	const portMatch = content.match(/localPort\s*=\s*(\d+)/);
	if (portMatch) config.port = Number.parseInt(portMatch[1], 10);

	// Parse deployment target
	const deployMatch = content.match(/deploymentTarget\s*=\s*"([^"]+)"/);
	if (deployMatch) config.deploymentTarget = deployMatch[1];

	// Parse agent integrations
	const intMatch = content.match(/integrations\s*=\s*\[([^\]]*)\]/);
	if (intMatch) {
		config.integrations = intMatch[1]
			.split(",")
			.map((i) => i.trim().replace(/"/g, ""))
			.filter(Boolean);
	}

	return config;
}

// ─── Express route extractor ──────────────────────────────────────────

/**
 * Finds the index of the closing brace matching the opening brace at
 * `openIdx`, skipping braces inside strings, template literals, and comments.
 * Returns -1 if no matching brace is found.
 */
function findMatchingBrace(content: string, openIdx: number): number {
	let depth = 0;
	let i = openIdx;

	while (i < content.length) {
		const ch = content[i];
		const next = content[i + 1];

		// Line comment
		if (ch === "/" && next === "/") {
			const end = content.indexOf("\n", i);
			i = end === -1 ? content.length : end + 1;
			continue;
		}

		// Block comment
		if (ch === "/" && next === "*") {
			const end = content.indexOf("*/", i + 2);
			i = end === -1 ? content.length : end + 2;
			continue;
		}

		// Strings and template literals
		if (ch === '"' || ch === "'" || ch === "`") {
			i++;
			while (i < content.length && content[i] !== ch) {
				if (content[i] === "\\") i++;
				i++;
			}
			i++;
			continue;
		}

		if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) return i;
		}
		i++;
	}

	return -1;
}

function extractExpressRoutes(routesContent: string): ExtractedRoute[] {
	const routes: ExtractedRoute[] = [];
	const lines = routesContent.split("\n");

	// Byte offset of the start of each line
	const lineOffsets: number[] = [];
	let offset = 0;
	for (const line of lines) {
		lineOffsets.push(offset);
		offset += line.length + 1;
	}

	// Match patterns like: app.get("/api/domains", isAuthenticated, async (req, res) => {
	const routeRegex =
		/app\.(get|post|put|patch|delete)\(\s*["'`](\/api\/[^"'`]+)["'`]\s*,\s*(.*)/;

	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(routeRegex);
		if (!match) continue;

		const method = match[1] as ExtractedRoute["method"];
		const routePath = match[2];
		const rest = match[3];

		// Extract middleware names from the rest of the line before the handler
		const middleware: string[] = [];
		const middlewareRegex = /(\w+)\s*,/g;
		const handlerStart = rest.search(/(?:async\s+)?\((?:req|request)/);

		if (handlerStart > 0) {
			const middlewarePart = rest.substring(0, handlerStart);
			for (const mMatch of middlewarePart.matchAll(middlewareRegex)) {
				const name = mMatch[1];
				// Skip common false positives
				if (
					!["async", "req", "res", "next", "request", "response"].includes(name)
				) {
					middleware.push(name);
				}
			}
		}

		// Find the handler's opening brace and its matching close brace,
		// skipping braces inside strings, template literals, and comments
		const openIdx = routesContent.indexOf("{", lineOffsets[i]);
		if (openIdx === -1) continue;
		const closeIdx = findMatchingBrace(routesContent, openIdx);
		if (closeIdx === -1) continue;

		// Extract handler body (content between the braces), including any
		// body code on the same line as the opening brace
		const handlerBody = routesContent.slice(openIdx + 1, closeIdx).trim();

		const handlerStartLine = i;
		let handlerEndLine = i;
		while (
			handlerEndLine + 1 < lineOffsets.length &&
			lineOffsets[handlerEndLine + 1] <= closeIdx
		) {
			handlerEndLine++;
		}

		routes.push({
			method,
			path: routePath,
			middleware,
			startLine: handlerStartLine + 1,
			endLine: handlerEndLine + 1,
			handlerBody,
		});
	}

	return routes;
}

// ─── Wouter page extractor ────────────────────────────────────────────

async function extractPages(
	sourceDir: string,
	appTsxContent: string,
): Promise<ExtractedPage[]> {
	const pages: ExtractedPage[] = [];

	// Extract import-to-file mappings
	const importMap: Record<string, string> = {};
	const importRegex = /import\s+(\w+)\s+from\s+["'`](@\/pages\/[^"'`]+)["'`]/g;
	for (const importMatch of appTsxContent.matchAll(importRegex)) {
		const componentName = importMatch[1];
		const importPath = importMatch[2].replace("@/", "client/src/");
		// Resolve to .tsx file
		const resolved = path.join(sourceDir, `${importPath}.tsx`);
		importMap[componentName] = resolved;
	}

	// Determine which routes are inside AuthGuard (admin routes)
	const isInsideAuthGuard = (lineIndex: number, lines: string[]): boolean => {
		// Walk backwards to find if we're inside AuthGuard
		let depth = 0;
		for (let i = lineIndex; i >= 0; i--) {
			if (lines[i].includes("</AuthGuard>")) depth++;
			if (
				lines[i].includes("<AuthGuard>") ||
				lines[i].includes("<AuthGuard ")
			) {
				if (depth === 0) return true;
				depth--;
			}
		}
		return false;
	};

	const lines = appTsxContent.split("\n");

	// Match <Route path="..." component={...} />
	const routeRegex = /<Route\s+path=["'`]([^"'`]+)["'`]\s+component=\{(\w+)\}/;

	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(routeRegex);
		if (!match) continue;

		const routePath = match[1];
		const componentName = match[2];
		const componentFile = importMap[componentName] || "";
		const requiresAuth = isInsideAuthGuard(i, lines);
		const isAdmin =
			requiresAuth && (routePath.startsWith("/admin") || routePath === "/");

		pages.push({
			path: routePath,
			componentName,
			componentFile,
			requiresAuth,
			isAdmin,
		});
	}

	return pages;
}

// ─── Source file cataloger ────────────────────────────────────────────

async function catalogSourceFiles(
	dir: string,
	sourceDir: string,
): Promise<SourceFile[]> {
	if (!(await fileExists(dir))) return [];

	const files: SourceFile[] = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const subFiles = await catalogSourceFiles(fullPath, sourceDir);
			files.push(...subFiles);
		} else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
			const content = await readFile(fullPath);
			const replitImports: string[] = [];
			for (const pattern of REPLIT_IMPORT_PATTERNS) {
				if (content.includes(pattern)) {
					replitImports.push(pattern);
				}
			}
			files.push({
				relativePath: path.relative(sourceDir, fullPath),
				absolutePath: fullPath,
				hasReplitDeps: replitImports.length > 0,
				replitImports,
			});
		}
	}

	return files;
}

async function listFiles(dir: string): Promise<string[]> {
	if (!(await fileExists(dir))) return [];
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listFiles(fullPath)));
		} else {
			files.push(fullPath);
		}
	}
	return files;
}

// ─── Main analyzer ───────────────────────────────────────────────────

export async function analyzeSource(
	sourceDir: string,
): Promise<MigrationManifest> {
	const warnings: string[] = [];
	const absSource = path.resolve(sourceDir);

	// Parse package.json for app name and dependencies
	let appName = path.basename(absSource);
	let dependencies: Record<string, string> = {};
	let devDependencies: Record<string, string> = {};

	const pkgPath = path.join(absSource, "package.json");
	if (await fileExists(pkgPath)) {
		const pkg = JSON.parse(await readFile(pkgPath));
		if (pkg.name) appName = pkg.name;
		dependencies = pkg.dependencies || {};
		devDependencies = pkg.devDependencies || {};
	}

	// Categorize Replit and server-specific dependencies
	const replitDependencies = [
		...Object.keys(dependencies),
		...Object.keys(devDependencies),
	].filter((dep) => REPLIT_DEPS.some((rd) => dep.includes(rd)));

	const serverDependencies = [
		...Object.keys(dependencies),
		...Object.keys(devDependencies),
	].filter((dep) => SERVER_DEPS.includes(dep));

	// Parse .replit config
	const replitConfig = await parseReplitConfig(absSource);

	// Extract Express routes
	let routes: ExtractedRoute[] = [];
	const routesPath = path.join(absSource, "server", "routes.ts");
	if (await fileExists(routesPath)) {
		const routesContent = await readFile(routesPath);
		routes = extractExpressRoutes(routesContent);
	} else {
		warnings.push("No server/routes.ts found - no API routes to convert");
	}

	// Extract React pages from App.tsx
	let pages: ExtractedPage[] = [];
	const appTsxPath = path.join(absSource, "client", "src", "App.tsx");
	if (await fileExists(appTsxPath)) {
		const appTsxContent = await readFile(appTsxPath);
		pages = await extractPages(absSource, appTsxContent);
	} else {
		warnings.push("No client/src/App.tsx found - no pages to convert");
	}

	// Locate schema, storage, and drizzle config
	const schemaFile = (await fileExists(
		path.join(absSource, "shared", "schema.ts"),
	))
		? path.join(absSource, "shared", "schema.ts")
		: null;

	const storageFile = (await fileExists(
		path.join(absSource, "server", "storage.ts"),
	))
		? path.join(absSource, "server", "storage.ts")
		: null;

	const drizzleConfigFile = (await fileExists(
		path.join(absSource, "drizzle.config.ts"),
	))
		? path.join(absSource, "drizzle.config.ts")
		: null;

	// Collect migration files
	const migrationsDir = path.join(absSource, "migrations");
	let migrationFiles: string[] = [];
	if (await fileExists(migrationsDir)) {
		migrationFiles = await listFiles(migrationsDir);
	}

	// Catalog components, hooks, and lib files
	const componentsDir = path.join(absSource, "client", "src", "components");
	const uiDir = path.join(absSource, "client", "src", "components", "ui");
	const hooksDir = path.join(absSource, "client", "src", "hooks");
	const libDir = path.join(absSource, "client", "src", "lib");

	// Custom components (exclude ui/ subdirectory)
	const allComponents = await catalogSourceFiles(componentsDir, absSource);
	const uiComponents = allComponents.filter((f) =>
		f.relativePath.includes(path.join("components", "ui")),
	);
	const components = allComponents.filter(
		(f) => !f.relativePath.includes(path.join("components", "ui")),
	);

	const hooks = await catalogSourceFiles(hooksDir, absSource);
	const libFiles = await catalogSourceFiles(libDir, absSource);

	// Static assets
	const publicDir = path.join(absSource, "client", "public");
	const staticAssets = await listFiles(publicDir);

	if (!schemaFile) warnings.push("No shared/schema.ts found");
	if (!storageFile) warnings.push("No server/storage.ts found");

	return {
		appName,
		sourceDir: absSource,
		replitConfig,
		routes,
		pages,
		schemaFile,
		storageFile,
		drizzleConfigFile,
		migrationFiles,
		components,
		uiComponents,
		hooks,
		libFiles,
		staticAssets,
		dependencies,
		devDependencies,
		replitDependencies,
		serverDependencies,
		warnings,
	};
}
