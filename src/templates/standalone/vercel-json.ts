type DbType = "postgres" | "supabase";

interface VercelJsonOptions {
	db?: DbType;
}

export function generateVercelJson(options: VercelJsonOptions = {}): string {
	if (options.db) {
		// With database: run tracked migrations before build
		return JSON.stringify(
			{
				$schema: "https://openapi.vercel.sh/vercel.json",
				buildCommand: "pnpm db:migrate && next build",
			},
			null,
			2,
		);
	}

	// Without database: minimal config, let Vercel auto-detect
	return JSON.stringify(
		{ $schema: "https://openapi.vercel.sh/vercel.json" },
		null,
		2,
	);
}
