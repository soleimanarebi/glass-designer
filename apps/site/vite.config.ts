import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        privacy: resolve(__dirname, "privacy.html"),
        thanks: resolve(__dirname, "thanks.html"),
      },
    },
  },
  test: { environment: "jsdom" },
});
