import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ENVIRONMENT: "test",
          XAI_MOCK: "1",
          MASTER_EMAIL: "owner@studio.test",
          MASTER_PASSWORD: "test-only-password",
          TURNSTILE_BYPASS: "1",
          MIDTRANS_ENABLED: "0",
          MIDTRANS_SERVER_KEY: "test-server-key",
        },
      },
    }),
  ],
  test: {
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30000,
  },
});
