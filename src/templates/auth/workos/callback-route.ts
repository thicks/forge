export function generateWorkosCallbackRoute(): string {
	return `import { handleAuth } from "@workos-inc/authkit-nextjs";

export const GET = handleAuth();
`;
}
