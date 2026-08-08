export function safeProjectIdentifier(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/^@[^/]+\//, "")
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "forge-app";
}

export function quotedString(value: string): string {
	return JSON.stringify(value);
}
