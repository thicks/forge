type DbType = "postgres" | "supabase";

interface MonorepoVercelJsonOptions {
	db?: DbType;
}

export function generateMonorepoVercelJson(
	options: MonorepoVercelJsonOptions = {},
): string {
	const config: Record<string, string> = {
		$schema: "https://openapi.vercel.sh/vercel.json",
		installCommand: "cd ../.. && corepack enable && pnpm install",
	};

	// With database: run tracked migrations before build
	if (options.db) {
		config.buildCommand = "pnpm db:migrate && pnpm build";
	}

	return JSON.stringify(config, null, 2);
}
