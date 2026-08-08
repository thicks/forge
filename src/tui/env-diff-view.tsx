import { Box, Text, useInput } from "ink";
import React, { useState } from "react";
import type { DiffStatus, EnvDiffEntry } from "../utils/env-diff.js";

interface EnvDiffViewProps {
	entries: EnvDiffEntry[];
	mode: "pull" | "push";
	targetEnv: string;
	isProduction: boolean;
	/** Called with selected keys when user confirms, or null on cancel */
	onComplete: (selectedKeys: string[] | null) => void;
}

const STATUS_COLORS: Record<DiffStatus, string> = {
	added: "green",
	removed: "red",
	modified: "yellow",
	unchanged: "gray",
};

const STATUS_LABELS: Record<DiffStatus, string> = {
	added: "+",
	removed: "-",
	modified: "~",
	unchanged: "·",
};

/** Renders a single env diff row with checkbox, status indicator, and value preview. */
function DiffRow({
	entry,
	isSelected,
	isFocused,
	isRevealed,
}: {
	entry: EnvDiffEntry;
	isSelected: boolean;
	isFocused: boolean;
	isRevealed: boolean;
}) {
	const color = STATUS_COLORS[entry.status];
	const sigil = STATUS_LABELS[entry.status];

	const displayValue = (val: string | undefined, sensitive: boolean) => {
		if (!val) return "";
		if (sensitive && !isRevealed) {
			return val.length <= 4
				? "****"
				: `${val.slice(0, 4)}${"*".repeat(Math.min(val.length - 4, 12))}`;
		}
		return val.length > 60 ? `${val.slice(0, 57)}...` : val;
	};

	const localDisplay = displayValue(entry.localValue, entry.isSensitive);
	const remoteDisplay = displayValue(entry.remoteValue, entry.isSensitive);

	return (
		<Box>
			<Text color={isFocused ? "cyan" : undefined}>
				{isFocused ? "❯ " : "  "}
			</Text>
			<Text color={isSelected ? "cyan" : "gray"}>
				{isSelected ? "[✓]" : "[ ]"}
			</Text>
			<Text> </Text>
			<Text color={color}>{sigil}</Text>
			<Text> </Text>
			<Text bold color={isFocused ? "cyan" : undefined}>
				{entry.key.padEnd(36)}
			</Text>
			{entry.status === "modified" ? (
				<Box flexDirection="column">
					<Text color="red" dimColor>
						{"  local:  "}
						{localDisplay}
					</Text>
					<Text color="green" dimColor>
						{"  remote: "}
						{remoteDisplay}
					</Text>
				</Box>
			) : (
				<Text dimColor>
					{entry.status === "added" ? remoteDisplay : localDisplay}
				</Text>
			)}
		</Box>
	);
}

type Screen = "diff" | "confirm" | "production-warn";

