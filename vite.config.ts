import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const projectRoot = import.meta.dirname;

export default defineConfig({
  build: {
    outDir: "dist/spa",
    // Preserve dynamic-import boundaries so the Zoom SDK loads only on joining a classroom.
    // A catch-all node_modules group would pull it into the homepage dependency graph.
  },
  plugins: [
    react(),
    {
      name: "express-api",
      async configureServer(server) {
        const { createServer, initializeServer } = await import("./server/index.ts");
        await initializeServer();
        const app = createServer();
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/api/")) {
            app(req as any, res as any, next as any);
            return;
          }

          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "./client"),
      "@shared": path.resolve(projectRoot, "./shared"),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
  },
});
