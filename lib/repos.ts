import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/webhook/secret";

export type RepoWithSecret = {
  id: string;
  fullName: string;
  encryptedSecret: string;
  hint: string;
};

export async function getActiveRepoByFullName(
  fullName: string,
): Promise<RepoWithSecret | null> {
  const repo = await prisma.repo.findFirst({
    where: { fullName, revokedAt: null },
    select: { id: true, fullName: true, encryptedSecret: true, hint: true },
  });
  return repo;
}

export async function touchRepoLastEvent(repoId: string): Promise<void> {
  await prisma.repo
    .update({ where: { id: repoId }, data: { lastEventAt: new Date() } })
    .catch(() => {
      /* best-effort; do not fail the webhook ACK */
    });
}

export function decryptRepoSecret(encrypted: string): string {
  return decryptSecret(encrypted);
}
