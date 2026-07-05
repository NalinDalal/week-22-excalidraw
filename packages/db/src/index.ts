import { PrismaClient } from "@prisma/client";

/** Singleton Prisma client used across all backend services for DB access */
export const prismaClient = new PrismaClient();
