import path from "node:path";
import { ensureDir, fileExists, readFile, writeFile } from "../utils/index.js";
import type { MigrationManifest, MigrationResult } from "./types.js";

/**
 * Converts a wouter route path to a Next.js App Router directory path.
 * e.g. "/admin/talent/:id" -> "(admin)/admin/talent/[id]"
 */
function wouterPathToNextDir(
	routePath: string,
	isAdmin: boolean,
	requiresAuth: boolean,
): string {
	const segments = routePath
		.split("/")
		.filter(Boolean)
		.map((segment) => {
			if (segment.startsWith(":")) {
				return `[${segment.slice(1)}]`;
			}
			return segment;
		});

	// Wrap in route groups based on auth/admin status
	if (isAdmin) {
		return path.join("(authenticated)", ...segments);
	}
	if (!requiresAuth) {
		return path.join("(public)", ...segments);
	}
	return path.join("(authenticated)", ...segments);
}

/** Rewrite import paths from the Replit client structure to Next.js */
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
		(_, imports: string) => {
			const nextImports: string[] = [];
			if (imports.includes("useLocation"))
				nextImports.push("useRouter", "usePathname");
			if (imports.includes("useParams")) nextImports.push("useParams");
			if (imports.includes("useRoute")) nextImports.push("useParams");
			if (imports.includes("Link")) nextImports.push("// Link from next/link");
			// Deduplicate
			const unique = [...new Set(nextImports)].filter(
				(name) => !emittedNavImports.has(name),
			);
			for (const name of unique) emittedNavImports.add(name);
			if (unique.length === 0) return "";
			return `import { ${unique.join(", ")} } from "next/navigation"`;
		},
	);

	// Rewrite useLocation() patterns
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
		(_, loc: string) => {
			const pathnameLine = `const ${loc} = usePathname()`;
			if (routerDeclared) return pathnameLine;
			routerDeclared = true;
			return `const router = useRouter();\n\t${pathnameLine}`;
		},
	);
	// setLocation("/path") -> router.push("/path")
	result = result.replace(/setLocation\(([^)]+)\)/g, "router.push($1)");

	// Rewrite wouter Link to next/link
	result = result.replace(
		/import\s+.*from\s*["'`]wouter["'`]/g,
		'import Link from "next/link"',
	);

	// Remove Replit-specific imports
	result = result.replace(
		/import.*from\s*["'`]@replit\/[^"'`]+["'`];?\n?/g,
		"",
	);

	return result;
}

/**
 * Generates the admin (authenticated) layout with sidebar and auth guard.
 */
function generateAuthenticatedLayout(appName: string): string {
	return `"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export default function AuthenticatedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { user, isAuthenticated, isLoading } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.push("/login");
		}
	}, [isLoading, isAuthenticated, router]);

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!isAuthenticated) {
		return null;
	}

	return <>{children}</>;
}
`;
}

/** Generates a minimal public layout */
function generatePublicLayout(): string {
	return `export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}
`;
}

export async function convertPages(
	manifest: MigrationManifest,
	targetDir: string,
	result: MigrationResult,
): Promise<void> {
	if (manifest.pages.length === 0) {
		result.warnings.push("No pages found to convert");
		return;
	}

	const hasAdminPages = manifest.pages.some((p) => p.isAdmin);
	const hasPublicPages = manifest.pages.some((p) => !p.requiresAuth);

	// Create route group directories and layouts
	if (hasAdminPages) {
		const adminLayoutDir = path.join(targetDir, "app", "(authenticated)");
		await ensureDir(adminLayoutDir);
		await writeFile(
			path.join(adminLayoutDir, "layout.tsx"),
			generateAuthenticatedLayout(manifest.appName),
		);
		result.filesWritten.push("app/(authenticated)/layout.tsx");
	}

	if (hasPublicPages) {
		const publicLayoutDir = path.join(targetDir, "app", "(public)");
		await ensureDir(publicLayoutDir);
		await writeFile(
			path.join(publicLayoutDir, "layout.tsx"),
			generatePublicLayout(),
		);
		result.filesWritten.push("app/(public)/layout.tsx");
	}

	// Convert each page
	for (const page of manifest.pages) {
		if (!page.componentFile || !(await fileExists(page.componentFile))) {
			result.warnings.push(
				`Page component not found: ${page.componentName} for route ${page.path}`,
			);
			continue;
		}

		const nextDir = wouterPathToNextDir(
			page.path,
			page.isAdmin,
			page.requiresAuth,
		);
		const pageDir = path.join(targetDir, "app", nextDir);
		await ensureDir(pageDir);

		// Read and transform the page component
		let content = await readFile(page.componentFile);

		// Ensure "use client" directive is present (pages use hooks/state)
		if (
			!content.includes('"use client"') &&
			!content.includes("'use client'")
		) {
			content = `"use client";\n\n${content}`;
		}

		// Rewrite imports
		content = rewriteImports(content);

		// Convert default export if needed: export default function X -> export default function Page
		// Keep the original component name but also add a default export
		const hasDefaultExport = /export\s+default/.test(content);
		if (!hasDefaultExport) {
			// Look for a named export or plain function/const matching the component name
			const namedExport = new RegExp(
				`export\\s+(?:function|const)\\s+${page.componentName}`,
			);
			if (namedExport.test(content)) {
				content += `\nexport default ${page.componentName};\n`;
			} else {
				// Component might be declared without export
				content += `\nexport default ${page.componentName};\n`;
			}
		}

		await writeFile(path.join(pageDir, "page.tsx"), content);
		result.filesWritten.push(path.join("app", nextDir, "page.tsx"));
		result.pagesConverted++;
	}
}
