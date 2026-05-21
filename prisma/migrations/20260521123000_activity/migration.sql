-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "currentActivityId" TEXT;

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "toolUseId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "parentId" TEXT,
    "toolName" TEXT NOT NULL,
    "subagentType" TEXT,
    "description" TEXT,
    "sessionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "ok" BOOLEAN,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_toolUseId_key" ON "Activity"("toolUseId");

-- CreateIndex
CREATE INDEX "Activity_agentId_endedAt_idx" ON "Activity"("agentId", "endedAt");

-- CreateIndex
CREATE INDEX "Activity_parentId_idx" ON "Activity"("parentId");

-- CreateIndex
CREATE INDEX "Activity_startedAt_idx" ON "Activity"("startedAt");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
