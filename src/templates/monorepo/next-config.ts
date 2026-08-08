/**
 * Next 16 config for monorepo apps. turbopack.root + allowedDevOrigins
 * same as standalone (avoid lockfile/cross-origin warnings).
 */
export function generateMonorepoNextConfig(): string {
	return `import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@workspace/ui"],
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
