export function generateBetterAuthClient(): string {
	return `import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
`;
}
