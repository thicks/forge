export function generateUserFactory(useWorkOS = false): string {
	if (useWorkOS) {
		return `import { faker } from "@faker-js/faker";

interface User {
	id: string;
	workosId: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	emailVerified: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Create a fake user for testing (WorkOS schema)
 */
export function createUser(overrides?: Partial<User>): User {
	return {
		id: faker.string.uuid(),
		workosId: \`user_\${faker.string.alphanumeric(24)}\`,
		email: faker.internet.email(),
		firstName: faker.person.firstName(),
		lastName: faker.person.lastName(),
		emailVerified: true,
		createdAt: faker.date.past(),
		updatedAt: faker.date.recent(),
		...overrides,
	};
}

export function createUserInput(overrides?: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>) {
	return {
		workosId: \`user_\${faker.string.alphanumeric(24)}\`,
		email: faker.internet.email(),
		firstName: faker.person.firstName(),
		lastName: faker.person.lastName(),
		emailVerified: true,
		...overrides,
	};
}
`;
	}

	return `import { faker } from "@faker-js/faker";

interface User {
	id: string;
	email: string;
	username: string;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Create a fake user for testing
 */
export function createUser(overrides?: Partial<User>): User {
	return {
		id: faker.string.uuid(),
		email: faker.internet.email(),
		username: faker.internet.username(),
		createdAt: faker.date.past(),
		updatedAt: faker.date.recent(),
		...overrides,
	};
}

export function createUserInput(overrides?: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>) {
	return {
		email: faker.internet.email(),
		username: faker.internet.username(),
		...overrides,
	};
}
`;
}
