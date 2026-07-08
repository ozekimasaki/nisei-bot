import { Prisma, PrismaClient } from "@prisma/client";
import { MAX_MEMORY_WORD_LENGTH } from "./phrase.js";

export const prisma = new PrismaClient();

export type MemoryFact = {
  subject: string;
  predicate: string;
  confidence: number;
};

export type KnownUserSummary = {
  userId: string;
  displayName: string;
  affection: number;
};

export type MisunderstandingSummary = {
  id: string;
  subject: string;
  wrongPredicate: string;
  sourcePredicate: string | null;
  weight: number;
};

export type TreasureSummary = {
  word: string;
  reason: string;
  weight: number;
};

export class MemoryStore {
  constructor(private readonly db: PrismaClient) {}

  async remember(guildId: string, subject: string, predicate: string): Promise<number> {
    const normalizedSubject = subject.slice(0, MAX_MEMORY_WORD_LENGTH);
    const normalizedPredicate = predicate.slice(0, MAX_MEMORY_WORD_LENGTH);
    const existing = await this.db.guildMemory.findUnique({
      where: { guildId_subject: { guildId, subject: normalizedSubject } }
    });
    const confidence = existing ? existing.confidence + 1 : 1;

    await this.db.$transaction([
      this.db.guildMemory.upsert({
        where: { guildId_subject: { guildId, subject: normalizedSubject } },
        update: { predicate: normalizedPredicate, confidence },
        create: { guildId, subject: normalizedSubject, predicate: normalizedPredicate, confidence: 1 }
      }),
      this.db.misunderstanding.updateMany({
        where: { guildId, subject: normalizedSubject },
        data: { weight: { decrement: 0.25 } }
      }),
      this.db.guildState.upsert({
        where: { guildId },
        update: { learnCount: { increment: 1 } },
        create: { guildId, learnCount: 1 }
      })
    ]);

    return confidence;
  }

  async forget(guildId: string, subject: string): Promise<boolean> {
    const result = await this.db.guildMemory.deleteMany({
      where: { guildId, subject }
    });
    return result.count > 0;
  }

  async getGuildMood(guildId: string): Promise<string | null> {
    const state = await this.db.guildState.findUnique({ where: { guildId } });
    return state?.mood ?? null;
  }

