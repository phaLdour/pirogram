/*
  Warnings:

  - You are about to drop the column `hashedSecret` on the `WebhookKey` table. All the data in the column will be lost.
  - Added the required column `encryptedSecret` to the `WebhookKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hint` to the `WebhookKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WebhookKey" DROP COLUMN "hashedSecret",
ADD COLUMN     "encryptedSecret" TEXT NOT NULL,
ADD COLUMN     "hint" TEXT NOT NULL,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WebhookKey_revokedAt_idx" ON "WebhookKey"("revokedAt");
