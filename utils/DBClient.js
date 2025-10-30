import { PrismaClient } from '../generated/prisma/client.js'

const prisma = new PrismaClient()


export const Configuration = prisma.configuration;