export function generateWorkosMiddleware(appName: string): string {
	return `import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";

// Check if WorkOS is configured
const isWorkOSConfigured = !!(
	process.env.WORKOS_CLIENT_ID &&
	process.env.WORKOS_API_KEY
);

// Simple session check for dev mode
function checkDevSession(request: NextRequest): boolean {
	const sessionCookie = request.cookies.get("dev_session");
	return sessionCookie?.value === "${appName}";
}

// Dev mode middleware - simple cookie-based auth
function devModeMiddleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Allow public routes
	const publicPaths = ["/_next", "/favicon.ico", "/login", "/api/auth", "/api/health"];
	if (publicPaths.some((p) => pathname.startsWith(p))) {
		return NextResponse.next();
	}

	// Check for dev session
	if (!checkDevSession(request)) {
		const loginUrl = new URL("/login", request.url);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
	if (isWorkOSConfigured) {
		// Use WorkOS AuthKit middleware
		return authkitMiddleware()(request, event);
	}
	// Fall back to dev mode
	return devModeMiddleware(request);
}

export const config = {
	matcher: [
		// Protect all routes except static assets
		"/((?!_next/static|_next/image|favicon.ico).*)",
	],
};
`;
}
