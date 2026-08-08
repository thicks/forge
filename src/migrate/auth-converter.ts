import path from "node:path";
import {
	generateDevLoginForm,
	generateLoginApiRoute,
	generateSimpleAuthRoute,
	generateSimpleLayoutTsx,
	generateSimpleLoginPage,
	generateSimpleMiddleware,
	generateWorkosCallbackRoute,
	generateWorkosLayoutTsx,
	generateWorkosLoginPage,
	generateWorkosMiddleware,
} from "../templates/index.js";
import { ensureDir, writeFile } from "../utils/index.js";
import type { AuthType, MigrationManifest, MigrationResult } from "./types.js";

/**
 * Generates a lib/auth.ts module with server-side auth helpers
 * that API routes can use to protect endpoints. These replace
 * the Express middleware (isAuthenticated, isAdmin, etc.).
 */
function generateAuthHelpers(authType: AuthType): string {
	if (authType === "workos") {
		return `import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@workos-inc/authkit-nextjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Require authenticated session. Returns error response if not authenticated. */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
	const { user } = await getUser();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}
	return null;
}

/** Require admin role. Returns error response if not admin. */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
	const { user } = await getUser();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const dbUser = await db.query.users.findFirst({
		where: eq(users.id, user.id),
	});

	if (!dbUser || !dbUser.isAdmin) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}
	return null;
}

/** Require privileged user (admin, director, or capability lead). */
export async function requirePrivileged(request: NextRequest): Promise<NextResponse | null> {
	const { user } = await getUser();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const dbUser = await db.query.users.findFirst({
		where: eq(users.id, user.id),
	});

	if (!dbUser) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const isPrivileged = dbUser.isAdmin ||
		(dbUser as any).isCapabilityDirector ||
		(dbUser as any).isCapabilityLead;

	if (!isPrivileged) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}
	return null;
}

/** Require director or admin role. */
export async function requireDirectorOrAdmin(request: NextRequest): Promise<NextResponse | null> {
	const { user } = await getUser();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const dbUser = await db.query.users.findFirst({
		where: eq(users.id, user.id),
	});

	if (!dbUser) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const allowed = dbUser.isAdmin || (dbUser as any).isCapabilityDirector;
	if (!allowed) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}
	return null;
}

/** Get the current authenticated user from the session. */
export async function getCurrentUser() {
	const { user } = await getUser();
	if (!user) return null;

	const dbUser = await db.query.users.findFirst({
		where: eq(users.id, user.id),
	});

	return dbUser || null;
}
`;
	}

	if (authType === "none") {
		return `import { NextRequest, NextResponse } from "next/server";

export async function requireAuth(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ message: "Authentication is not configured" }, { status: 401 });
}
export const requireAdmin = requireAuth;
export const requirePrivileged = requireAuth;
export const requireDirectorOrAdmin = requireAuth;
export async function getCurrentUser() { return null; }
`;
	}

	// Demo auth helpers
	return `import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Parse the demo session cookie */
async function getSessionUser(): Promise<{ username: string } | null> {
	const cookieStore = await cookies();
	const session = cookieStore.get("simple_session");
	if (!session?.value) return null;

	try {
		const parsed = JSON.parse(Buffer.from(session.value, "base64").toString());
		if (!parsed.user || parsed.exp < Date.now()) return null;
		return parsed.user;
	} catch {
		return null;
	}
}

/** Require authenticated session. Returns error response if not authenticated. */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
	const sessionUser = await getSessionUser();
	if (!sessionUser) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}
	return null;
}

/** Require admin role. Returns error response if not admin. */
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
	const sessionUser = await getSessionUser();
	if (!sessionUser) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	// In demo mode, all authenticated users have admin access
	return null;
}

/** Require privileged user (admin, director, or capability lead). */
export async function requirePrivileged(request: NextRequest): Promise<NextResponse | null> {
	return requireAuth(request);
}

/** Require director or admin role. */
export async function requireDirectorOrAdmin(request: NextRequest): Promise<NextResponse | null> {
	return requireAuth(request);
}

/** Get the current authenticated user from the session. */
export async function getCurrentUser() {
	const sessionUser = await getSessionUser();
	if (!sessionUser) return null;
	return sessionUser;
}
`;
}

/**
 * Generates a use-auth hook compatible with the migrated auth system.
 */
