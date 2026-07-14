import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@trpg/shared-types/frontend": fileURLToPath(
        new URL("../shared-types/src/frontend.ts", import.meta.url),
      ),
      "@trpg/shared-types/browser-runtime": fileURLToPath(
        new URL("../shared-types/src/browser-runtime.ts", import.meta.url),
      ),
    },
  },
  build: {
    commonjsOptions: {
      include: [/shared-types[\\/]dist/, /node_modules/],
    },
  },
  server: {
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
