export function generateSimpleMiddleware(): string {
	return `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "simple_session";
const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
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

	// Check for session cookie
	const sessionCookie = request.cookies.get(SESSION_COOKIE);

	if (!sessionCookie) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	// Validate session (check expiration)
	try {
		const sessionData = JSON.parse(
			Buffer.from(sessionCookie.value, "base64").toString()
		);
		if (sessionData.exp < Date.now()) {
			// Session expired
			const response = NextResponse.redirect(new URL("/login", request.url));
			response.cookies.delete(SESSION_COOKIE);
			return response;
		}
	} catch {
		// Invalid session
		const response = NextResponse.redirect(new URL("/login", request.url));
		response.cookies.delete(SESSION_COOKIE);
		return response;
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
`;
}
