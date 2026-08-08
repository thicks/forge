/**
 * Next 16 config. turbopack.root pins project root (avoids multi-lockfile warning).
 * allowedDevOrigins silences cross-origin warning for 127.0.0.1/localhost.
 */
export function generateNextConfig(): string {
	return `import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		root: path.resolve(process.cwd()),
	},
	allowedDevOrigins: ["127.0.0.1", "localhost"],
	experimental: {
		optimizePackageImports: ["lucide-react"],
		useCache: true,
	},
};

export default nextConfig;
`;
}
