export function generateGitignore(): string {
	return `# Dependencies
node_modules/

# Next.js
.next/
out/
next-env.d.ts

# Build
dist/

# Environment
.env
.env.local
.env.*.local
.env.vercel.*

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# TypeScript
*.tsbuildinfo

# Supabase local runtime
supabase/.branches
supabase/.temp

# Vercel
.vercel

# Cursor scratchpad
.cursor/scratchpad/
`;
}
