export function generatePostgresRestoreScript(): string {
	return `#!/bin/bash
# Only seeds on first-time DB init (docker-entrypoint-initdb.d runs once)
set -e
pg_restore --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" /docker-entrypoint-initdb.d/dump.backup 2>/dev/null || true
`;
}
