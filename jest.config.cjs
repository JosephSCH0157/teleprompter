module.exports = {
	testEnvironment: 'jsdom',
	testMatch: ['**/tests/ui/**/*.test.ts'],
	setupFiles: ['<rootDir>/tests/setup-jest.ts'],
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{ tsconfig: 'tsconfig.json', useESM: true }
		]
	},
	extensionsToTreatAsEsm: ['.ts'],
	moduleFileExtensions: ['ts','tsx','js','jsx','json'],
	verbose: false,
};
