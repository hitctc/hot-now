import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/client/**/*.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          environment: "jsdom",
          include: ["tests/client/**/*.test.ts"]
        }
      }
    ]
  }
});
