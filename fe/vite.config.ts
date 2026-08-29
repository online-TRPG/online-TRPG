import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const blockInternalAiRoutes = () => ({
  name: "block-internal-ai-routes",
  configureServer(server: {
    middlewares: {
      use: (
        handler: (
          request: { url?: string },
          response: {
            statusCode: number;
            setHeader(name: string, value: string): void;
            end(body?: string): void;
          },
          next: () => void,
        ) => void,
      ) => void;
    };
  }) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split(/[?#]/, 1)[0] ?? "";
      const isInternalAiRoute =
        pathname === "/ai" ||
        pathname.startsWith("/ai/") ||
        pathname === "/internal/ai" ||
        pathname.startsWith("/internal/ai/");

      if (!isInternalAiRoute) {
        next();
        return;
      }

      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end("Not Found");
    });
  },
});

export default defineConfig({
  plugins: [blockInternalAiRoutes(), react()],
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
