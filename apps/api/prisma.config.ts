import { config } from "dotenv"
import { defineConfig } from "prisma/config"

config({ path: "../../.env", quiet: true })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "ts-node --transpile-only -P tsconfig.seed.json prisma/seed.ts",
  },
})
