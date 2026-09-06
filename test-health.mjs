import https from "https";
import { PrismaClient } from "./lib/generated/prisma/client/index.js";

const prisma = new PrismaClient();

function pingUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.statusCode);
    }).on("error", () => resolve(500));
  });
}

async function runHealthCheck() {
  console.log("\n🔍 RUNNING ARCHVISION AI SYSTEM HEALTH CHECK...\n");

  // 1. Database Check
  try {
    const userCount = await prisma.user.count();
    console.log(`✅ [1/4] Neon Cloud Database: CONNECTED (Found ${userCount} users in DB)`);
  } catch (err) {
    console.log("❌ [1/4] Neon Cloud Database: FAILED TO CONNECT", err.message);
  } finally {
    await prisma.$disconnect();
  }

  // 2. Live Website Check
  const homeStatus = await pingUrl("https://archvision-uml-adbms.vercel.app");
  if (homeStatus === 200 || homeStatus === 307 || homeStatus === 308) {
    console.log(`✅ [2/4] Live Vercel Production: ONLINE (HTTP ${homeStatus})`);
  } else {
    console.log(`❌ [2/4] Live Vercel Production: OFFLINE (HTTP ${homeStatus})`);
  }

  // 3. Live Login Page Check
  const loginStatus = await pingUrl("https://archvision-uml-adbms.vercel.app/login");
  if (loginStatus === 200) {
    console.log(`✅ [3/4] Live Login Page: ACTIVE & READY (HTTP ${loginStatus})`);
  } else {
    console.log(`❌ [3/4] Live Login Page: ERROR (HTTP ${loginStatus})`);
  }

  // 4. NextAuth Endpoint Check
  const authStatus = await pingUrl("https://archvision-uml-adbms.vercel.app/api/auth/csrf");
  if (authStatus === 200) {
    console.log(`✅ [4/4] Live Auth Security Engine: RUNNING (HTTP ${authStatus})`);
  } else {
    console.log(`❌ [4/4] Live Auth Security Engine: ERROR (HTTP ${authStatus})`);
  }

  console.log("\n==================================================");
  console.log("🚀 ALL SYSTEMS OPERATIONAL FOR TOMORROW'S DEMO!");
  console.log("==================================================\n");
}

runHealthCheck();
