// Supabase client templates
export function generateSupabaseBrowserClient(): string {
	return `import { createBrowserClient } from "@supabase/ssr";

// Browser client for client-side components
export function createClient() {
	return createBrowserClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
	);
}
`;
}

export function generateSupabaseServerClient(): string {
	return `import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client for server components and server actions
export async function createClient() {
	const cookieStore = await cookies();

	return createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return cookieStore.getAll();
				},
				setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
					try {
						cookiesToSet.forEach(({ name, value, options }) =>
							cookieStore.set(name, value, options)
						);
					} catch {
						// The \`setAll\` method was called from a Server Component.
						// This can be ignored if you have middleware refreshing user sessions.
					}
				},
			},
		}
	);
}
`;
}

export function generateSupabaseMiddlewareClient(): string {
	return `import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
	let supabaseResponse = NextResponse.next({
		request,
	});

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
					cookiesToSet.forEach(({ name, value }) =>
						request.cookies.set(name, value)
					);
					supabaseResponse = NextResponse.next({
						request,
					});
					cookiesToSet.forEach(({ name, value, options }) =>
						supabaseResponse.cookies.set(name, value, options)
					);
				},
			},
		}
	);

	// IMPORTANT: Avoid writing any logic between createServerClient and
	// supabase.auth.getUser(). A simple mistake could make it very hard to debug
	// issues with users being randomly logged out.
	await supabase.auth.getUser();

	return supabaseResponse;
}
`;
}

// PostgreSQL (Drizzle) client template
export function generatePostgresClient(): string {
	return `import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
`;
}

// Keep legacy export names for backwards compatibility
export const generateDbClient = generateSupabaseBrowserClient;
export const generateDbServerClient = generateSupabaseServerClient;
export const generateDbMiddlewareClient = generateSupabaseMiddlewareClient;
