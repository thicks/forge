# Debug Scaffolding

Use this prompt when troubleshooting issues with Forge's scaffolding output.

## Workflow

1. **Reproduce the issue**:
   - What command was run? (e.g., `forge new my-app --db postgres --auth workos`)
   - What was expected?
   - What actually happened?

2. **Check the scaffolding flow**:
   - Entry point: `src/commands/new.ts`
   - Follow the execution path for the relevant flags
   - Check template generation functions in `src/templates/`
   - Check file writing in `src/utils/fs.ts`

3. **Common issues**:

   **File not created:**
   - Is the template function being called?
   - Is the condition for writing the file correct?
   - Check the target path construction

   **Wrong content:**
   - Check the template function parameters
   - Verify conditional logic in the template
   - Check for typos in template literals

   **Dependencies missing:**
   - Check `src/templates/standalone/package-json.ts`
   - Verify the dependency is added for the right condition

   **Script not working in output:**
   - Check `package.json` scripts in template
   - Verify paths are correct for standalone vs monorepo

4. **Test the fix**:
   - Run `pnpm build` to compile
   - Run `pnpm dev:app` (or variant) to scaffold test project
   - Verify the issue is resolved

## Quick Debug Commands

```bash
# Scaffold a fresh test project
pnpm dev:app

# Scaffold with specific options
pnpm dev new test-debug --db postgres --auth workos --ci

# Check a specific output file
cat test-working-dir/test-app/<file>

# Clean up and retry
rm -rf test-working-dir/test-app && pnpm dev:app
```

## Key Files for Debugging

| Issue area | Check these files |
|------------|-------------------|
| Package.json content | `src/templates/standalone/package-json.ts` |
| TypeScript config | `src/templates/standalone/tsconfig.ts` |
| Database setup | `src/templates/db/` |
| Auth setup | `src/templates/auth/` |
| Skills installation | `src/commands/new.ts` (search for "skills") |
| Vercel setup | `src/commands/setup-vercel.ts` |
| GitHub setup | `src/commands/setup-git.ts` |
