import { defineConfig } from "vitest/config"
import swc from "unplugin-swc"

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
})
