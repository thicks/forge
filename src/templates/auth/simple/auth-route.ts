export function generateSimpleAuthRoute(): string {
	return `import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "simple_session";

export async function POST(request: Request) {
	const { username, password } = await request.json();

	// Simple auth accepts any username/password combination
	if (!username || !password) {
		return NextResponse.json(
			{ error: "Username and password are required" },
			{ status: 400 }
		);
	}

	// Create a simple session token (in production, use proper JWT or session management)
	const sessionData = {
		user: { username },
		exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
	};
	const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString("base64");

	const cookieStore = await cookies();
	cookieStore.set(SESSION_COOKIE, sessionToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: 60 * 60 * 24, // 24 hours
		path: "/",
	});

	return NextResponse.json({ success: true, user: { username } });
}

export async function DELETE() {
	const cookieStore = await cookies();
	cookieStore.delete(SESSION_COOKIE);
	return NextResponse.json({ success: true });
}
`;
}

export function generateSimpleLogoutRoute(): string {
	return `import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
	const cookieStore = await cookies();
	cookieStore.delete("simple_session");
	return NextResponse.json({ success: true });
}
`;
}
