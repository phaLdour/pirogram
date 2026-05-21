-- CreateEnum
CREATE TYPE "SprintDriverStatus" AS ENUM ('NOT_DRIVING', 'REQUESTED', 'RUNNING', 'AWAITING_USER', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "driverIssueNumber" INTEGER,
ADD COLUMN     "driverIssueUrl" TEXT,
ADD COLUMN     "driverRepoId" TEXT,
ADD COLUMN     "driverStatus" "SprintDriverStatus" NOT NULL DEFAULT 'NOT_DRIVING';

-- CreateIndex
CREATE INDEX "Sprint_driverRepoId_driverIssueNumber_idx" ON "Sprint"("driverRepoId", "driverIssueNumber");

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_driverRepoId_fkey" FOREIGN KEY ("driverRepoId") REFERENCES "Repo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