export function EnvDiffView({
	entries,
	mode,
	targetEnv,
	isProduction,
	onComplete,
}: EnvDiffViewProps) {
	const actionable = entries.filter((e) => e.status !== "unchanged");
	const unchanged = entries.filter((e) => e.status === "unchanged");

	// Pre-select all non-sensitive changed entries
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(actionable.filter((e) => !e.isSensitive).map((e) => e.key)),
	);
	const [cursor, setCursor] = useState(0);
	const [revealed, setRevealed] = useState<Set<string>>(new Set());
	const [screen, setScreen] = useState<Screen>(
		isProduction ? "production-warn" : "diff",
	);
	const [productionConfirmed, setProductionConfirmed] = useState(false);

	useInput((input, key) => {
		if (screen === "production-warn") {
			if (input.toLowerCase() === "y") {
				setProductionConfirmed(true);
				setScreen("diff");
			} else if (input.toLowerCase() === "n" || key.escape) {
				onComplete(null);
			}
			return;
		}

		if (screen === "confirm") {
			if (input.toLowerCase() === "y") {
				onComplete([...selected]);
			} else if (input.toLowerCase() === "n" || key.escape) {
				setScreen("diff");
			}
			return;
		}

		// diff screen
		if (key.upArrow) {
			setCursor((c) => Math.max(0, c - 1));
		} else if (key.downArrow) {
			setCursor((c) => Math.min(actionable.length - 1, c + 1));
		} else if (input === " ") {
			// Toggle selection for current row
			const entry = actionable[cursor];
			if (entry) {
				setSelected((prev) => {
					const next = new Set(prev);
					if (next.has(entry.key)) {
						next.delete(entry.key);
					} else {
						next.add(entry.key);
					}
					return next;
				});
			}
		} else if (input === "r" || input === "R") {
			// Toggle reveal for focused sensitive entry
			const entry = actionable[cursor];
			if (entry?.isSensitive) {
				setRevealed((prev) => {
					const next = new Set(prev);
					if (next.has(entry.key)) {
						next.delete(entry.key);
					} else {
						next.add(entry.key);
					}
					return next;
				});
			}
		} else if (input === "a" || input === "A") {
			// Select all
			setSelected(new Set(actionable.map((e) => e.key)));
		} else if (input === "d" || input === "D") {
			// Deselect all
			setSelected(new Set());
		} else if (key.return) {
			if (selected.size === 0) return;
			setScreen("confirm");
		} else if (key.escape) {
			onComplete(null);
		}
	});

	if (screen === "production-warn") {
		return (
			<Box flexDirection="column" padding={1}>
				<Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
					<Text bold color="red">
						⚠ PRODUCTION ENVIRONMENT ⚠
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text>
						You are about to {mode} env vars{" "}
						<Text bold color="red">
							{mode === "push" ? "to" : "from"}
						</Text>{" "}
						the{" "}
						<Text bold color="red">
							production
						</Text>{" "}
						environment.
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text bold>Are you sure you want to continue? (y/N) </Text>
				</Box>
			</Box>
		);
	}

	if (screen === "confirm") {
		const selectedEntries = actionable.filter((e) => selected.has(e.key));
		return (
			<Box flexDirection="column" padding={1}>
				<Text bold>
					About to {mode} {selectedEntries.length} variable
					{selectedEntries.length !== 1 ? "s" : ""}{" "}
					{mode === "push" ? "to" : "from"} Vercel ({targetEnv}):
				</Text>
				<Box flexDirection="column" marginTop={1}>
					{selectedEntries.map((e) => (
						<Box key={e.key}>
							<Text color={STATUS_COLORS[e.status]}>
								{STATUS_LABELS[e.status]}{" "}
							</Text>
							<Text>{e.key}</Text>
						</Box>
					))}
				</Box>
				{isProduction && (
					<Box marginTop={1}>
						<Text bold color="red">
							⚠ This targets PRODUCTION
						</Text>
					</Box>
				)}
				<Box marginTop={1}>
					<Text bold>Confirm? (y/N) </Text>
				</Box>
			</Box>
		);
	}

	// Diff screen
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>
					forge env {mode} — {targetEnv}
					{isProduction && productionConfirmed ? (
						<Text color="red"> (PRODUCTION)</Text>
					) : null}
				</Text>
			</Box>

			{actionable.length === 0 ? (
				<Box marginBottom={1}>
					<Text color="green">
						✓ Everything is in sync — no changes to apply.
					</Text>
				</Box>
			) : (
				<Box flexDirection="column" marginBottom={1}>
					{actionable.map((entry, idx) => (
						<DiffRow
							key={entry.key}
							entry={entry}
							isSelected={selected.has(entry.key)}
							isFocused={idx === cursor}
							isRevealed={revealed.has(entry.key)}
						/>
					))}
				</Box>
			)}

			{unchanged.length > 0 && (
				<Box marginBottom={1}>
					<Text dimColor>
						{unchanged.length} unchanged variable
						{unchanged.length !== 1 ? "s" : ""} not shown
					</Text>
				</Box>
			)}

			<Box
				flexDirection="column"
				borderStyle="single"
				borderColor="gray"
				paddingX={1}
			>
				<Text dimColor>
					↑↓ navigate · space select · a select all · d deselect all · r reveal
					sensitive · enter confirm · esc cancel
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text>
					{selected.size} of {actionable.length} variable
					{actionable.length !== 1 ? "s" : ""} selected
				</Text>
			</Box>
		</Box>
	);
}
