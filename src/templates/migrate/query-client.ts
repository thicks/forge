/**
 * Generates a TanStack Query client module for migrated apps.
 * This replaces the Replit-specific queryClient that included
 * CSRF handling and other Express-specific patterns.
 */
export function generateMigrateQueryClient(): string {
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
	customHeaders?: Record<string, string>,
): Promise<Response> {
	const headers: Record<string, string> = {
		...customHeaders,
	};

	if (data) {
		headers["Content-Type"] = "application/json";
	}

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

export const getQueryFn: (options: {
	on401: UnauthorizedBehavior;
}) => QueryFunction =
	({ on401: unauthorizedBehavior }) =>
	async ({ queryKey }) => {
		const res = await fetch(queryKey[0] as string, {
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
