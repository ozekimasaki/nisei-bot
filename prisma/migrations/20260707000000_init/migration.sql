CREATE TABLE "GuildMemory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuildMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageSnippet" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageSnippet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuildState" (
    "guildId" TEXT NOT NULL,
    "mood" TEXT NOT NULL DEFAULT 'normal',
    "talkCount" INTEGER NOT NULL DEFAULT 0,
    "learnCount" INTEGER NOT NULL DEFAULT 0,
    "lastSpokeAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuildState_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "JankenSession" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JankenSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnownUser" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "affection" INTEGER NOT NULL DEFAULT 0,
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReferencedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnownUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Misunderstanding" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "wrongPredicate" TEXT NOT NULL,
    "sourcePredicate" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "Misunderstanding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreasureWord" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "sourceUserId" TEXT,
    "reason" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "TreasureWord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PokeState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pokeCount" INTEGER NOT NULL DEFAULT 0,
    "lastPokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PokeState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuildMemory_guildId_subject_key" ON "GuildMemory"("guildId", "subject");
CREATE INDEX "GuildMemory_guildId_idx" ON "GuildMemory"("guildId");
CREATE INDEX "MessageSnippet_guildId_createdAt_idx" ON "MessageSnippet"("guildId", "createdAt");
CREATE UNIQUE INDEX "JankenSession_guildId_channelId_userId_key" ON "JankenSession"("guildId", "channelId", "userId");
CREATE INDEX "JankenSession_guildId_channelId_idx" ON "JankenSession"("guildId", "channelId");
CREATE UNIQUE INDEX "KnownUser_guildId_userId_key" ON "KnownUser"("guildId", "userId");
CREATE INDEX "KnownUser_guildId_lastSeenAt_idx" ON "KnownUser"("guildId", "lastSeenAt");
CREATE INDEX "Misunderstanding_guildId_subject_idx" ON "Misunderstanding"("guildId", "subject");
CREATE UNIQUE INDEX "TreasureWord_guildId_word_key" ON "TreasureWord"("guildId", "word");
CREATE INDEX "TreasureWord_guildId_weight_idx" ON "TreasureWord"("guildId", "weight");
CREATE UNIQUE INDEX "PokeState_guildId_userId_key" ON "PokeState"("guildId", "userId");
