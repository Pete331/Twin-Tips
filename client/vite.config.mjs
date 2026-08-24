import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      // React is 16.13.1, which predates the automatic JSX runtime backported
      // in 16.14. Every component already imports React, so classic works as-is.
      jsxRuntime: "classic",
    }),
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
