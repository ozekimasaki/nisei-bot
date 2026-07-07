import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const required = ["DISCORD_TOKEN", "CLIENT_ID", "DATABASE_URL"] as const;
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(", ")}`);
  console.error("Create .env from .env.example and fill Discord settings.");
  process.exit(1);
}

if (!process.env.GUILD_ID) {
  console.warn("GUILD_ID is empty. Slash commands will deploy globally, which can take time.");
}

const prisma = new PrismaClient();

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Windows local check OK");
  console.log("PostgreSQL connection OK");
} catch (error) {
  console.error("PostgreSQL connection failed.");
  console.error("If you use Podman, run: npm run db:windows:up");
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
