import path from "node:path";
import {
	copyFile,
	ensureDir,
	fileExists,
	readFile,
	writeFile,
} from "../utils/index.js";
import type {
	MigrationManifest,
	MigrationResult,
	SourceFile,
} from "./types.js";

/** Import patterns that are Replit-platform-specific and need flagging */
const REPLIT_API_PATTERNS = [
	"@replit/",
	"replit_integrations",
	"@google-cloud/storage",
	"openid-client",
	"passport",
];

/** Patterns that indicate Replit object storage usage */
const OBJECT_STORAGE_PATTERNS = [
	"@uppy/",
	"ObjectUploader",
	"request-url",
	"presigned",
	"getUploadParameters",
];

/** Files that should be replaced rather than copied (Replit-specific implementations) */
const REPLACE_FILES: Record<string, string> = {
	"queryClient.ts": "query-client",
};

/**
 * Rewrites import paths from the Replit client source conventions
 * to the Next.js App Router target conventions.
 */
function rewriteImports(content: string): string {
	let result = content;

	// @shared/schema -> @/db/schema
	result = result.replace(
		/from\s*["'`]@shared\/schema["'`]/g,
		'from "@/db/schema"',
	);
	result = result.replace(
		/from\s*["'`]@shared\/([^"'`]+)["'`]/g,
		'from "@/db/$1"',
	);

	// Track next/navigation imports already present so they aren't duplicated
	const emittedNavImports = new Set<string>();
	const existingNavImport = content.match(
		/import\s*\{([^}]*)\}\s*from\s*["'`]next\/navigation["'`]/,
	);
	if (existingNavImport) {
		for (const name of existingNavImport[1].split(",")) {
			emittedNavImports.add(name.trim());
		}
	}

	// Rewrite wouter imports to next/navigation
	result = result.replace(
		/import\s*\{([^}]*)\}\s*from\s*["'`]wouter["'`]/g,
		(_: string, imports: string) => {
			const nextImports: string[] = [];
			if (imports.includes("useLocation"))
				nextImports.push("useRouter", "usePathname");
			if (imports.includes("useParams")) nextImports.push("useParams");
			if (imports.includes("useRoute")) nextImports.push("useParams");
			if (imports.includes("Link")) {
				// Link comes from next/link, not next/navigation — added separately
			}
			const unique = [...new Set(nextImports)].filter(
				(name) => !emittedNavImports.has(name),
			);
			for (const name of unique) emittedNavImports.add(name);
			if (unique.length === 0) return "";
			return `import { ${unique.join(", ")} } from "next/navigation"`;
		},
	);

	// Rewrite wouter Link default import
	result = result.replace(
		/import\s+Link\s+from\s*["'`]wouter["'`]/g,
		'import Link from "next/link"',
	);

	// If Link was in a named import from wouter, add it as a separate import
	if (
		content.match(/import\s*\{[^}]*Link[^}]*\}\s*from\s*["'`]wouter["'`]/) &&
		!result.includes('from "next/link"')
	) {
		result = `import Link from "next/link";\n${result}`;
	}

	// Rewrite useLocation() usage patterns
	// const [location] = useLocation() -> const pathname = usePathname()
	result = result.replace(
		/const\s*\[\s*(\w+)\s*\]\s*=\s*useLocation\(\)/g,
		"const $1 = usePathname()",
	);
	// const [location, setLocation] = useLocation() -> const router = useRouter(); const pathname = usePathname()
	// Only declare router once per file
	let routerDeclared = result.includes("const router = useRouter()");
	result = result.replace(
		/const\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useLocation\(\)/g,
		(_: string, loc: string) => {
			const pathnameLine = `const ${loc} = usePathname()`;
			if (routerDeclared) return pathnameLine;
			routerDeclared = true;
			return `const router = useRouter();\n\t${pathnameLine}`;
		},
	);
	// setLocation("/path") -> router.push("/path")
	result = result.replace(/setLocation\(([^)]+)\)/g, "router.push($1)");

	// Remove Replit-specific imports entirely
	result = result.replace(
		/import\s+.*from\s*["'`]@replit\/[^"'`]+["'`];?\n?/g,
		"",
	);

	return result;
}

/**
 * Generates a Next.js-compatible TanStack Query client to replace
 * the Replit-specific queryClient.ts that has CSRF token handling
 * and Express-oriented fetch wrappers.
 */
function generateNextQueryClient(): string {
	return `import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
	if (!res.ok) {
		const text = (await res.text()) || res.statusText;
		throw new Error(\`\${res.status}: \${text}\`);
	}
}

export async function apiRequest(
	method: string,
	url: string,
	data?: unknown,
): Promise<Response> {
	const headers: Record<string, string> = data
		? { "Content-Type": "application/json" }
		: {};

	const res = await fetch(url, {
		method,
		headers,
		body: data ? JSON.stringify(data) : undefined,
		credentials: "include",
	});

	await throwIfResNotOk(res);
	return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
	on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
	({ on401: unauthorizedBehavior }) =>
	async ({ queryKey }) => {
		const res = await fetch(queryKey.join("/") as string, {
			credentials: "include",
		});

		if (unauthorizedBehavior === "returnNull" && res.status === 401) {
			return null;
		}

		await throwIfResNotOk(res);
		return await res.json();
	};

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			queryFn: getQueryFn({ on401: "throw" }),
			refetchInterval: false,
			refetchOnWindowFocus: false,
			staleTime: Infinity,
			retry: false,
		},
		mutations: {
			retry: false,
		},
	},
});
`;
}

/**
 * Checks whether a file's content references Replit-specific APIs
 * that will need manual attention after migration.
 */
function detectReplitUsage(content: string, filePath: string): string[] {
	const flags: string[] = [];

	for (const pattern of REPLIT_API_PATTERNS) {
		if (content.includes(pattern)) {
			flags.push(`${filePath}: uses Replit API (${pattern})`);
		}
	}

	// Check for object storage patterns (only flag once per file)
	for (const pattern of OBJECT_STORAGE_PATTERNS) {
		if (content.includes(pattern)) {
			flags.push(
				`${filePath}: uses object storage pattern (${pattern}) — needs manual migration to Supabase Storage or S3`,
			);
			break;
		}
	}

	return flags;
}

/**
 * Copies a single source file to the target, rewriting imports and
 * flagging Replit-specific usage.
 */
async function copyAndRewriteFile(
	sourceFile: SourceFile,
	sourceBaseDir: string,
	targetDir: string,
	targetSubDir: string,
	result: MigrationResult,
): Promise<void> {
	const content = await readFile(sourceFile.absolutePath);

	// Determine relative path within the target subdirectory
	const relativeWithinDir = path.relative(
		sourceBaseDir,
		sourceFile.absolutePath,
	);
	const targetPath = path.join(targetDir, targetSubDir, relativeWithinDir);

	// Flag Replit-specific usage before rewriting
	const targetRelative = path.join(targetSubDir, relativeWithinDir);
	const flags = detectReplitUsage(content, targetRelative);
	result.componentsFlagged.push(...flags);

	// Rewrite imports and write to target
	const rewritten = rewriteImports(content);
	await writeFile(targetPath, rewritten);
	result.filesWritten.push(targetRelative);
	result.componentsCopied++;
}

/**
 * Copies UI components (shadcn/ui) as-is without import rewriting,
 * since they are self-contained.
 */
async function copyUiComponents(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	if (manifest.uiComponents.length === 0) return;

	const uiTargetDir = path.join(targetDir, "components", "ui");
	await ensureDir(uiTargetDir);

	for (const uiFile of manifest.uiComponents) {
		const basename = path.basename(uiFile.absolutePath);
		const dest = path.join(uiTargetDir, basename);
		await copyFile(uiFile.absolutePath, dest);
		result.filesWritten.push(path.join("components", "ui", basename));
		result.componentsCopied++;
	}
}

/**
 * Copies custom (non-UI) components with import path rewriting.
 */
async function copyCustomComponents(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	if (manifest.components.length === 0) return;

	const componentsSourceDir = path.join(
		manifest.sourceDir,
		"client",
		"src",
		"components",
	);

	for (const component of manifest.components) {
		await copyAndRewriteFile(
			component,
			componentsSourceDir,
			targetDir,
			"components",
			result,
		);
	}
}

/**
 * Copies hooks with import path rewriting.
 */
async function copyHooks(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	if (manifest.hooks.length === 0) return;

	const hooksSourceDir = path.join(
		manifest.sourceDir,
		"client",
		"src",
		"hooks",
	);

	for (const hook of manifest.hooks) {
		await copyAndRewriteFile(hook, hooksSourceDir, targetDir, "hooks", result);
	}
}

/**
 * Copies lib files with import path rewriting. Replaces the Replit-specific
 * queryClient.ts with a Next.js-compatible version that strips CSRF token
 * handling and Express-oriented fetch wrappers.
 */
async function copyLibFiles(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	if (manifest.libFiles.length === 0) return;

	const libSourceDir = path.join(manifest.sourceDir, "client", "src", "lib");

	for (const libFile of manifest.libFiles) {
		const basename = path.basename(libFile.absolutePath);

		// Replace files that have Replit-specific implementations
		if (REPLACE_FILES[basename]) {
			const targetPath = path.join(targetDir, "lib", basename);

			if (basename === "queryClient.ts") {
				await writeFile(targetPath, generateNextQueryClient());
				result.filesWritten.push(path.join("lib", basename));
				result.componentsCopied++;
				result.warnings.push(
					`lib/${basename}: replaced with Next.js-compatible version (removed CSRF token handling)`,
				);
				continue;
			}
		}

		await copyAndRewriteFile(libFile, libSourceDir, targetDir, "lib", result);
	}
}

/**
 * Copies static assets from client/public/ to the target public/ directory.
 */
async function copyStaticAssets(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	if (manifest.staticAssets.length === 0) return;

	const publicSourceDir = path.join(manifest.sourceDir, "client", "public");
	const publicTargetDir = path.join(targetDir, "public");
	await ensureDir(publicTargetDir);

	for (const assetPath of manifest.staticAssets) {
		const relativePath = path.relative(publicSourceDir, assetPath);
		const dest = path.join(publicTargetDir, relativePath);
		await copyFile(assetPath, dest);
		result.filesWritten.push(path.join("public", relativePath));
	}
}

/**
 * Phase 2d: Copy and migrate components, hooks, lib files, and static assets
 * from the Replit source app to the Next.js target directory.
 *
 * - UI components (shadcn) are copied as-is
 * - Custom components, hooks, and lib files get import path rewrites
 * - The Replit-specific queryClient.ts is replaced with a Next.js version
 * - Files using Replit APIs are flagged for manual review
 * - Static assets from client/public/ are copied to public/
 */
export async function copyComponents(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	await copyUiComponents(manifest, targetDir, result);
	await copyCustomComponents(manifest, targetDir, result);
	await copyHooks(manifest, targetDir, result);
	await copyLibFiles(manifest, targetDir, result);
	await copyStaticAssets(manifest, targetDir, result);
}
