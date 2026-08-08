import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Only pick up tests inside forge's own source tree; exclude scaffolded app output
		include: ["src/__tests__/**/*.{test,spec}.{ts,tsx}"],
		exclude: [
			"test-working-dir/**",
			"node_modules/**",
			"dist/**",
			// Integration tests are slow and run separately via `pnpm test:integration`
			"src/__tests__/**/*.integration.{test,spec}.{ts,tsx}",
		],
		// auth-options tests scaffold full apps via execSync — give them plenty of runway
		testTimeout: 300_000,
		hookTimeout: 300_000,
		// Single fork keeps the worker alive for the full suite and avoids IPC timeouts
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
	},
});
