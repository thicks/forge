export function generateSimpleLoginPage(appName: string): string {
	return `"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");

		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			if (!res.ok) {
				const data = await res.json();
				setError(data.error || "Login failed");
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
		<div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
			<div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
				<div className="p-6 text-center">
					<h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
						Sign In
					</h1>
					<p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
						Enter your credentials to continue
					</p>
				</div>
				<div className="p-6 pt-0">
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<label
								htmlFor="username"
								className="text-sm font-medium leading-none text-slate-900 dark:text-slate-100"
							>
								Username
							</label>
							<input
								id="username"
								type="text"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								required
								autoComplete="username"
								placeholder="Enter username"
								className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
							/>
						</div>
						<div className="space-y-2">
							<label
								htmlFor="password"
								className="text-sm font-medium leading-none text-slate-900 dark:text-slate-100"
							>
								Password
							</label>
							<input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoComplete="current-password"
								placeholder="Enter password"
								className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
							/>
						</div>

						{error && (
							<p className="text-sm text-red-600 dark:text-red-400" role="alert">
								{error}
							</p>
						)}

						<button
							type="submit"
							disabled={loading}
							className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200 dark:focus:ring-offset-slate-900"
						>
							{loading ? "Signing in..." : "Sign In"}
						</button>
					</form>

					<div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
						<p className="text-xs text-amber-800 dark:text-amber-200">
							<span className="font-medium">Simple auth:</span> Any username and password will work.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
`;
}
