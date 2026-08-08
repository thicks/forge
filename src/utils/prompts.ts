import prompts from "prompts";
import validatePackageName from "validate-npm-package-name";

export interface CreateOptions {
	appName: string;
	repoName?: string;
	useReplit: boolean;
}

function validateProjectName(name: string): boolean | string {
	const result = validatePackageName(name);
	if (result.validForNewPackages) {
		return true;
	}
	const errors = [...(result.errors || []), ...(result.warnings || [])];
	return errors[0] || "Invalid project name";
}

export async function getCreatePrompts(
	initialAppName?: string,
	repoName?: string,
	useReplit = false,
): Promise<CreateOptions> {
	const response = await prompts(
		[
			{
				type: initialAppName ? null : "text",
				name: "appName",
				message: "What is your app name?",
				initial: "my-app",
				validate: validateProjectName,
			},
		],
		{
			onCancel: () => {
				console.log("\nOperation cancelled.");
				process.exit(0);
			},
		},
	);

	return {
		appName: initialAppName || response.appName,
		repoName,
		useReplit,
	};
}

export async function confirmReplitStandalone(): Promise<boolean> {
	const response = await prompts({
		type: "confirm",
		name: "continue",
		message: "Replit does not support monorepos. Continue with standalone app?",
		initial: true,
	});

	return response.continue ?? false;
}
