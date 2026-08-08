import { safeProjectIdentifier } from "../../utils/identifiers.js";

export function generateDockerCompose(appName: string): string {
	const identifier = safeProjectIdentifier(appName);
	return `services:
  postgres:
    image: postgres:16
    container_name: ${identifier}-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${identifier}
    ports:
      - "5400:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
`;
}

export function generateDockerComposeWithSeed(appName: string): string {
	const identifier = safeProjectIdentifier(appName);
	return `services:
  postgres:
    image: postgres:16
    container_name: ${identifier}-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${identifier}
    ports:
      - "5400:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db-data/dump.backup:/docker-entrypoint-initdb.d/dump.backup
      - ./db-data/restore.sh:/docker-entrypoint-initdb.d/restore.sh

volumes:
  postgres_data:
`;
}
