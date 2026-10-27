import { defineConfig } from "vitest/config"
import swc from "unplugin-swc"

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.e2e-spec.ts"],
    setupFiles: ["./vitest.setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
