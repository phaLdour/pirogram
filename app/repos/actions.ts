"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret, generateSecret, secretHint } from "@/lib/webhook/secret";
import { log } from "@/lib/log";
import { getGithubAccount } from "@/lib/github-token";
import {
  GitHubApiError,
  deleteRepoWebhook,
  hasRequiredScopes,
  installRepoWebhook,
} from "@/lib/github";

export type BindResult =
  | {
      ok: true;
      id: string;
      fullName: string;
      secret: string;
      autoInstalled: boolean;
      alreadyExisted: boolean;
    }
  | { ok: false; error: string };

const FULL_NAME_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

async function payloadUrl(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/api/webhook/github`;
}

async function generateRepoSecret(): Promise<
  { ok: true; secret: string; encryptedSecret: string; hint: string } | { ok: false; error: string }
> {
  const secret = generateSecret();
  try {
    return {
      ok: true,
      secret,
      encryptedSecret: encryptSecret(secret),
      hint: secretHint(secret),
    };
  } catch (err) {
    log.error("repos.encryption-misconfigured", err);
    return { ok: false, error: "encryption-misconfigured" };
  }
}

/**
 * Bind a repo with auto-installed GitHub webhook.
 * Requires the signed-in user to have `repo + admin:repo_hook` scope.
 */
export async function bindRepo(formData: FormData): Promise<BindResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const rawFullName = formData.get("fullName");
  const fullName = typeof rawFullName === "string" ? rawFullName.trim() : "";
  if (!fullName || !FULL_NAME_RE.test(fullName)) {
    return { ok: false, error: "fullname-invalid" };
  }

  const account = await getGithubAccount(session.user.id);
  if (!account) return { ok: false, error: "no-github-account" };
  if (!hasRequiredScopes(account.scope)) {
    return { ok: false, error: "scope-insufficient" };
  }

  const secretBundle = await generateRepoSecret();
  if (!secretBundle.ok) return secretBundle;

  const url = await payloadUrl();
  let hookId: number;
  let alreadyExisted = false;
  try {
    const result = await installRepoWebhook(
      account.accessToken,
      fullName,
      url,
      secretBundle.secret,
    );
    hookId = result.id;
    alreadyExisted = result.alreadyExisted;
  } catch (err) {
    const kind = err instanceof GitHubApiError ? err.kind : "unknown";
    log.warn("repos.install-failed", { fullName, kind });
    return { ok: false, error: `github-${kind}` };
  }

  const repo = await prisma.repo.upsert({
    where: { fullName },
    update: {
      encryptedSecret: secretBundle.encryptedSecret,
      hint: secretBundle.hint,
      githubHookId: hookId,
      installedBy: session.user.id,
      revokedAt: null,
    },
    create: {
      fullName,
      encryptedSecret: secretBundle.encryptedSecret,
      hint: secretBundle.hint,
      githubHookId: hookId,
      installedBy: session.user.id,
    },
  });

  log.info("repos.bound", { repoId: repo.id, fullName, alreadyExisted });
  revalidatePath("/repos");
  return {
    ok: true,
    id: repo.id,
    fullName: repo.fullName,
    secret: secretBundle.secret,
    autoInstalled: true,
    alreadyExisted,
  };
}

export type UnbindResult = { ok: true } | { ok: false; error: string };

export async function unbindRepo(formData: FormData): Promise<UnbindResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { ok: false, error: "id-required" };

  const repo = await prisma.repo.findUnique({ where: { id } });
  if (!repo) return { ok: false, error: "not-found" };

  if (repo.githubHookId) {
    const account = await getGithubAccount(session.user.id);
    if (account && hasRequiredScopes(account.scope)) {
      try {
        await deleteRepoWebhook(account.accessToken, repo.fullName, repo.githubHookId);
      } catch (err) {
        const kind = err instanceof GitHubApiError ? err.kind : "unknown";
        log.warn("repos.delete-hook-failed", { repoId: repo.id, kind });
        // Continue: even if GitHub-side delete fails, mark revoked locally.
      }
    }
  }

  await prisma.repo.update({
    where: { id: repo.id },
    data: { revokedAt: new Date() },
  });
  log.info("repos.unbound", { repoId: repo.id, fullName: repo.fullName });
  revalidatePath("/repos");
  return { ok: true };
}

// Void-returning wrapper for `<form action>` usage in server components.
export async function unbindRepoForm(formData: FormData): Promise<void> {
  await unbindRepo(formData);
}

/**
 * Manual fallback: bind a repo without touching the GitHub API. The user
 * pastes the returned secret into GitHub's webhook UI themselves.
 */
export async function bindManually(formData: FormData): Promise<BindResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const rawFullName = formData.get("fullName");
  const rawDisplay = formData.get("displayName");
  const fullName = typeof rawFullName === "string" ? rawFullName.trim() : "";
  const displayName =
    typeof rawDisplay === "string" && rawDisplay.trim() ? rawDisplay.trim() : null;
  if (!fullName || !FULL_NAME_RE.test(fullName)) {
    return { ok: false, error: "fullname-invalid" };
  }

  const secretBundle = await generateRepoSecret();
  if (!secretBundle.ok) return secretBundle;

  const repo = await prisma.repo.upsert({
    where: { fullName },
    update: {
      encryptedSecret: secretBundle.encryptedSecret,
      hint: secretBundle.hint,
      displayName,
      githubHookId: null,
      installedBy: session.user.id,
      revokedAt: null,
    },
    create: {
      fullName,
      displayName,
      encryptedSecret: secretBundle.encryptedSecret,
      hint: secretBundle.hint,
      installedBy: session.user.id,
    },
  });

  log.info("repos.bound-manually", { repoId: repo.id, fullName });
  revalidatePath("/repos");
  return {
    ok: true,
    id: repo.id,
    fullName: repo.fullName,
    secret: secretBundle.secret,
    autoInstalled: false,
    alreadyExisted: false,
  };
}
