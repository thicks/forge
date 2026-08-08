export function generateHeroTsx(): string {
	return `import Image from "next/image";
import Link from "next/link";

export function Hero() {
	return (
		<section className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
			<h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-white">
				Welcome to Your App
			</h1>
			<div className="flex flex-col items-center gap-2">
				<Image
					src="/forge-logo.png"
					alt="Forge"
					width={64}
					height={64}
				/>
				<p className="text-lg text-muted-foreground max-w-md">
					Created by Forge
				</p>
			</div>
			<Link
				href="https://nextjs.org/docs"
				className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
			>
				Get Started
			</Link>
		</section>
	);
}
`;
}
