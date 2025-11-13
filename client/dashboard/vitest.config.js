import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage/unit',
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 70,
        functions: 75,
      },
    },
    passWithNoTests: true,
  },
});
