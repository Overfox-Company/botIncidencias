import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client.js'

const prisma = new PrismaClient()
prisma.$connect()


export const Configuration = prisma.configuration;