module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
  },
  ignorePatterns: ['node_modules/', 'coverage/', 'dist/', 'client/'],
  rules: {
  },
  overrides: [
    {
      files: ['scripts/producer-firehose.js'],
      parserOptions: { sourceType: 'module' },
    },
  ],
};
