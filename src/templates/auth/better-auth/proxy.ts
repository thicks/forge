export function generateBetterAuthProxy(): string {
	return `import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth"];

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Allow public paths
	if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
		return NextResponse.next();
	}

	// Allow static files and Next.js internals
	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/favicon") ||
		pathname.includes(".")
	) {
		return NextResponse.next();
	}

	// Check for session cookie (optimistic check - validate in page/route handlers)
	const sessionCookie = getSessionCookie(request);

	if (!sessionCookie) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}
