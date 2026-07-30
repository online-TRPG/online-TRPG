import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    css: true,
  },
  resolve: {
    alias: {
      "@trpg/shared-types/browser-runtime": fileURLToPath(
        new URL("../shared-types/src/browser-runtime.ts", import.meta.url),
      ),
    },
  },
});
