import { config as loadEnv } from "dotenv";
import { ensureSeeded } from "@/lib/data/seed";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function main(): Promise<void> {
  await ensureSeeded();
  console.log("Seeded demo user, project and diagrams.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });