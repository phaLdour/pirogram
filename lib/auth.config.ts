import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config: providers + session strategy + pages only.
 * No Prisma adapter, no DB-touching callbacks. The full config in
 * `lib/auth.ts` spreads this and adds the adapter + callbacks for the
 * Node runtime. `middleware.ts` imports this file (and only this file)
 * so the Edge bundle stays under Vercel's 1 MB Hobby-tier limit.
 *
 * Scope rationale:
 * - `read:user user:email` — profile basics + email for the Session.
 * - `repo` — list private + public repos in the /repos picker.
 * - `admin:repo_hook` — one-click bind installs the webhook on GitHub
 *   server-side; one-click unbind removes it. Without this scope the
 *   user would have to copy/paste the secret into GitHub by hand.
 *
 * The breadth is acceptable because the OAuth App is owned by the
 * same identity signing in — they're trusting themselves, not a
 * third party.
 */
export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: {
        params: { scope: "read:user user:email repo admin:repo_hook" },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
} satisfies NextAuthConfig;
