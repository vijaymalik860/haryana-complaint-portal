import { PrismaClient } from "@prisma/client";

// In development, Next.js hot-reload re-evaluates modules on every change,
// creating new PrismaClient instances each time and exhausting the DB connection pool.
// Storing the instance on `global` survives module re-evaluation in dev mode.
// In production, module-level variables are fine since there is no hot reload.

const globalForPrisma = globalThis as unknown as { _prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma._prisma) {
    globalForPrisma._prisma = new PrismaClient();
  }
  return globalForPrisma._prisma;
}
