import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Only run integration tests (*.integration.test.ts files)
		include: ["src/__tests__/**/*.integration.{test,spec}.{ts,tsx}"],
		exclude: ["test-working-dir/**", "node_modules/**", "dist/**"],
		// Integration tests are slow - increase default timeout
		testTimeout: 400_000,
		hookTimeout: 400_000,
		// Run tests sequentially to avoid resource contention
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
	},
});
