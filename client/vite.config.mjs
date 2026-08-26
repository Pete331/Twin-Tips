import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    // The automatic JSX runtime is the default on React 19, and means a file
    // using JSX no longer has to import React for the transform's sake. This
    // was pinned to "classic" back when the client was on React 16.13, which
    // predates the runtime being backported.
    react(),
  ],
  server: {
    port: 3000,
    // Replaces CRA's "proxy" field in package.json.
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    // server.js serves client/build, so keep CRA's output directory name
    // rather than Vite's default dist.
    outDir: "build",
  },
});
