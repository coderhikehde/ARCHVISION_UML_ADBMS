import type { NextAuthConfig } from "next-auth";
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { authConfig as edgeSafeConfig } from "@/lib/auth.config";

export const authConfig: NextAuthConfig = {
  ...edgeSafeConfig,
  adapter: PrismaAdapter(db),
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
