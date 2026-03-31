import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { CLIENT_ASSET_BASE } from "./src/client/appBases";

export default defineConfig({
  root: "src/client",
  base: CLIENT_ASSET_BASE,
  plugins: [vue()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3030",
        changeOrigin: true
      },
      "/actions": {
        target: "http://127.0.0.1:3030",
        changeOrigin: true
      },
      "/health": {
        target: "http://127.0.0.1:3030",
        changeOrigin: true
      },
      "/login": {
        target: "http://127.0.0.1:3030",
        changeOrigin: true
      },
      "/logout": {
        target: "http://127.0.0.1:3030",
        changeOrigin: true
      }
    }
  }
});
