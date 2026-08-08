import path from "node:path";
import { ensureDir, writeFile } from "../utils/index.js";
import type {
	ExtractedRoute,
	MigrationManifest,
	MigrationResult,
} from "./types.js";

/** Known middleware that maps to auth checks */
const AUTH_MIDDLEWARE: Record<string, string> = {
	isAuthenticated: "requireAuth",
	isAdmin: "requireAdmin",
	isPrivilegedUser: "requirePrivileged",
	isDirectorOrAdmin: "requireDirectorOrAdmin",
};

/** Routes with complex patterns that need manual review */
const COMPLEX_PATTERNS = [
	"multer",
	"upload",
	"stream",
	"pipe",
	"createReadStream",
	"Buffer",
	"rawBody",
	"file",
	"res.redirect",
	"res.sendStatus",
	"res.format",
];

/**
 * Rewrites res.status(N).json(...), res.json(...), and res.status(N).send(...)
 * to NextResponse.json(...) using a balanced-paren scan so payloads with
 * nested calls (e.g. res.json({ count: rows.length })) aren't truncated.
 */
function rewriteResponseCalls(content: string): string {
	const pattern = /res\.(?:status\((\d+)\)\.)?(?:json|send)\(/g;
	let result = "";
	let last = 0;

	for (const match of content.matchAll(pattern)) {
		const openIdx = match.index + match[0].length - 1;

		// Scan for the matching close paren
		let depth = 0;
		let closeIdx = -1;
		for (let i = openIdx; i < content.length; i++) {
			const ch = content[i];
			if (ch === "(") {
				depth++;
			} else if (ch === ")") {
				depth--;
				if (depth === 0) {
					closeIdx = i;
					break;
				}
			}
		}
		if (closeIdx === -1) continue; // Unbalanced - leave as-is

		const payload = content.slice(openIdx + 1, closeIdx);
		const status = match[1];
		result += content.slice(last, match.index);
		result += status
			? `NextResponse.json(${payload}, { status: ${status} })`
			: `NextResponse.json(${payload})`;
		last = closeIdx + 1;
	}

	return result + content.slice(last);
}

/**
 * Converts an Express route path like /api/domains/:id to a Next.js
 * directory path like app/api/domains/[id].
 */
function expressPathToNextDir(routePath: string): string {
	return routePath
		.split("/")
		.filter(Boolean)
		.map((segment) => {
			if (segment.startsWith(":")) {
				return `[${segment.slice(1)}]`;
			}
			return segment;
		})
		.join("/");
}

/**
 * Extracts dynamic param names from a path like /api/domains/:id
 */
function extractParams(routePath: string): string[] {
	return routePath
		.split("/")
		.filter((s) => s.startsWith(":"))
		.map((s) => s.slice(1));
}

/**
 * Builds the params type string for a Next.js route handler.
 */
function buildParamsType(params: string[]): string {
	if (params.length === 0) return "";
	const fields = params.map((p) => `${p}: string`).join("; ");
	return `{ params }: { params: Promise<{ ${fields} }> }`;
}

/**
 * Groups routes by their file path (e.g. /api/domains and /api/domains/:id
 * produce two groups since they have different Next.js route files).
 */
function groupRoutesByFile(
	routes: ExtractedRoute[],
): Map<string, ExtractedRoute[]> {
	const groups = new Map<string, ExtractedRoute[]>();
	for (const route of routes) {
		const dirPath = expressPathToNextDir(route.path);
		const existing = groups.get(dirPath) || [];
		existing.push(route);
		groups.set(dirPath, existing);
	}
	return groups;
}

/**
 * Rewrites common Express patterns in handler bodies to Next.js equivalents.
 */
function rewriteHandlerBody(body: string, params: string[]): string {
	let result = body;

	// req.params.X -> (await params).X -- handled by destructuring in the function signature
	for (const p of params) {
		result = result.replace(new RegExp(`req\\.params\\.${p}`, "g"), p);
	}

	// req.body -> body (we'll add const body = await request.json() at top)
	result = result.replace(/req\.body/g, "body");

	// req.query.X -> searchParams.get("X")
	result = result.replace(/req\.query\.(\w+)/g, 'searchParams.get("$1")');
	result = result.replace(
		/req\.query\[["'`](\w+)["'`]\]/g,
		'searchParams.get("$1")',
	);

	// res.status(N).json(...) / res.json(...) / res.status(N).send(...)
	result = rewriteResponseCalls(result);

	// return res. -> return
	result = result.replace(/return\s+res\./g, "return ");

	// Rewrite shared schema imports
	result = result.replace(
		/from\s*["'`]@shared\/schema["'`]/g,
		'from "@/db/schema"',
	);
	result = result.replace(
		/from\s*["'`]@shared\/([^"'`]+)["'`]/g,
		'from "@/db/$1"',
	);

	return result;
}

/**
 * Generates a complete Next.js route.ts file for a group of routes
 * that share the same file path.
 */
function generateRouteFile(routes: ExtractedRoute[], routeDir: string): string {
	const params = extractParams(routes[0].path);

	// Collect unique auth middleware needed
	const authImports = new Set<string>();
	const unknownMiddleware = new Set<string>();
	for (const route of routes) {
		for (const mw of route.middleware) {
			if (AUTH_MIDDLEWARE[mw]) {
				authImports.add(AUTH_MIDDLEWARE[mw]);
			} else {
				unknownMiddleware.add(mw);
			}
		}
	}
	if (unknownMiddleware.size > 0) {
		throw new Error(
			`Cannot safely convert routes with unknown middleware: ${Array.from(unknownMiddleware).join(", ")}`,
		);
	}

	// Build imports
	const lines: string[] = [
		'import { NextRequest, NextResponse } from "next/server";',
	];
	if (routes.some((route) => route.handlerBody.includes("storage"))) {
		lines.push('import { storage } from "@/lib/storage";');
	}

	if (authImports.size > 0) {
		const imports = Array.from(authImports).join(", ");
		lines.push(`import { ${imports} } from "@/lib/auth";`);
	}

	lines.push("");

	// Generate each HTTP method export
	for (const route of routes) {
		const methodUpper = route.method.toUpperCase();
		const paramsSig = params.length > 0 ? `, ${buildParamsType(params)}` : "";

		// Build auth checks
		const authChecks: string[] = [];
		for (const mw of route.middleware) {
			if (AUTH_MIDDLEWARE[mw]) {
				authChecks.push(
					`\tconst authResult = await ${AUTH_MIDDLEWARE[mw]}(request);`,
				);
				authChecks.push("\tif (authResult) return authResult;");
			}
		}

		lines.push(
			`export async function ${methodUpper}(request: NextRequest${paramsSig}) {`,
		);
		lines.push("\ttry {");

		// Auth checks
		for (const check of authChecks) {
			lines.push(`\t${check}`);
		}

		// Destructure params if needed
		if (params.length > 0) {
			const destructure = params.join(", ");
			lines.push(`\t\tconst { ${destructure} } = await params;`);
		}

		// Parse body for mutating methods
		if (["post", "put", "patch"].includes(route.method)) {
			lines.push("\t\tconst body = await request.json();");
		}

		// Parse search params if query is used
		if (route.handlerBody.includes("req.query")) {
			lines.push("\t\tconst searchParams = request.nextUrl.searchParams;");
		}

		lines.push("");

		// Rewritten handler body
		const rewritten = rewriteHandlerBody(route.handlerBody, params);
		// Indent each line of the body
		const indented = rewritten
			.split("\n")
			.map((l) => `\t\t${l}`)
			.join("\n");
		lines.push(indented);

		lines.push("\t} catch (error: unknown) {");
		lines.push(
			"\t\tconsole.error(`${request.method} ${request.url} error:`, error);",
		);
		lines.push(
			'\t\treturn NextResponse.json({ message: "Internal server error" }, { status: 500 });',
		);
		lines.push("\t}");
		lines.push("}");
		lines.push("");
	}

	return lines.join("\n");
}

export async function convertRoutes(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	if (manifest.routes.length === 0) {
		result.warnings.push("No Express routes found to convert");
		return;
	}

	const grouped = groupRoutesByFile(manifest.routes);

	for (const [dirPath, routes] of grouped) {
		if (
			routes.some((route) => route.handlerBody.includes("storage")) &&
			!manifest.storageFile
		) {
			throw new Error(
				`Cannot convert ${dirPath}: the route uses storage but server/storage.ts is missing`,
			);
		}
		const fullDir = path.join(targetDir, "app", dirPath);
		await ensureDir(fullDir);

		const content = generateRouteFile(routes, dirPath);
		const filePath = path.join(fullDir, "route.ts");
		await writeFile(filePath, content);
		result.filesWritten.push(path.join("app", dirPath, "route.ts"));
		result.routesConverted += routes.length;

		// Check if any routes in this group need manual review
		for (const route of routes) {
			const needsReview = COMPLEX_PATTERNS.some((p) =>
				route.handlerBody.toLowerCase().includes(p.toLowerCase()),
			);
			if (needsReview) {
				result.routesNeedingReview.push(
					`${route.method.toUpperCase()} ${route.path} (complex pattern detected)`,
				);
			}
		}
	}
}
