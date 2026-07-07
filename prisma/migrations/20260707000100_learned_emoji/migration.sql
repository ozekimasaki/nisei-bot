CREATE TABLE "LearnedEmoji" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "sourceUserId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "LearnedEmoji_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnedEmoji_guildId_emoji_key" ON "LearnedEmoji"("guildId", "emoji");
CREATE INDEX "LearnedEmoji_guildId_weight_idx" ON "LearnedEmoji"("guildId", "weight");
