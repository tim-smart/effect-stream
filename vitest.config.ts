/// <reference types="vitest" />
import { defineConfig } from "vite"

export default defineConfig({
  test: {
    include: ["./test/**/*.test.ts"],
    exclude: [],
    globals: true,
    coverage: {
      provider: "v8",
    },
  },
})
