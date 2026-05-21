-- CreateEnum
CREATE TYPE "ClaudeRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "claudeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClaudeMessage" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "role" "ClaudeRole" NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "tokensCacheR" INTEGER,
    "tokensCacheW" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaudeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaudeMessage_sprintId_createdAt_idx" ON "ClaudeMessage"("sprintId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClaudeMessage" ADD CONSTRAINT "ClaudeMessage_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
