-- CreateTable
CREATE TABLE "QuietChannel" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuietChannel_pkey" PRIMARY KEY ("guildId","channelId")
);

-- CreateIndex
CREATE INDEX "QuietChannel_guildId_idx" ON "QuietChannel"("guildId");
