import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config: providers + session strategy + pages only.
 * No Prisma adapter, no DB-touching callbacks. The full config in
 * `lib/auth.ts` spreads this and adds the adapter + callbacks for the
 * Node runtime. `middleware.ts` imports this file (and only this file)
 * so the Edge bundle stays under Vercel's 1 MB Hobby-tier limit.
 */
export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
} satisfies NextAuthConfig;
