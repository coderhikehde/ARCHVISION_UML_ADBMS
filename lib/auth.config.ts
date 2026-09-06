import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

const secret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  "f8a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef";

const githubId = process.env.GITHUB_CLIENT_ID || "Ov23li0MFHkzy9WTJrJ2";
const githubSecret = process.env.GITHUB_CLIENT_SECRET || "d7f894160a9f68b8682aea1a9dbc2b7f078ac498";

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      id: "demo",
      name: "Demo Access",
      credentials: {},
      async authorize() {
        return {
          id: "demo-user",
          name: "Demo Explorer",
          email: "demo@archvision.ai",
        };
      },
    }),
    GitHub({
      clientId: githubId,
      clientSecret: githubSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id || "demo-user";
        token.email = user.email || "demo@archvision.ai";
        token.name = user.name || "User";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) || "demo-user";
      }
      return session;
    },
  },
  secret: secret,
  trustHost: true,
};
