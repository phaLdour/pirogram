// NOTE: do not import this from a client component. We intentionally avoid
// `import "server-only"` because Vitest's Vite resolver doesn't know that
// marker module; the file's only consumers are server actions and server
// components, which keeps it on the Node runtime.
import { prisma } from "@/lib/db";

export type GithubAccount = {
  accessToken: string;
  scope: string;
  providerAccountId: string;
};

/**
 * Look up the GitHub OAuth Account row written by NextAuth's PrismaAdapter
 * for the given user. Returns null if the user has not signed in with
 * GitHub or the token has been revoked from our side.
 */
export async function getGithubAccount(userId: string): Promise<GithubAccount | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true, scope: true, providerAccountId: true },
  });
  if (!account?.access_token) return null;
  return {
    accessToken: account.access_token,
    scope: account.scope ?? "",
    providerAccountId: account.providerAccountId,
  };
}
