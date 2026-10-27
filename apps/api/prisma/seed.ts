import path from "node:path"
import dotenv from "dotenv"
import * as argon2 from "argon2"
import { PrismaClient } from "@prisma/client"
import { PERMISSIONS } from "@workspace/contracts"
import { generateId } from "../src/common/ids/id-generator"

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") })

const prisma = new PrismaClient()
export const SUPER_ADMIN_ROLE_ID = "019a0000-0000-7000-8000-000000000001"

async function main() {
  // Catalog in contracts is the source of truth; DB mirrors it.
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { resource_action: p },
      create: { id: generateId(), ...p },
      update: {},
    })
  }
  await prisma.permission.deleteMany({
    where: {
      NOT: {
        OR: PERMISSIONS.map((p) => ({
          resource: p.resource,
          action: p.action,
        })),
      },
    },
  })

  await prisma.role.upsert({
    where: { id: SUPER_ADMIN_ROLE_ID },
    create: {
      id: SUPER_ADMIN_ROLE_ID,
      name: "Super Admin",
      description: "Full system access",
      isSystem: true,
      requireTwoFactor: true,
    },
    update: { isSystem: true, requireTwoFactor: true },
  })
  for (const p of PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { roleId_resource_action: { roleId: SUPER_ADMIN_ROLE_ID, ...p } },
      create: {
        id: generateId(),
        roleId: SUPER_ADMIN_ROLE_ID,
        ...p,
        scope: "all",
      },
      update: { scope: "all" },
    })
  }

  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase()
  const password = process.env.SUPER_ADMIN_PASSWORD
  if (!email || !password)
    throw new Error("SUPER_ADMIN_EMAIL/PASSWORD required")
  await prisma.user.upsert({
    where: { email },
    create: {
      id: generateId(),
      email,
      fullName: "Super Admin",
      roleId: SUPER_ADMIN_ROLE_ID,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      emailVerifiedAt: new Date(),
    },
    update: { roleId: SUPER_ADMIN_ROLE_ID, isActive: true },
  })
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
