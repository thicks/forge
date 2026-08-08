import { render } from "ink";
import React from "react";
import type { EnvDiffEntry } from "../utils/env-diff.js";
import { EnvDiffView } from "./env-diff-view.js";

interface RunEnvTuiOptions {
	entries: EnvDiffEntry[];
	mode: "pull" | "push";
	targetEnv: string;
	isProduction: boolean;
}

/**
 * Launch the Ink TUI and return the keys the user selected, or null if cancelled.
 * Unmounts automatically after the user confirms or cancels.
 */
export async function runEnvTui(
	options: RunEnvTuiOptions,
): Promise<string[] | null> {
	const { entries, mode, targetEnv, isProduction } = options;

	return new Promise((resolve) => {
		const { unmount } = render(
			<EnvDiffView
				entries={entries}
				mode={mode}
				targetEnv={targetEnv}
				isProduction={isProduction}
				onComplete={(selectedKeys) => {
					unmount();
					resolve(selectedKeys);
				}}
			/>,
		);
	});
}
