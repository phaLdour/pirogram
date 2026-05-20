-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "repoId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "repoId" TEXT;

-- CreateTable
CREATE TABLE "Repo" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT,
    "encryptedSecret" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Repo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repo_fullName_key" ON "Repo"("fullName");

-- CreateIndex
CREATE INDEX "Repo_revokedAt_idx" ON "Repo"("revokedAt");

-- CreateIndex
CREATE INDEX "Message_repoId_idx" ON "Message"("repoId");

-- CreateIndex
CREATE INDEX "Task_repoId_idx" ON "Task"("repoId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
