export function generateLayoutTsx(appName: string): string {
	return `import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
	),
	title: {
		default: "${appName}",
		template: "%s | ${appName}",
	},
	description: "${appName} - Created by Forge",
	keywords: ["${appName}", "web app"],
	authors: [{ name: "${appName}" }],
	openGraph: {
		type: "website",
		locale: "en_US",
		siteName: "${appName}",
		title: "${appName}",
		description: "${appName} - Created by Forge",
	},
	twitter: {
		card: "summary_large_image",
		title: "${appName}",
		description: "${appName} - Created by Forge",
	},
	robots: {
		index: true,
		follow: true,
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>
				<header className="fixed top-0 left-0 p-4">
					<Image
						src="/forge-logo.png"
						alt="Forge"
						width={48}
						height={48}
						priority
					/>
				</header>
				{children}
			</body>
		</html>
	);
}
`;
}
