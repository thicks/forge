/**
 * Generates the root layout.tsx for the migrated Next.js app.
 * Includes TanStack Query provider and theme support.
 */
export function generateMigrateRootLayout(appName: string): string {
	const title = appName
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());

	return `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "${title}",
	description: "Migrated from Replit to Next.js by forge",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={inter.className}>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
`;
}

/**
 * Generates the providers.tsx wrapper that includes
 * TanStack Query and any other client-side providers.
 */
export function generateMigrateProviders(): string {
	return `"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				{children}
				<Toaster />
			</TooltipProvider>
		</QueryClientProvider>
	);
}
`;
}
