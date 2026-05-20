import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "MEMBER";
    } & DefaultSession["user"];
  }
}

type Role = "ADMIN" | "MEMBER";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        token.role = (dbUser?.role ?? "MEMBER") satisfies Role;
      }
      return token;
    },
    session({ session, token }) {
      const uid = typeof token.uid === "string" ? token.uid : undefined;
      const role = (token.role === "ADMIN" ? "ADMIN" : "MEMBER") satisfies Role;
      if (uid) session.user.id = uid;
      session.user.role = role;
      return session;
    },
  },
});
