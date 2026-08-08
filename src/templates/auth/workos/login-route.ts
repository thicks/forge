export function generateLoginApiRoute(appName: string): string {
	return `import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	try {
		const { username, password } = await request.json();

		// Simple validation: username and password must match app name
		if (username === "${appName}" && password === "${appName}") {
			const cookieStore = await cookies();
			cookieStore.set("dev_session", "${appName}", {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				maxAge: 60 * 60 * 24 * 7, // 1 week
			});

			return NextResponse.json({ success: true });
		}

		return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
	} catch {
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}
}
`;
}
