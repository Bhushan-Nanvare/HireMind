import { defineConfig } from "vitest/config";

// .mts because the backend is CommonJS ("type": "commonjs") and this file uses ESM syntax
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Applies migrations to the test database once, and refuses to run against anything but a test DB
    globalSetup: ["./tests/globalSetup.ts"],
    // Every file shares one database, so they run one at a time
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      // The tests sign their tokens through the app, so any value works here
      JWT_SECRET: "test-only-secret-0123456789abcdefghij",
      APP_URL: "http://localhost:5173",
      STORAGE_DRIVER: "local",
    },
  },
});