function generateUseAuthHook(authType: AuthType): string {
	if (authType === "workos") {
		return `"use client";

import { useEffect, useState } from "react";

interface AuthUser {
	id: string;
	email: string;
	firstName?: string;
	lastName?: string;
	isAdmin?: boolean;
	[key: string]: unknown;
}

interface AuthState {
	user: AuthUser | null;
	isAuthenticated: boolean;
	isLoading: boolean;
}

export function useAuth(): AuthState {
	const [state, setState] = useState<AuthState>({
		user: null,
		isAuthenticated: false,
		isLoading: true,
	});

	useEffect(() => {
		async function fetchUser() {
			try {
				const res = await fetch("/api/auth/user", { credentials: "include" });
				if (res.ok) {
					const user = await res.json();
					setState({ user, isAuthenticated: true, isLoading: false });
				} else {
					setState({ user: null, isAuthenticated: false, isLoading: false });
				}
			} catch {
				setState({ user: null, isAuthenticated: false, isLoading: false });
			}
		}
		fetchUser();
	}, []);

	return state;
}
`;
	}

	// Demo auth hook
	return `"use client";

import { useEffect, useState } from "react";

interface AuthUser {
	username: string;
	isAdmin?: boolean;
	[key: string]: unknown;
}

interface AuthState {
	user: AuthUser | null;
	isAuthenticated: boolean;
	isLoading: boolean;
}

export function useAuth(): AuthState {
	const [state, setState] = useState<AuthState>({
		user: null,
		isAuthenticated: false,
		isLoading: true,
	});

	useEffect(() => {
		async function fetchUser() {
			try {
				const res = await fetch("/api/auth/login", {
					method: "GET",
					credentials: "include",
				});
				if (res.ok) {
					const data = await res.json();
					if (data.user) {
						setState({ user: data.user, isAuthenticated: true, isLoading: false });
					} else {
						setState({ user: null, isAuthenticated: false, isLoading: false });
					}
				} else {
					setState({ user: null, isAuthenticated: false, isLoading: false });
				}
			} catch {
				setState({ user: null, isAuthenticated: false, isLoading: false });
			}
		}
		fetchUser();
	}, []);

	return state;
}
`;
}

export async function convertAuth(
	manifest: MigrationManifest,
	targetDir: string,
	authType: AuthType,
	result: MigrationResult,
): Promise<void> {
	const appName = manifest.appName;

	if (authType === "none") {
		await writeFile(
			path.join(targetDir, "lib", "auth.ts"),
			generateAuthHelpers("none"),
		);
		result.filesWritten.push("lib/auth.ts");
		return;
	}

	await ensureDir(path.join(targetDir, "lib"));
	await ensureDir(path.join(targetDir, "hooks"));

	// Generate auth helpers for API routes
	await writeFile(
		path.join(targetDir, "lib", "auth.ts"),
		generateAuthHelpers(authType),
	);
	result.filesWritten.push("lib/auth.ts");

	// Generate use-auth hook (replaces the Replit-specific one)
	await writeFile(
		path.join(targetDir, "hooks", "use-auth.ts"),
		generateUseAuthHook(authType),
	);
	result.filesWritten.push("hooks/use-auth.ts");

	if (authType === "workos") {
		// WorkOS auth files - reuse existing forge templates
		await ensureDir(path.join(targetDir, "app", "callback"));
		await ensureDir(path.join(targetDir, "app", "login"));
		await ensureDir(path.join(targetDir, "app", "api", "auth", "login"));

		await writeFile(
			path.join(targetDir, "middleware.ts"),
			generateWorkosMiddleware(appName),
		);
		result.filesWritten.push("middleware.ts");

		await writeFile(
			path.join(targetDir, "app", "callback", "route.ts"),
			generateWorkosCallbackRoute(),
		);
		result.filesWritten.push("app/callback/route.ts");

		await writeFile(
			path.join(targetDir, "app", "login", "page.tsx"),
			generateWorkosLoginPage(appName),
		);
		result.filesWritten.push("app/login/page.tsx");

		await writeFile(
			path.join(targetDir, "app", "login", "dev-login-form.tsx"),
			generateDevLoginForm(appName),
		);
		result.filesWritten.push("app/login/dev-login-form.tsx");

		await writeFile(
			path.join(targetDir, "app", "api", "auth", "login", "route.ts"),
			generateLoginApiRoute(appName),
		);
		result.filesWritten.push("app/api/auth/login/route.ts");

		await writeFile(
			path.join(targetDir, "app", "api", "auth", "user", "route.ts"),
			`import { NextResponse } from "next/server";\nimport { getCurrentUser } from "@/lib/auth";\n\nexport async function GET() {\n  const user = await getCurrentUser();\n  return user ? NextResponse.json(user) : NextResponse.json({ message: "Unauthorized" }, { status: 401 });\n}\n`,
		);
		result.filesWritten.push("app/api/auth/user/route.ts");
	} else if (authType === "demo") {
		// Demo auth files - reuse existing forge templates
		await ensureDir(path.join(targetDir, "app", "login"));
		await ensureDir(path.join(targetDir, "app", "api", "auth", "login"));

		await writeFile(
			path.join(targetDir, "middleware.ts"),
			generateSimpleMiddleware(),
		);
		result.filesWritten.push("middleware.ts");

		await writeFile(
			path.join(targetDir, "app", "login", "page.tsx"),
			generateSimpleLoginPage(appName),
		);
		result.filesWritten.push("app/login/page.tsx");

		await writeFile(
			path.join(targetDir, "app", "api", "auth", "login", "route.ts"),
			generateSimpleAuthRoute(),
		);
		result.filesWritten.push("app/api/auth/login/route.ts");
	}
}
