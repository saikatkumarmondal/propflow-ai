// backend/src/config/database.ts
import { PrismaClient } from "@prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"
import { neonConfig, Pool } from "@neondatabase/serverless"
import * as dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.join(__dirname, "../../.env") })

neonConfig.poolQueryViaFetch = true

let _prisma: PrismaClient | null = null

export const getPrisma = (): PrismaClient => {
  if (_prisma) return _prisma

  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")

  const parsed = new URL(url)
  process.env.PGHOST = parsed.hostname
  process.env.PGUSER = parsed.username
  process.env.PGPASSWORD = parsed.password
  process.env.PGDATABASE = parsed.pathname.replace("/", "")
  process.env.PGPORT = parsed.port || "5432"
  process.env.PGSSLMODE = "require"

  const pool = new Pool({ connectionString: url })
  const adapter = new PrismaNeon(pool)
  _prisma = new PrismaClient({ adapter })
  return _prisma
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getPrisma()
    const value = (client as any)[prop]
    return typeof value === "function" ? value.bind(client) : value
  }
})

export default prisma