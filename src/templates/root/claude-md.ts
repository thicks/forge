export function generateClaudeMd(
	name: string,
	authType: "workos" | "simple" | "better-auth" | "none" | boolean,
	isMonorepo = false,
	hasDatabase = true,
): string {
	// Support legacy boolean for backwards compatibility
	const auth =
		typeof authType === "boolean" ? (authType ? "workos" : "simple") : authType;

	const authDescriptions: Record<string, string> = {
		workos: "WorkOS AuthKit for enterprise SSO",
		simple: "Simple cookie-based authentication",
		"better-auth": "Better Auth with email/password",
		none: "No authentication configured",
	};
	const authDescription = authDescriptions[auth] || authDescriptions.none;
	const projectType = isMonorepo
		? "pnpm monorepo with Turborepo"
		: "standalone Next.js application";
	const architectureSection = isMonorepo
		? `### Monorepo Structure
\`\`\`
${name}/
├── apps/web/                    # Main Next.js application
│   ├── app/                     # Pages, layouts, route handlers
│   ├── db/                      # Drizzle ORM schema and client (if DB enabled)
│   ├── lib/                     # Shared utilities and logger
│   └── __tests__/               # Vitest tests
├── packages/
│   └── ui/                      # Shared UI components (shadcn)
├── .claude/                     # Claude Code settings and skills
└── .cursor/                     # Cursor settings and rules
\`\`\``
		: `### Standalone Structure
\`\`\`
${name}/
├── app/                         # Pages, layouts, route handlers
├── components/                  # UI components and providers
├── lib/                         # Shared utilities, logging, analytics
├── db/                          # Drizzle schema and clients (if DB enabled)
├── __tests__/                   # Vitest test suites and helpers
├── .claude/                     # Claude Code settings and skills
├── .cursor/                     # Cursor settings and rules
└── FORGE_RECOMMENDATIONS.md     # Human-friendly AI usage guide
\`\`\``;
	const devCommand = isMonorepo ? "pnpm dev (from monorepo root)" : "pnpm dev";
	const buildCommand = isMonorepo
		? "pnpm build (from monorepo root)"
		: "pnpm build";
	const lintCommand = isMonorepo
		? "pnpm lint (from monorepo root)"
		: "pnpm lint";
	const typecheckCommand = isMonorepo
		? "pnpm typecheck (from monorepo root)"
		: "pnpm typecheck";
	const testCommand = isMonorepo
		? "pnpm test (from monorepo root)"
		: "pnpm test";
	const dbEnvLine = hasDatabase
		? "- `DATABASE_URL` - PostgreSQL connection string (required when database is enabled)"
		: "- No database env vars required unless you add a database later";

	return `# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Git Operations

**ALWAYS ask for explicit user confirmation before running any git commands that modify history or remote state**, including:
- \`git commit\`
- \`git push\`
- \`git merge\`
- \`git rebase\`
- \`git reset\`

## Commands

### Development
- \`${devCommand}\` - Start the development server
- \`${buildCommand}\` - Build for production
- \`pnpm start\` - Start production server

### Code Quality
- \`${lintCommand}\` - Run ESLint checks
- \`pnpm format\` - Run Biome formatter
- \`${typecheckCommand}\` - Run TypeScript type checking

### Testing
- \`${testCommand}\` - Run all tests
- \`pnpm test:watch\` - Watch mode
- \`pnpm test:coverage\` - Coverage report

### Database
- \`pnpm db:generate\` - Generate migrations from schema
- \`pnpm db:migrate\` - Apply migrations
- \`pnpm db:push\` - Push schema to database
- \`pnpm db:studio\` - Open Drizzle Studio

## Architecture

### Project Overview
${name} is a ${projectType}.

${architectureSection}

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **UI**: React 19, shadcn/ui, Tailwind CSS v4
- **Database**: PostgreSQL, Drizzle ORM
- **Auth**: ${authDescription}
- **Testing**: Vitest
- **Linting**: ESLint
- **Formatting**: Biome
- **Analytics**: PostHog (optional)

## Key Conventions

- **Path aliases**: Use \`@/*\` for project-root imports.
- **Logging**: Use \`@/lib/logger/server\` or \`@/lib/logger/client\` instead of \`console.log\`.
- **Services Layer**: Keep database access in service modules instead of route handlers or UI components.
- **Formatting**: Use Biome formatting; do not mix with Prettier.

## Environment Variables

Required (stored in \`.env.vercel.development\` or \`.env.local\`):
${auth === "workos" ? "- `WORKOS_API_KEY` - WorkOS API key\n- `WORKOS_CLIENT_ID` - WorkOS client ID\n- `WORKOS_COOKIE_PASSWORD` - Cookie encryption key\n- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` - OAuth redirect URI" : auth === "better-auth" ? "- `BETTER_AUTH_SECRET` - Secret key for Better Auth\n- `BETTER_AUTH_URL` - Base URL for auth (http://localhost:3000 in dev)" : "- No auth env vars required for simple auth"}
${dbEnvLine}
- \`NEXT_PUBLIC_POSTHOG_KEY\` - PostHog analytics (optional)

## Pull Request Workflow

Recommended flow:
1. Create a feature branch before making changes.
2. Use commits as small, meaningful save points.
3. Open a PR with a clear summary and test plan.

Commit prefixes:
- \`feat:\` New feature
- \`fix:\` Bug fix
- \`chore:\` Maintenance/refactor
- \`docs:\` Documentation update

## Claude Desktop

Claude Desktop (the chat app) uses a **single global config file**, not per-project. To use it with this repo, merge \`.claude/claude_desktop_config.example.json\` into your global config and restart Claude Desktop.

- **macOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
- **Windows**: \`%APPDATA%\\Claude\\claude_desktop_config.json\`
- **Linux**: \`~/.config/Claude/claude_desktop_config.json\`

You can add project-specific MCP servers to the example file and then merge that block into your global config.

## Recommended AI Setup

See \`FORGE_RECOMMENDATIONS.md\` for a plain-language guide on:
- How skills work
- How to ask the AI for common tasks
- Git and PR basics
- Browser testing workflow
- Optional MCP integrations
`;
}
