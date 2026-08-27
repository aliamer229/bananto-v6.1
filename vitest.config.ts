import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "cloudflare:workers": path.resolve(
        import.meta.dirname,
        "./src/test/cloudflare-workers.stub.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Scripts carry logic that decides what to delete from production, so their
    // tests belong in the same run as the app's.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
