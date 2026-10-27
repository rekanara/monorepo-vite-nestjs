import { Prisma } from "@prisma/client"

// Shared "unit of work" type: the client handed to callbacks passed to
// PrismaService#$transaction(). Domain ports accept this as an optional,
// final parameter (defaulting to the module-scoped PrismaService when
// omitted) so a use case can ask two-plus repository calls to commit
// atomically without each repository inventing its own transaction
// mechanism. It's a type-only import wherever a domain port uses it, so it
// doesn't pull a runtime dependency into the domain layer.
export type PrismaTransactionClient = Prisma.TransactionClient
