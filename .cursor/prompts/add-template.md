# Add Template

Use this prompt when adding a new template file that gets scaffolded into output projects.

## Workflow

1. **Understand the template** — What file will this become in the output project? When should it be included?

2. **Choose the location**:
   - `src/templates/` — For TypeScript template functions that generate content dynamically
   - `assets/` — For static files copied as-is (images, JSON manifests, etc.)

3. **For TypeScript templates** (`src/templates/`):
   - Create a function that returns the file content as a string
   - Accept parameters for conditional content (e.g., `hasDatabase`, `authType`)
   - Export from the appropriate `index.ts`
   - Use template literals for multi-line content

4. **For static assets** (`assets/`):
   - Place the file in the appropriate subdirectory
   - Update the copy logic in `src/commands/new.ts` or relevant command

5. **Wire it up**:
   - Find where similar templates are written in `src/commands/new.ts`
   - Add your template using `writeFile()` from `src/utils/fs.ts`
   - Add any conditional logic (e.g., only write if `--db` flag is set)

6. **Test**:
   - Run `pnpm dev:app` to scaffold a test project
   - Verify the file appears in the output
   - Verify the content is correct

## Template Patterns

### Dynamic template (TypeScript function):

```typescript
// src/templates/example/my-template.ts
export function generateMyTemplate(options: { feature: boolean }): string {
  return `// Generated file
export const config = {
  feature: ${options.feature},
};
`;
}
```

### Static asset:

Place file at `assets/example/my-file.json`, then copy in command:

```typescript
import { copyFile } from '../utils/fs.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '../../assets');

await copyFile(
  path.join(assetsDir, 'example/my-file.json'),
  path.join(targetDir, 'my-file.json')
);
```
