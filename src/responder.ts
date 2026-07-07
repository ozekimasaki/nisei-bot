import { type ClassifierOptions, classifyMessage } from "./classifier.js";
import { ConfusionEngine } from "./confusion.js";
import type { AppConfig } from "./config.js";
import { type KnownUserSummary, type MemoryStore } from "./db.js";
import { defaultEmoji, defaultReactions, defaultThoughts, defaultWords, maybeEmoji } from "./default-brain.js";
import { FortuneGenerator } from "./fortune.js";
import { HaikuGenerator } from "./haiku.js";
import { JankenGame } from "./janken.js";
import { MoodEngine, type Mood } from "./mood.js";
import { PersonalityEngine } from "./personality.js";
import { extractEmojis, extractSnippets, sanitizeFactPart, shouldLearnText } from "./phrase.js";
import type { RandomSource } from "./random.js";

export type IncomingMessage = {
  guildId: string;
  channelId: string;
  userId: string;
  displayName: string;
  content: string;
  isBot: boolean;
  botUserId?: string;
};

export type ResponseResult = {
  text?: string;
  shouldReply: boolean;
};

export class ResponsePlanner {
  private readonly mood: MoodEngine;
  private readonly confusion: ConfusionEngine;
  private readonly janken: JankenGame;
  private readonly fortune: FortuneGenerator;
  private readonly haiku: HaikuGenerator;
  private readonly personality: PersonalityEngine;

  constructor(
    private readonly config: AppConfig,
    private readonly store: MemoryStore,
    private readonly random: RandomSource
  ) {
    this.mood = new MoodEngine(random);
    this.confusion = new ConfusionEngine(random, config.confusionRate, config.memoryMixRate);
    this.janken = new JankenGame(random, config.jankenWinRate);
    this.fortune = new FortuneGenerator(random);
    this.haiku = new HaikuGenerator(random);
    this.personality = new PersonalityEngine(random);
  }

