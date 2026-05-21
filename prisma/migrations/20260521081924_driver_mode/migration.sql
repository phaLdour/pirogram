-- CreateEnum
CREATE TYPE "SprintDriverMode" AS ENUM ('HANDOFF', 'AUTO_ACTION');

-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "driverMode" "SprintDriverMode";
