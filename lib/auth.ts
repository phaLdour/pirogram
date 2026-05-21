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
  events: {
    // Auth.js's Prisma adapter does NOT refresh the stored access_token /
    // scope on subsequent sign-ins to an existing account. When we widened
    // the GitHub OAuth scope in Sprint 7, users who had already linked
    // their GitHub account kept the old narrow scope in DB even after
    // re-authorizing — `/repos` then kept showing the "Reconnect GitHub"
    // card forever. Re-write the token + scope on every successful OAuth
    // callback so the DB reflects the latest consent.
    async signIn({ user, account }) {
      if (!account || !user?.id || account.provider !== "github") return;
      await prisma.account.updateMany({
        where: {
          provider: "github",
          providerAccountId: String(account.providerAccountId),
        },
        data: {
          access_token: account.access_token ?? null,
          refresh_token: account.refresh_token ?? null,
          scope: account.scope ?? null,
          expires_at:
            typeof account.expires_at === "number" ? account.expires_at : null,
          token_type: account.token_type ?? null,
          id_token: account.id_token ?? null,
        },
      });
    },
  },
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
