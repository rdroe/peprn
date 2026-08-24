/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.spec.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }]
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.spec.ts',
        '!src/testable/**',
        '!src/util/react-utils.ts',
        '!src/browser.ts',
        '!src/browser-default-history.ts',
        '!src/default-browser-app.ts',
    ],
    coverageThreshold: {
        global: {
            lines: 30
        }
    }
}
