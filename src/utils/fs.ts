import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

export async function ensureDir(dirPath: string): Promise<void> {
	await fs.ensureDir(dirPath);
}

export async function writeFile(
	filePath: string,
	content: string,
): Promise<void> {
	await fs.ensureDir(path.dirname(filePath));
	await fs.writeFile(filePath, content, "utf-8");
}

export async function readFile(filePath: string): Promise<string> {
	return await fs.readFile(filePath, "utf-8");
}

export async function copyFile(src: string, dest: string): Promise<void> {
	await fs.ensureDir(path.dirname(dest));
	await fs.copyFile(src, dest);
}

export async function fileExists(filePath: string): Promise<boolean> {
	return await fs.pathExists(filePath);
}

export async function removeDir(dirPath: string): Promise<void> {
	await fs.remove(dirPath);
}

export async function removeFile(filePath: string): Promise<void> {
	await fs.remove(filePath);
}

export async function copyDir(src: string, dest: string): Promise<void> {
	await fs.copy(src, dest);
}

export async function setExecutable(filePath: string): Promise<void> {
	await fs.chmod(filePath, 0o755);
}

export function getAssetPath(assetName: string): string {
	let dir = path.dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 5; i++) {
		const candidate = path.join(dir, "assets", assetName);
		if (fs.pathExistsSync(candidate)) {
			return candidate;
		}
		dir = path.dirname(dir);
	}
	throw new Error(`Could not find asset: ${assetName}`);
}

export async function copyAsset(
	assetName: string,
	dest: string,
): Promise<void> {
	const src = getAssetPath(assetName);
	await fs.ensureDir(path.dirname(dest));
	await fs.copy(src, dest);
}

export async function copyAssetDir(
	assetDir: string,
	destDir: string,
): Promise<void> {
	const src = getAssetPath(assetDir);
	await fs.copy(src, destDir);
}
