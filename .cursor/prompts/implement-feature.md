# Implement Feature

Use this prompt when building a new feature in Forge.

## Workflow

1. **Understand the request** — Clarify what the feature does and how it fits into Forge's CLI structure.

2. **Explore the codebase** — Before writing code:
   - Check `src/commands/` for similar command patterns
   - Check `src/utils/` for reusable utilities
   - Check `src/templates/` if the feature involves scaffolding output
   - Check `assets/` if the feature involves static files copied to output

3. **Plan the implementation** — List:
   - Files to create or modify
   - New dependencies (if any)
   - Changes to CLI options or commands
   - Changes to templates or assets

4. **Implement** — Following Forge conventions:
   - Commands go in `src/commands/`
   - Utilities go in `src/utils/`
   - Templates go in `src/templates/`
   - Static assets go in `assets/`
   - Use the existing logger (`src/utils/logger.ts`) for output
   - Use the spinner utility for long-running operations

5. **Verify** — Before finishing:
   - Run `pnpm build` to ensure TypeScript compiles
   - Run `pnpm lint` to check for issues
   - Test manually with `pnpm dev <command>`

6. **Update documentation** — If the feature adds/changes CLI behavior:
   - Update `README.md` with new commands or options
   - Add examples if helpful

## Key Files Reference

- `src/index.ts` — CLI entry point (Commander setup)
- `src/commands/new.ts` — Main scaffolding orchestration
- `src/utils/config-manager.ts` — Load/save `~/.forge.json`
- `src/utils/exec.ts` — Shell command execution
- `src/utils/fs.ts` — File operations
- `src/utils/logger.ts` — Colored console output
- `src/utils/spinner.ts` — Progress spinners
- `assets/skills.json` — Skills manifest for scaffolded projects
