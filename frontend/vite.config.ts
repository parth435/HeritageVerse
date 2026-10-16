import { fileURLToPath } from "node:url";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
  },
  build: {
    outDir: path.resolve(root, "../dist"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
});
