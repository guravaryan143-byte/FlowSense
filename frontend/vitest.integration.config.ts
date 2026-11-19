import { defineConfig } from "vitest/config";

// Runs the API client against a REAL running backend:  API_URL=http://localhost:8000 npm run test:integration
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.integration.ts"], testTimeout: 30000 },
});
