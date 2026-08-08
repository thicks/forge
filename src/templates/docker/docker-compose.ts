export function generateDockerCompose(appName: string): string {
	return `services:
  postgres:
    image: postgres:16
    container_name: ${appName}-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${appName}
    ports:
      - "5400:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
`;
}

export function generateDockerComposeWithSeed(appName: string): string {
	return `services:
  postgres:
    image: postgres:16
    container_name: ${appName}-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${appName}
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