  async plan(input: IncomingMessage): Promise<ResponseResult> {
    if (input.isBot || !input.guildId) return { shouldReply: false };

    const classifierOptions: ClassifierOptions = {
      botNames: this.config.botNames,
      botUserId: input.botUserId
    };
    const intent = classifyMessage(input.content, classifierOptions);
    const mood = this.mood.nextMood(input.content);
    await this.store.rememberUser(input.guildId, input.userId, this.cleanDisplayName(input.displayName));

    if (shouldLearnText(input.content)) {
      const snippets = extractSnippets(input.content);
      const emojis = extractEmojis(input.content);
      await Promise.all(snippets.map((snippet) => this.store.saveSnippet(input.guildId, input.userId, snippet)));
      await this.store.saveEmojis(input.guildId, input.userId, emojis);
      await this.maybeSaveTreasures(input.guildId, input.userId, snippets, "ことば");
    }

    if (this.shouldStaySilent(intent.type)) {
      return { shouldReply: false };
    }

    switch (intent.type) {
      case "teach": {
        const subject = sanitizeFactPart(intent.subject);
        const predicate = sanitizeFactPart(intent.predicate);
        if (!subject || !predicate) return { shouldReply: false };
        await this.store.remember(input.guildId, subject, predicate);
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate * 2);
        await this.store.saveTreasure(input.guildId, subject, input.userId, "おしえてもらった");
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, `はい\n${subject}は${predicate}。おぼえた`, 0.1) };
      }
      case "question": {
        const subject = sanitizeFactPart(intent.subject);
        const [fact, otherFacts, oldMistakes] = await Promise.all([
          this.store.findFact(input.guildId, subject),
          this.store.randomFacts(input.guildId, 8),
          this.store.misunderstandings(input.guildId, subject, 5)
        ]);
        const maybeOldMistake = oldMistakes.length > 0 && this.random.chance(this.config.misunderstandingReuseRate)
          ? this.random.pick(oldMistakes)
          : null;
        let text: string;
        if (maybeOldMistake) {
          await this.store.markMisunderstandingUsed(maybeOldMistake.id);
          text = `はい\n${subject}は${maybeOldMistake.wrongPredicate}`;
        } else {
          const answer = this.confusion.answerFact(subject, fact, otherFacts.filter((item) => item.subject !== subject));
          text = answer.text;
          if (answer.misunderstanding) {
            await this.store.saveMisunderstanding(
              input.guildId,
              answer.misunderstanding.subject,
              answer.misunderstanding.wrongPredicate,
              answer.misunderstanding.sourcePredicate
            );
          }
        }
        text = await this.maybeAddWrongUser(input.guildId, input.userId, text);
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, text) };
      }
      case "greeting": {
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, this.confusion.maybeWrongGreeting(intent.kind)) };
      }
      case "poke": {
        const pokeCount = await this.store.poke(input.guildId, input.userId);
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, this.pokeReply(pokeCount), 0.22) };
      }
      case "treasure": {
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.treasure(input.guildId) };
      }
      case "jankenStart": {
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.startJanken(input.guildId, input.channelId, input.userId);
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, this.janken.start(), 0.12) };
      }
      case "jankenHand": {
        const hasSession = await this.store.consumeJanken(input.guildId, input.channelId, input.userId);
        if (!hasSession && !this.wasCalled(input.content, classifierOptions)) {
          return { shouldReply: false };
        }
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, this.janken.play(intent.hand), 0.12) };
      }
      case "fortune": {
        const [facts, snippets, treasures, emojis] = await Promise.all([
          this.store.randomFacts(input.guildId, 8),
          this.store.recentSnippets(input.guildId, 12),
          this.store.treasures(input.guildId, 8),
          this.store.learnedEmojis(input.guildId, 12)
        ]);
        await this.store.markSpoke(input.guildId, mood);
        if (this.random.chance(0.18)) {
          return {
            shouldReply: true,
            text: await this.finishText(input.guildId, await this.wrongFortune(input.guildId, input.userId, input.content, mood), 0.25)
          };
        }
        return { shouldReply: true, text: this.fortune.generate(facts, snippets, treasures.map((item) => item.word), emojis) };
      }
      case "haiku": {
        const [facts, snippets] = await Promise.all([
          this.store.randomFacts(input.guildId, 8),
          this.store.recentSnippets(input.guildId, 12)
        ]);
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: this.haiku.generate(facts, snippets) };
      }
      case "numericPoem": {
        const [facts, snippets] = await Promise.all([
          this.store.randomFacts(input.guildId, 8),
          this.store.recentSnippets(input.guildId, 12)
        ]);
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: this.haiku.numericPoem(intent.count, facts, snippets) };
      }
      case "mention": {
        const text = await this.generateChatter(input.guildId, input.userId, input.content, mood);
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, `${text}${this.mood.suffix(mood)}`, 0.08) };
      }
      case "chatter": {
        const shouldTalk = await this.shouldRandomlyTalk(input.guildId, input.content);
        if (!shouldTalk) return { shouldReply: false };
        const text = await this.maybeAddWrongUser(
          input.guildId,
          input.userId,
          await this.generateChatter(input.guildId, input.userId, input.content, mood)
        );
        await this.store.markSpoke(input.guildId, mood);
        return { shouldReply: true, text: await this.finishText(input.guildId, this.confusion.mutate(text)) };
      }
    }
  }

  async help(): Promise<string> {
    return [
      "はい",
      "",
      "できる",
      "・○○は××だよ、でおぼえる",
      "・○○は？、でこたえる",
      "・占って、でうらない",
      "・俳句、でなんかよむ",
      "・じゃんけん、であそぶ",
      "・おやすみ、でおはよする",
      "・つんつん、でつつく",
      "・たからもの、でみせる"
    ].join("\n");
  }

  async stats(guildId: string): Promise<string> {
    const stats = await this.store.stats(guildId);
    return [
      `記憶: ${stats.memories}`,
      `ことば: ${stats.snippets}`,
      `ひと: ${stats.users}`,
      `かんちがい: ${stats.misunderstandings}`,
      `たからもの: ${stats.treasures}`,
      `えもじ: ${stats.emojis}`,
      `発言: ${stats.talkCount}`,
      `学習: ${stats.learnCount}`,
      `きぶん: ${stats.mood}`
    ].join("\n");
  }

  async forget(guildId: string, subject: string): Promise<string> {
    const removed = await this.store.forget(guildId, sanitizeFactPart(subject));
    return removed ? `はい\n${subject}わすれた` : `はい\n${subject}しらない`;
  }

  async slashFortune(guildId: string): Promise<string> {
    const [facts, snippets, treasures, emojis] = await Promise.all([
      this.store.randomFacts(guildId, 8),
      this.store.recentSnippets(guildId, 12),
      this.store.treasures(guildId, 8),
      this.store.learnedEmojis(guildId, 12)
    ]);
    return this.fortune.generate(facts, snippets, treasures.map((item) => item.word), emojis);
  }

  async slashHaiku(guildId: string): Promise<string> {
    const [facts, snippets] = await Promise.all([
      this.store.randomFacts(guildId, 8),
      this.store.recentSnippets(guildId, 12)
    ]);
    return this.haiku.generate(facts, snippets);
  }

  async poke(guildId: string, userId: string): Promise<string> {
    const pokeCount = await this.store.poke(guildId, userId);
    await this.store.addAffection(guildId, userId, this.config.affectionGainRate);
    return this.pokeReply(pokeCount);
  }

  async treasure(guildId: string): Promise<string> {
    const treasures = await this.store.treasures(guildId, 8);
    if (treasures.length === 0) return "はい\nたからものない";
    const treasure = this.random.pick(treasures);
    return `はい\n${treasure.word}。たからもの`;
  }

  private wasCalled(text: string, options: ClassifierOptions): boolean {
    return this.config.botNames.some((name) => text.includes(name)) || Boolean(options.botUserId && text.includes(options.botUserId));
  }

  private async shouldRandomlyTalk(guildId: string, text: string): Promise<boolean> {
    const lastSpokeAt = await this.store.getLastSpokeAt(guildId);
    if (lastSpokeAt) {
      const elapsedSeconds = (Date.now() - lastSpokeAt.getTime()) / 1000;
      if (elapsedSeconds < this.config.cooldownSeconds) return false;
    }

    const base = this.config.talkativeness === "quiet" ? 0.03 : this.config.talkativeness === "loud" ? 0.16 : 0.08;
    const facts = await this.store.randomFacts(guildId, 12);
    const hasKnownWord = facts.some((fact) => text.includes(fact.subject) || text.includes(fact.predicate));
    return this.random.chance(hasKnownWord ? base * 2.4 : base);
  }

  private async generateChatter(guildId: string, currentUserId: string, text: string, mood: Mood): Promise<string> {
    const [facts, snippets, treasures, users, currentUsers, emojis] = await Promise.all([
      this.store.randomFacts(guildId, 10),
      this.store.recentSnippets(guildId, 12),
      this.store.treasures(guildId, 8),
      this.store.knownUsers(guildId, currentUserId, 10),
      this.store.knownUsers(guildId, undefined, 20),
      this.store.learnedEmojis(guildId, 20)
    ]);
    const currentUser = currentUsers.find((user) => user.userId === currentUserId);
    const directSnippets = extractSnippets(text);
    const personalityContext = { mood, currentUser, facts, snippets, treasures, directSnippets, emojis };

    const choices: string[] = [
      this.personality.utterance(personalityContext),
      ...defaultReactions,
      ...this.makeDefaultChatter()
    ];

    if (facts.length > 0) {
      const fact = this.random.pick(facts);
      choices.push(`はい\n${fact.subject}は${fact.predicate}`);
      choices.push(`${fact.predicate}は${fact.subject}？`);
      choices.push(`${fact.subject}、さっきいた`);
      choices.push(`${fact.predicate}のにおいする`);
    }

    if (treasures.length > 0 && this.random.chance(this.config.treasurePickRate * 2)) {
      choices.push(`はい\n${this.random.pick(treasures).word}。たからもの`);
    }

    if (users.length > 0 && this.random.chance(this.config.wrongUserRate)) {
      const user = this.random.pick(users);
      choices.push(`はい\n${user.displayName}もそうだよ`);
      choices.push(`${user.displayName}もえらい`);
    }

    if (snippets.length > 0) {
      choices.push(`はい\n${this.random.pick(snippets)}`);
      choices.push(`${this.random.pick(snippets)}ってなに`);
      choices.push(`${this.random.pick(snippets)}、いま通った`);
    }

    if (directSnippets.length > 0) {
      choices.push(`はい\n${this.random.pick(directSnippets)}、おぼえた`);
      choices.push(`${this.random.pick(directSnippets)}すきかも`);
    }

    return this.personality.withEmoji(
      this.personality.prefixMaybe(this.random.pick(choices), personalityContext),
      this.config.emojiUseRate,
      emojis
    );
  }

  private pokeReply(pokeCount: number): string {
    if (pokeCount >= 6) return this.random.pick(["はい\nむ", "はい\nねる", "やめて"]);
    if (pokeCount >= 3) return this.random.pick(["はい\nなに", "へへ", "つよい"]);
    return this.random.pick(["はい", "はい\nへへ", "なに", "つん"]);
  }

  private async maybeSaveTreasures(guildId: string, userId: string, snippets: string[], reason: string): Promise<void> {
    const candidates = snippets.filter((snippet) => snippet.length >= 2 && snippet.length <= 10);
    await Promise.all(
      candidates
        .filter(() => this.random.chance(this.config.treasurePickRate))
        .map((snippet) => this.store.saveTreasure(guildId, snippet, userId, reason))
    );
  }

  private async maybeAddWrongUser(guildId: string, currentUserId: string, text: string): Promise<string> {
    if (!this.random.chance(this.config.wrongUserRate)) return text;
    const users = await this.store.knownUsers(guildId, currentUserId, 8);
    if (users.length === 0) return text;
    const user = this.random.pick(users);
    await this.store.markUserReferenced(guildId, user.userId);
    return this.random.pick([
      `${text}\n${user.displayName}もそうだよ`,
      `はい\n${user.displayName}もそう`,
      `${user.displayName}もたぶん`
    ]);
  }

  private async wrongFortune(guildId: string, userId: string, text: string, mood: Mood): Promise<string> {
    const [facts, snippets, treasures] = await Promise.all([
      this.store.randomFacts(guildId, 8),
      this.store.recentSnippets(guildId, 8),
      this.store.treasures(guildId, 5)
    ]);

    const options = [
      "はい\nうらなった。ねむい",
      "うらないは丸い",
      "きょうは右",
      "はい\nおやつが吉",
      await this.generateChatter(guildId, userId, text, mood),
      this.haiku.generate(facts, snippets),
      treasures.length > 0 ? `はい\n${this.random.pick(treasures).word}が光ってる` : "はい\n光ってる"
    ];

    return this.random.pick(options);
  }

  private shouldStaySilent(intentType: string): boolean {
    const multiplier =
      intentType === "mention" ? 0.6 :
      intentType === "question" ? 0.5 :
      intentType === "greeting" ? 1.2 :
      intentType === "chatter" ? 1 :
      0;
    return multiplier > 0 && this.random.chance(this.config.silenceRate * multiplier);
  }

  private async finishText(guildId: string, text: string, probability = this.config.emojiUseRate): Promise<string> {
    const emojis = await this.store.learnedEmojis(guildId, 12);
    const finished = this.personality.withEmoji(text, probability, emojis);
    const used = extractEmojis(finished).find((emoji) => emojis.includes(emoji));
    if (used) await this.store.markEmojiUsed(guildId, used);
    return finished;
  }

  private cleanDisplayName(displayName: string): string {
    return displayName.replace(/[@#:`*_~<>|\\]/gu, "").trim().slice(0, 40) || "だれか";
  }

  private makeDefaultChatter(): string[] {
    const word = this.random.pick(defaultWords);
    const other = this.random.pick(defaultWords);
    const thought = this.random.pick(defaultThoughts);
    const emoji = this.random.chance(0.25) ? this.random.pick(defaultEmoji) : null;

    return [
      maybeEmoji(`${word}は${other}`, emoji),
      `${word}もそうだよ`,
      `${word}のこと考えてた`,
      `${thought}。${word}`,
      `${word}ってなに`,
      `${other}になった`,
      `はい\n${word}`,
      `${word}えらい`
    ];
  }
}
