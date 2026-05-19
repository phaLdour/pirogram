"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret, generateSecret, secretHint } from "@/lib/webhook/secret";

export type CreateKeyResult =
  | { ok: true; id: string; name: string; secret: string }
  | { ok: false; error: string };

export async function createWebhookKey(formData: FormData): Promise<CreateKeyResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { ok: false, error: "name-required" };
  if (name.length > 80) return { ok: false, error: "name-too-long" };

  const secret = generateSecret();
  const encryptedSecret = encryptSecret(secret);
  const hint = secretHint(secret);

  const key = await prisma.webhookKey.create({
    data: { name, encryptedSecret, hint },
  });

  revalidatePath("/settings");
  return { ok: true, id: key.id, name: key.name, secret };
}

export async function revokeWebhookKey(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await prisma.webhookKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings");
}
