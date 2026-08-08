export function generateBetterAuthSignupPage(): string {
	return `"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { signUp } from "@/lib/auth-client";

export default function SignupPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");

		try {
			const { error: signUpError } = await signUp.email({
				name,
				email,
				password,
			});

			if (signUpError) {
				setError(signUpError.message || "Could not create account");
				return;
			}

			router.push("/");
			router.refresh();
		} catch {
			setError("An error occurred");
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className="min-h-screen flex flex-col items-center justify-center p-8">
			<div className="w-full max-w-md">
				<div className="text-center mb-8">
					<Link href="/" className="inline-block">
						<Image
							src="/forge-logo.png"
							alt="Logo"
							width={48}
							height={48}
							className="mx-auto"
						/>
					</Link>
					<h1 className="mt-6 text-3xl font-bold tracking-tight text-white">
						Create your account
					</h1>
					<p className="mt-2 text-muted-foreground">
						Get started with your new app
					</p>
				</div>

				<div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-6">
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<label
								htmlFor="name"
								className="text-sm font-medium text-foreground"
							>
								Name
							</label>
							<input
								id="name"
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
								autoComplete="name"
								placeholder="Your name"
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>
						<div className="space-y-2">
							<label
								htmlFor="email"
								className="text-sm font-medium text-foreground"
							>
								Email
							</label>
							<input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								autoComplete="email"
								placeholder="you@example.com"
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>
						<div className="space-y-2">
							<label
								htmlFor="password"
								className="text-sm font-medium text-foreground"
							>
								Password
							</label>
							<input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoComplete="new-password"
								placeholder="Create a password"
								minLength={8}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>

						{error && (
							<p className="text-sm text-destructive" role="alert">
								{error}
							</p>
						)}

						<button
							type="submit"
							disabled={loading}
							className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
						>
							{loading ? "Creating account..." : "Create Account"}
						</button>
					</form>

					<p className="mt-6 text-center text-sm text-muted-foreground">
						Already have an account?{" "}
						<Link
							href="/login"
							className="font-medium text-primary hover:underline"
						>
							Sign in
						</Link>
					</p>
				</div>
			</div>
		</main>
	);
}
`;
}
