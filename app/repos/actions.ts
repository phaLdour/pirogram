"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret, generateSecret, secretHint } from "@/lib/webhook/secret";

export type CreateRepoResult =
  | { ok: true; id: string; fullName: string; secret: string }
  | { ok: false; error: string };

const FULL_NAME_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export async function createRepo(formData: FormData): Promise<CreateRepoResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const rawFullName = formData.get("fullName");
  const rawDisplay = formData.get("displayName");
  const fullName = typeof rawFullName === "string" ? rawFullName.trim() : "";
  const displayName =
    typeof rawDisplay === "string" && rawDisplay.trim() ? rawDisplay.trim() : null;
  if (!fullName) return { ok: false, error: "fullname-required" };
  if (!FULL_NAME_RE.test(fullName)) return { ok: false, error: "fullname-invalid" };

  const existing = await prisma.repo.findUnique({ where: { fullName } });
  if (existing && existing.revokedAt === null) {
    return { ok: false, error: "fullname-taken" };
  }

  const secret = generateSecret();
  const encryptedSecret = encryptSecret(secret);
  const hint = secretHint(secret);

  let repo;
  if (existing) {
    repo = await prisma.repo.update({
      where: { id: existing.id },
      data: { encryptedSecret, hint, displayName, revokedAt: null },
    });
  } else {
    repo = await prisma.repo.create({
      data: { fullName, displayName, encryptedSecret, hint },
    });
  }

  revalidatePath("/repos");
  return { ok: true, id: repo.id, fullName: repo.fullName, secret };
}

export async function revokeRepo(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await prisma.repo.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/repos");
}
