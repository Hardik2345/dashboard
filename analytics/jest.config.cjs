const { defaults } = require('jest-config');

module.exports = {
  ...defaults,
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: [
    'server.js',
    'lib/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**'
  ],
  coverageProvider: 'v8',
  coverageDirectory: 'coverage/unit',
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
      branches: 70,
      functions: 75
    }
  },
  passWithNoTests: true
};
