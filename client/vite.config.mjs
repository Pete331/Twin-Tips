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
    // Fail rather than quietly pick another port. Vite's default is to
    // increment until it finds a free one, and the next port up is 3001 - the
    // API's. It then proxies /api to localhost:3001, which is now itself, so
    // every API call comes back 502 and the app looks broken for no visible
    // reason. Meanwhile the API cannot bind its own port and never starts at
    // all.
    //
    // A leftover dev server from a previous day is enough to cause it, and the
    // symptom points nowhere near the cause. Refusing to start names it.
    strictPort: true,
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
