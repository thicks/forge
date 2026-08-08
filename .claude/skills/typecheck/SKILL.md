---
name: typecheck
description: Run TypeScript type checking for Forge CLI. Use when checking for type errors, validating TypeScript code, or before committing changes.
allowed-tools: Bash(pnpm:*), Read, Grep
---

# TypeScript Type Checking

## Commands

Check the project:
```bash
pnpm typecheck
```

## Instructions

1. Run `pnpm typecheck` first
2. If errors occur, show full error output with file locations
3. Group errors by file for clarity
4. Report total error count at the end

## Notes

- Forge uses tsup for building, but typecheck runs tsc directly
- Pre-existing errors in `update.ts` (copyAssetIfMissing) are known issues
