#!/usr/bin/env node
import { Command } from "commander";
import { cleanCommand } from "./commands/clean.js";
import { configPushCommand } from "./commands/config-push.js";
import { configCommand } from "./commands/config.js";
import { envCommand } from "./commands/env.js";
import { migrateCommand } from "./commands/migrate.js";
import { newCommand } from "./commands/new.js";
import { selfUpdateCommand } from "./commands/self-update.js";
import { setupGitCommand } from "./commands/setup-git.js";
import { setupVercelCommand } from "./commands/setup-vercel.js";
import { updateCommand } from "./commands/update.js";
import { getVersion } from "./utils/version.js";

const program = new Command()
	.name("forge")
	.description(
		"Scaffold standardized apps with optional Turborepo, Replit support, and Vercel deployment",
	)
	.version(getVersion());

program.addCommand(configCommand);
program.addCommand(configPushCommand);
program.addCommand(envCommand);
program.addCommand(newCommand);
program.addCommand(migrateCommand);
program.addCommand(setupGitCommand);
program.addCommand(setupVercelCommand);
program.addCommand(updateCommand);
program.addCommand(selfUpdateCommand);
program.addCommand(cleanCommand);

// Add detailed help text showing all command options
program.addHelpText(
	"after",
	`
Config:
  $ forge config                                           # Detect or prompt for tokens
  $ forge config-push <ssh-host>                           # Push config to remote server

Env Sync:
  $ forge env pull                                         # Pull Vercel env vars → .env.vercel.development
  $ forge env pull --env production                        # Pull from production environment
  $ forge env pull --dry-run                               # Preview changes without writing
  $ forge env push                                         # Push .env.vercel.development → Vercel
  $ forge env push --env production                        # Push to production (requires double confirm)
  $ forge env push --dry-run                               # Preview changes without pushing

Self-Update:
  $ forge self-update                                      # Update forge to latest main
  $ forge self-update <branch>                             # Update forge to a specific branch

Clean:
  $ forge clean <project-path>                             # Tear down GitHub repo + Vercel project

New Options:
  --monorepo <path>   Create a Turborepo monorepo at the specified path (⚠️ experimental)
  --auth <type>       Authentication type: workos, simple, or better-auth (omit for none)
  --db <type>         Database type: postgres or supabase (omit for none)
  --github        Create and push to a GitHub remote repo under your configured org
  --vercel            Set up Vercel project and deployment configuration

Migrate Options:
  --db <type>         Target database: supabase (default) or postgres
  --auth <type>       Target auth: workos, demo (default), or none
  --dry-run           Analyze source without creating files
  --verbose           Show detailed conversion output

Setup Git Options:
  <path>              Path to the project directory

Setup Vercel Options:
  <path>              Path to the project directory
  --auth <type>       Authentication type: workos, simple, better-auth, or none
  --db <type>         Database type: postgres or supabase (omit for none)

Update Options:
  <path>              Path to the project directory
  --db <type>         Add or switch database config: postgres or supabase
  --supabase          Provision Supabase cloud project (implies --db supabase)
  --github            Set up GitHub remote for existing project
  --vercel            Set up Vercel project/deployment for existing project
  --ai                Update AI scaffold files (skips unchanged files)

Examples:
  # Config command (run first to set up tokens)
  $ forge config                                           # Detect or prompt for tokens

  # New commands (git is always initialized)
  $ forge new my-app                                       # Standalone app at ./my-app
  $ forge new my-app --db postgres                         # Standalone with PostgreSQL
  $ forge new my-app --db supabase                         # Standalone with Supabase
  $ forge new my-app --auth workos                    # Standalone with WorkOS auth
  $ forge new my-app --auth simple                         # Standalone with simple auth
  $ forge new my-app --github                          # With GitHub remote
  $ forge new my-app --vercel --auth workos --db postgres  # Full setup with Vercel
  $ forge new web --monorepo ./my-platform                 # Monorepo at ./my-platform
  $ forge new dashboard --monorepo ../corp --db postgres --auth workos

  # Setup commands (for existing projects)
  $ forge setup-git ./my-app                               # Set up GitHub remote
  $ forge setup-vercel ./my-app --auth workos --db postgres  # Set up Vercel
  $ forge update ./my-app --db postgres                    # Add/update postgres config
  $ forge update ./my-app --github --vercel                # Link GitHub + Vercel
  $ forge update ./my-app --supabase                       # Cloud Supabase only (implies --db supabase)
  $ forge update ./my-app --vercel --db postgres           # Configure Vercel with DB context
  $ forge update ./my-app --ai                             # Update AI scaffold files
  $ forge update ./my-app --auth workos                  # Scaffold WorkOS AuthKit (prompts for app credentials)

  # Migrate commands
  $ forge migrate ./replit-app ./nextjs-app                # Migrate with defaults
  $ forge migrate ./replit-app ./nextjs-app --auth workos  # Migrate with WorkOS auth
  $ forge migrate ./replit-app ./nextjs-app --dry-run      # Analyze without converting

Full docs: https://github.com/thicks/forge/tree/main/docs
`,
);

// If no command is specified, show help
if (process.argv.length === 2) {
	program.help();
}

// Normalize single-dash multi-character options for convenience.
// Example: `-ai` becomes `--ai`.
for (let i = 0; i < process.argv.length; i++) {
	if (process.argv[i] === "-ai") {
		process.argv[i] = "--ai";
	}
}

program.parse();
