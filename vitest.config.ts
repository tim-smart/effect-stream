import * as Path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["./test/**/*.test.ts"],
    exclude: [],
    alias: {
      ["effect-stream"]: Path.join(__dirname, "src")
    },
    globals: true,
    coverage: {
      provider: "v8"
    }
  }
})