  async getUser(guildId: string, userId: string): Promise<KnownUserSummary | null> {
    const user = await this.db.knownUser.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });
    if (!user) return null;
    return {
      userId: user.userId,
      displayName: user.displayName,
      affection: user.affection
    };
  }

  async topMisunderstandings(guildId: string, limit = 3): Promise<MisunderstandingSummary[]> {
    const rows = await this.db.misunderstanding.findMany({
      where: { guildId, weight: { gt: 0.1 } },
      orderBy: [{ weight: "desc" }, { createdAt: "desc" }],
      take: limit
    });
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      wrongPredicate: row.wrongPredicate,
      sourcePredicate: row.sourcePredicate,
      weight: row.weight
    }));
  }

  async albumTreasures(guildId: string, limit = 5): Promise<TreasureSummary[]> {
    return this.treasures(guildId, limit);
  }

  async corruptMemory(guildId: string, subject: string, wrongPredicate: string): Promise<void> {
    const normalizedSubject = subject.slice(0, MAX_MEMORY_WORD_LENGTH);
    const normalizedPredicate = wrongPredicate.slice(0, MAX_MEMORY_WORD_LENGTH);
    await this.db.guildMemory.upsert({
      where: { guildId_subject: { guildId, subject: normalizedSubject } },
      update: { predicate: normalizedPredicate, confidence: 1 },
      create: { guildId, subject: normalizedSubject, predicate: normalizedPredicate, confidence: 1 }
    });
  }

  async findFact(guildId: string, subject: string): Promise<MemoryFact | null> {
    const fact = await this.db.guildMemory.findUnique({
      where: { guildId_subject: { guildId, subject } }
    });
    if (!fact) return null;
    return {
      subject: fact.subject,
      predicate: fact.predicate,
      confidence: fact.confidence
    };
  }

  async randomFacts(guildId: string, limit: number): Promise<MemoryFact[]> {
    const facts = await this.db.guildMemory.findMany({
      where: { guildId },
      orderBy: { updatedAt: "desc" },
      take: Math.max(limit * 3, limit)
    });
    return facts.slice(0, limit).map((fact) => ({
      subject: fact.subject,
      predicate: fact.predicate,
      confidence: fact.confidence
    }));
  }

  async saveSnippet(guildId: string, userId: string, text: string): Promise<void> {
    const word = text.trim().slice(0, MAX_MEMORY_WORD_LENGTH);
    if (word.length < 2) return;
    await this.db.messageSnippet.create({
      data: {
        guildId,
        userId,
        text: word,
        weight: 1
      }
    });
  }

  async saveEmojis(guildId: string, userId: string, emojis: string[]): Promise<void> {
    const unique = [...new Set(emojis)].filter((emoji) => emoji.length <= 80);
    await Promise.all(
      unique.map((emoji) =>
        this.db.learnedEmoji.upsert({
          where: { guildId_emoji: { guildId, emoji } },
          update: {
            weight: { increment: 0.2 },
            sourceUserId: userId,
            lastSeenAt: new Date()
          },
          create: {
            guildId,
            emoji,
            sourceUserId: userId,
            weight: 1,
            lastSeenAt: new Date()
          }
        })
      )
    );
  }

  async learnedEmojis(guildId: string, limit = 16): Promise<string[]> {
    const rows = await this.db.learnedEmoji.findMany({
      where: { guildId },
      orderBy: [{ weight: "desc" }, { lastSeenAt: "desc" }],
      take: limit
    });
    return rows.map((row) => row.emoji);
  }

  async markEmojiUsed(guildId: string, emoji: string): Promise<void> {
    await this.db.learnedEmoji.updateMany({
      where: { guildId, emoji },
      data: {
        lastUsedAt: new Date(),
        weight: { increment: 0.05 }
      }
    });
  }

  async rememberUser(guildId: string, userId: string, displayName: string): Promise<void> {
    await this.db.knownUser.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: {
        displayName: displayName.slice(0, 40),
        seenCount: { increment: 1 },
        lastSeenAt: new Date()
      },
      create: {
        guildId,
        userId,
        displayName: displayName.slice(0, 40),
        seenCount: 1,
        lastSeenAt: new Date()
      }
    });
  }

  async addAffection(guildId: string, userId: string, amount: number): Promise<void> {
    await this.db.knownUser.updateMany({
      where: { guildId, userId },
      data: { affection: { increment: amount } }
    });
  }

  async knownUsers(guildId: string, excludeUserId?: string, limit = 12): Promise<KnownUserSummary[]> {
    const users = await this.db.knownUser.findMany({
      where: {
        guildId,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {})
      },
      orderBy: [{ lastReferencedAt: "asc" }, { lastSeenAt: "desc" }],
      take: limit
    });
    return users.map((user) => ({
      userId: user.userId,
      displayName: user.displayName,
      affection: user.affection
    }));
  }

  async markUserReferenced(guildId: string, userId: string): Promise<void> {
    await this.db.knownUser.updateMany({
      where: { guildId, userId },
      data: { lastReferencedAt: new Date() }
    });
  }

  async saveMisunderstanding(
    guildId: string,
    subject: string,
    wrongPredicate: string,
    sourcePredicate?: string
  ): Promise<void> {
    if (subject === wrongPredicate) return;
    await this.db.misunderstanding.create({
      data: {
        guildId,
        subject: subject.slice(0, MAX_MEMORY_WORD_LENGTH),
        wrongPredicate: wrongPredicate.slice(0, MAX_MEMORY_WORD_LENGTH),
        sourcePredicate: sourcePredicate?.slice(0, MAX_MEMORY_WORD_LENGTH),
        weight: 1
      }
    });
  }

  async misunderstandings(guildId: string, subject: string, limit = 5): Promise<MisunderstandingSummary[]> {
    const rows = await this.db.misunderstanding.findMany({
      where: { guildId, subject, weight: { gt: 0.1 } },
      orderBy: [{ weight: "desc" }, { createdAt: "desc" }],
      take: limit
    });
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      wrongPredicate: row.wrongPredicate,
      sourcePredicate: row.sourcePredicate,
      weight: row.weight
    }));
  }

  async markMisunderstandingUsed(id: string): Promise<void> {
    await this.db.misunderstanding.updateMany({
      where: { id },
      data: {
        lastUsedAt: new Date(),
        weight: { increment: 0.1 }
      }
    });
  }

  async saveTreasure(guildId: string, word: string, sourceUserId: string | null, reason: string): Promise<void> {
    const normalized = word.trim().slice(0, MAX_MEMORY_WORD_LENGTH);
    if (normalized.length < 2) return;
    await this.db.treasureWord.upsert({
      where: { guildId_word: { guildId, word: normalized } },
      update: {
        weight: { increment: 0.25 },
        reason,
        sourceUserId,
        lastUsedAt: new Date()
      },
      create: {
        guildId,
        word: normalized,
        sourceUserId,
        reason,
        weight: 1
      }
    });
  }

  async treasures(guildId: string, limit = 10): Promise<TreasureSummary[]> {
    const rows = await this.db.treasureWord.findMany({
      where: { guildId },
      orderBy: [{ weight: "desc" }, { createdAt: "desc" }],
      take: limit
    });
    return rows.map((row) => ({
      word: row.word,
      reason: row.reason,
      weight: row.weight
    }));
  }

  async knownWordHints(guildId: string, limit = 40): Promise<string[]> {
    const [memories, treasures] = await Promise.all([
      this.db.guildMemory.findMany({
        where: { guildId },
        select: { subject: true, predicate: true },
        orderBy: { updatedAt: "desc" },
        take: limit * 2
      }),
      this.db.treasureWord.findMany({
        where: { guildId },
        select: { word: true },
        orderBy: { weight: "desc" },
        take: limit
      })
    ]);

    return [...new Set([...memories.flatMap((memory) => [memory.subject, memory.predicate]), ...treasures.map((treasure) => treasure.word)])]
      .filter((word) => word.length >= 2 && word.length <= MAX_MEMORY_WORD_LENGTH)
      .slice(0, limit);
  }

  async poke(guildId: string, userId: string): Promise<number> {
    const existing = await this.db.pokeState.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });
    const now = new Date();
    const recent = existing && now.getTime() - existing.lastPokedAt.getTime() < 10 * 60 * 1000;
    const pokeCount = recent ? existing.pokeCount + 1 : 1;

    await this.db.pokeState.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { pokeCount, lastPokedAt: now },
      create: { guildId, userId, pokeCount, lastPokedAt: now }
    });
    return pokeCount;
  }

  async recentSnippets(guildId: string, limit: number): Promise<string[]> {
    const snippets = await this.db.messageSnippet.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return snippets.map((snippet) => snippet.text);
  }

  async getGuildTalkLevel(guildId: string): Promise<number | null> {
    const state = await this.db.guildState.findUnique({ where: { guildId } });
    return state?.talkLevel ?? null;
  }

  async setGuildTalkLevel(guildId: string, level: number): Promise<void> {
    await this.db.guildState.upsert({
      where: { guildId },
      update: { talkLevel: level },
      create: { guildId, talkLevel: level }
    });
  }

  async clearGuildTalkLevel(guildId: string): Promise<void> {
    await this.db.guildState.updateMany({
      where: { guildId },
      data: { talkLevel: null }
    });
  }

  async getLastSpokeAt(guildId: string): Promise<Date | null> {
    const state = await this.db.guildState.findUnique({ where: { guildId } });
    return state?.lastSpokeAt ?? null;
  }

  async markSpoke(guildId: string, mood: string): Promise<void> {
    await this.db.guildState.upsert({
      where: { guildId },
      update: {
        mood,
        talkCount: { increment: 1 },
        lastSpokeAt: new Date()
      },
      create: {
        guildId,
        mood,
        talkCount: 1,
        lastSpokeAt: new Date()
      }
    });
  }

  async stats(guildId: string): Promise<{
    memories: number;
    snippets: number;
    users: number;
    misunderstandings: number;
    treasures: number;
    emojis: number;
    talkCount: number;
    learnCount: number;
    mood: string;
    talkLevel: number | null;
  }> {
    const [memories, snippets, users, misunderstandings, treasures, emojis, state] = await Promise.all([
      this.db.guildMemory.count({ where: { guildId } }),
      this.db.messageSnippet.count({ where: { guildId } }),
      this.db.knownUser.count({ where: { guildId } }),
      this.db.misunderstanding.count({ where: { guildId, weight: { gt: 0.1 } } }),
      this.db.treasureWord.count({ where: { guildId } }),
      this.db.learnedEmoji.count({ where: { guildId } }),
      this.db.guildState.findUnique({ where: { guildId } })
    ]);
    return {
      memories,
      snippets,
      users,
      misunderstandings,
      treasures,
      emojis,
      talkCount: state?.talkCount ?? 0,
      learnCount: state?.learnCount ?? 0,
      mood: state?.mood ?? "normal",
      talkLevel: state?.talkLevel ?? null
    };
  }

  async startJanken(guildId: string, channelId: string, userId: string): Promise<void> {
    await this.db.jankenSession.upsert({
      where: { guildId_channelId_userId: { guildId, channelId, userId } },
      update: { startedAt: new Date(), winStreak: 0, loseStreak: 0 },
      create: { guildId, channelId, userId, winStreak: 0, loseStreak: 0 }
    });
  }

  async hasJankenSession(guildId: string, channelId: string, userId: string): Promise<boolean> {
    const session = await this.db.jankenSession.findUnique({
      where: { guildId_channelId_userId: { guildId, channelId, userId } }
    });
    return session !== null;
  }

  async getJankenStreak(
    guildId: string,
    channelId: string,
    userId: string
  ): Promise<{ winStreak: number; loseStreak: number }> {
    const session = await this.db.jankenSession.findUnique({
      where: { guildId_channelId_userId: { guildId, channelId, userId } }
    });
    if (!session) return { winStreak: 0, loseStreak: 0 };
    return { winStreak: session.winStreak, loseStreak: session.loseStreak };
  }

  async updateJankenStreak(
    guildId: string,
    channelId: string,
    userId: string,
    botWon: boolean
  ): Promise<{ winStreak: number; loseStreak: number }> {
    const session = await this.db.jankenSession.findUnique({
      where: { guildId_channelId_userId: { guildId, channelId, userId } }
    });
    if (!session) {
      await this.startJanken(guildId, channelId, userId);
      return { winStreak: 0, loseStreak: 0 };
    }

    const winStreak = botWon ? session.winStreak + 1 : 0;
    const loseStreak = botWon ? 0 : session.loseStreak + 1;
    await this.db.jankenSession.update({
      where: { guildId_channelId_userId: { guildId, channelId, userId } },
      data: { winStreak, loseStreak }
    });
    return { winStreak, loseStreak };
  }

  async tryClaimMessage(messageId: string): Promise<boolean> {
    try {
      await this.db.handledMessage.create({ data: { messageId } });
      void this.cleanupHandledMessages();
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) return false;
      throw error;
    }
  }

  async releaseMessage(messageId: string): Promise<void> {
    await this.db.handledMessage.deleteMany({ where: { messageId } });
  }

  async isQuietChannel(guildId: string, channelId: string): Promise<boolean> {
    const row = await this.db.quietChannel.findUnique({
      where: { guildId_channelId: { guildId, channelId } }
    });
    return row !== null;
  }

  async setQuietChannel(guildId: string, channelId: string): Promise<void> {
    await this.db.quietChannel.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      update: {},
      create: { guildId, channelId }
    });
  }

  async clearQuietChannel(guildId: string, channelId: string): Promise<void> {
    await this.db.quietChannel.deleteMany({ where: { guildId, channelId } });
  }

  private async cleanupHandledMessages(): Promise<void> {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    await this.db.handledMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
