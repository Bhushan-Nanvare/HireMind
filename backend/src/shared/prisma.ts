import { PrismaClient, Prisma } from "../../generated/prisma";

export const prisma = new PrismaClient();

/** True when a write failed on a unique constraint, e.g. a duplicate request that raced another one. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
