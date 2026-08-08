export function generateSimpleLayoutTsx(appName: string): string {
	return `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "${appName}",
	description: "Created by Forge",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={inter.className}>
				<header className="fixed top-0 left-0 p-4">
					<Image
						src="/forge-logo.png"
						alt="Forge"
						width={48}
						height={48}
						priority
					/>
				</header>
				<main className="min-h-screen">
					{children}
				</main>
			</body>
		</html>
	);
}
`;
}
