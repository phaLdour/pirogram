"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bumpVersion, detectBump, formatChangelogMarkdown, type Bump } from "@/lib/sprints";

export type StartSprintResult = { ok: true; id: string } | { ok: false; error: string };

export async function startSprint(formData: FormData): Promise<StartSprintResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const name = String(formData.get("name") ?? "").trim();
  const goal = String(formData.get("goal") ?? "").trim();
  if (!name) return { ok: false, error: "name-required" };
  if (name.length > 80) return { ok: false, error: "name-too-long" };

  const existing = await prisma.sprint.findFirst({ where: { status: "ACTIVE" } });
  if (existing) return { ok: false, error: "active-sprint-exists" };

  const sprint = await prisma.sprint.create({
    data: { name, goal: goal || null, status: "ACTIVE" },
  });

  revalidatePath("/");
  revalidatePath("/sprints");
  return { ok: true, id: sprint.id };
}

export type EndSprintResult = { ok: true; id: string; version: string } | { ok: false; error: string };

function parseBump(raw: FormDataEntryValue | null): Bump | "auto" {
  const v = String(raw ?? "auto").toLowerCase();
  if (v === "major" || v === "minor" || v === "patch" || v === "auto") return v;
  return "auto";
}

export async function endSprint(formData: FormData): Promise<EndSprintResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const id = String(formData.get("id") ?? "");
  const bumpChoice = parseBump(formData.get("bump"));
  if (!id) return { ok: false, error: "id-required" };

  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) return { ok: false, error: "not-found" };
  if (sprint.status !== "ACTIVE") return { ok: false, error: "not-active" };

  const doneTasks = await prisma.task.findMany({
    where: { sprintId: id, status: "DONE" },
    orderBy: { completedAt: "asc" },
  });

  const lastVersionedSprint = await prisma.sprint.findFirst({
    where: { status: "COMPLETED", version: { not: null } },
    orderBy: { endedAt: "desc" },
  });

  const bump = detectBump(doneTasks, bumpChoice);
  const version = bumpVersion(lastVersionedSprint?.version ?? null, bump);
  const endedAt = new Date();
  const changelog = formatChangelogMarkdown(
    { name: sprint.name, version, startedAt: sprint.startedAt, endedAt },
    doneTasks,
  );

  await prisma.sprint.update({
    where: { id },
    data: { status: "COMPLETED", endedAt, version, changelog },
  });

  revalidatePath("/");
  revalidatePath("/sprints");
  revalidatePath(`/sprints/${id}`);
  return { ok: true, id, version };
}

export async function viewSprint(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  redirect(`/sprints/${id}`);
}

export type EnableClaudeResult = { ok: true } | { ok: false; error: string };

export async function enableClaudeOnSprint(formData: FormData): Promise<EnableClaudeResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "id-required" };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "anthropic-not-configured" };
  }

  await prisma.sprint.update({ where: { id }, data: { claudeEnabled: true } });
  revalidatePath(`/sprints/${id}`);
  return { ok: true };
}

export type ClaudeChatResult =
  | { ok: true; reply: string; tasksProposed: string[] }
  | { ok: false; error: string };

export async function claudeChat(formData: FormData): Promise<ClaudeChatResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };
  const id = String(formData.get("sprintId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!id) return { ok: false, error: "sprintId-required" };
  if (!message) return { ok: false, error: "message-required" };
  if (message.length > 8000) return { ok: false, error: "message-too-long" };

  const { driveSprintTurn } = await import("@/lib/claude-driver");
  const result = await driveSprintTurn(id, message);
  if (result.ok) revalidatePath(`/sprints/${id}`);
  return result;
}
