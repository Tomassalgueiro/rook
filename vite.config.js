import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// WebKitGTK (Tauri's Linux webview) keeps a disk cache across app restarts and can run stale
// modules from it ("failed to load virtual css module"). Never let it store dev responses.
/** @type {import("vite").Plugin} */
const noStoreInDev = {
  name: "rook:no-store-in-dev",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      const setHeader = res.setHeader.bind(res);
      res.setHeader = (/** @type {string} */ name, /** @type {Parameters<typeof setHeader>[1]} */ value) =>
        setHeader(name, name.toLowerCase() === "cache-control" ? "no-store" : value);
      res.setHeader("Cache-Control", "no-store");
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [sveltekit(), noStoreInDev],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
