-- CreateTable
CREATE TABLE "HandledMessage" (
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandledMessage_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE INDEX "HandledMessage_createdAt_idx" ON "HandledMessage"("createdAt");
