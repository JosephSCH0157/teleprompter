module.exports = {
	testEnvironment: 'jsdom',
	testMatch: ['**/tests/ui/**/*.test.ts'],
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
