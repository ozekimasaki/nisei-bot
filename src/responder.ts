import { memoryMixMultiplier, wrongUserRateBonus } from "./affection.js";
import { BotReplyTracker } from "./bot-context.js";
import { type ClassifierOptions, classifyMessage, isCalled } from "./classifier.js";
import { type ChannelActivityTracker } from "./channel-activity.js";
import {
  hasEmotionInText,
  hasRecentSnippetMatch,
  shouldInterject,
  type InterjectInput
} from "./chatter-engine.js";
import { ConfusionEngine } from "./confusion.js";
import type { AppConfig } from "./config.js";
import { type KnownUserSummary, type MemoryStore } from "./db.js";
import { defaultEmoji, defaultReactions, defaultThoughts, defaultWords, maybeEmoji } from "./default-brain.js";
import { FortuneGenerator } from "./fortune.js";
import { HaikuGenerator } from "./haiku.js";
import { JankenGame } from "./janken.js";
import { MoodEngine, parseMood, type Mood } from "./mood.js";
import { PersonalityEngine } from "./personality.js";
import { shouldBlockInQuietChannel } from "./quiet-channel.js";
import { resolveTalkLevel } from "./talk-level.js";
import { extractEmojis, extractSnippets, type NormalizeMemoryOptions, normalizeMemoryWord, shouldLearnText } from "./phrase.js";
import { buildMemoryQuiz, quizCaughtReply } from "./quiz.js";
import type { RandomSource } from "./random.js";
import { needsUnsolicitedChance } from "./unsolicited.js";
import { dailyMoodWord, dailySnack, seasonalHint } from "./seasonal.js";
import {
  confusedAboutSubject,
  emptyTreasureReply,
  formatFactAnswer,
  formatDeniedLearnReply,
  formatLearnedReply,
  withMaybeOpener,
  withQuestionOpener
} from "./utterance.js";
import { WikiCooldown } from "./wiki-cooldown.js";
import {
  fetchSearchTitlesForQuery,
  mangleWikiReply,
  pickSearchIndex,
  searchWikipediaAt
} from "./wikipedia.js";

export type IncomingMessage = {
  guildId: string;
  channelId: string;
  userId: string;
  displayName: string;
  content: string;
  isBot: boolean;
  botUserId?: string;
  attachments?: { image: boolean; gif: boolean };
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
  private readonly botReplies = new BotReplyTracker();
  private readonly wikiCooldown = new WikiCooldown();

  constructor(
    private readonly config: AppConfig,
    private readonly store: MemoryStore,
    private readonly random: RandomSource,
    private readonly channelActivity: ChannelActivityTracker
  ) {
    this.mood = new MoodEngine(random, config.moodPersistRate);
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

    let intent = classifyMessage(input.content, classifierOptions);
    if (
      input.attachments &&
      (input.attachments.image || input.attachments.gif) &&
      input.content.trim().length <= 8 &&
      intent.type === "chatter"
    ) {
      intent = { type: "attachment" };
    }

    const previousMood = parseMood(await this.store.getGuildMood(input.guildId));
    const mood = this.mood.nextMood(input.content, previousMood);
    await this.store.rememberUser(input.guildId, input.userId, this.cleanDisplayName(input.displayName));
    const memoryOptions = await this.buildMemoryOptions(input.guildId);

    if (shouldLearnText(input.content)) {
      const snippets = extractSnippets(input.content, memoryOptions)
        .map((snippet) => normalizeMemoryWord(snippet, memoryOptions))
        .filter((snippet): snippet is string => snippet !== null);
      const emojis = extractEmojis(input.content);
      await Promise.all(snippets.map((snippet) => this.store.saveSnippet(input.guildId, input.userId, snippet)));
      await this.store.saveEmojis(input.guildId, input.userId, emojis);
      await this.maybeSaveTreasures(input.guildId, input.userId, snippets, "ことば");
    }

    if (intent.type === "quietOn") {
      await this.store.setQuietChannel(input.guildId, input.channelId);
      await this.store.markSpoke(input.guildId, mood);
      return this.reply(input, "静かにする。呼んだら出る", mood);
    }
    if (intent.type === "quietOff") {
      await this.store.clearQuietChannel(input.guildId, input.channelId);
      await this.store.markSpoke(input.guildId, mood);
      return this.reply(input, "また出る", mood);
    }

    const called = isCalled(input.content, classifierOptions);
    if (
      (await this.store.isQuietChannel(input.guildId, input.channelId)) &&
      shouldBlockInQuietChannel(intent, called)
    ) {
      return { shouldReply: false };
    }

    const tsukkomi = this.tryTsukkomi(input, intent);
    if (tsukkomi) {
      await this.store.markSpoke(input.guildId, mood);
      return this.reply(input, await this.finishText(input.guildId, tsukkomi), mood);
    }
    if (intent.type === "correction" || intent.type === "doubt" || intent.type === "lieCall") {
      return { shouldReply: false };
    }

    if (this.shouldStaySilent(intent.type)) {
      return { shouldReply: false };
    }

    if (!called && needsUnsolicitedChance(intent.type)) {
      if (intent.type === "chatter") {
        const idle = await this.maybeIdleChatter(input.guildId, mood);
        if (idle) {
          this.channelActivity.markChattered(input.channelId);
          await this.store.markSpoke(input.guildId, mood);
          return this.reply(input, await this.finishText(input.guildId, idle), mood);
        }
      }
      const shouldTalk = await this.shouldRandomlyTalk(
        input.guildId,
        input.channelId,
        input.userId,
        input.content,
        mood
      );
      if (!shouldTalk) return { shouldReply: false };
    }

    switch (intent.type) {
      case "teach": {
        const subject = normalizeMemoryWord(intent.subject, { ...memoryOptions, preferDictionary: true });
        const predicate = normalizeMemoryWord(intent.predicate, memoryOptions);
        if (!subject || !predicate) return { shouldReply: false };
        const confidence = await this.store.remember(input.guildId, subject, predicate);
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate * 2);
        await this.store.saveTreasure(input.guildId, subject, input.userId, "おしえてもらった");
        await this.store.markSpoke(input.guildId, mood);
        const learned = formatLearnedReply(this.random, subject, predicate, mood, confidence);
        return this.reply(input, await this.finishText(input.guildId, learned, 0.15), mood, subject);
      }
      case "denyTeach": {
        const subject = normalizeMemoryWord(intent.subject, { ...memoryOptions, preferDictionary: true });
        const predicate = normalizeMemoryWord(intent.predicate, memoryOptions);
        if (!subject || !predicate) return { shouldReply: false };
        await this.store.saveMisunderstanding(input.guildId, subject, predicate);
        await this.store.corruptMemory(input.guildId, subject, predicate);
        await this.store.markSpoke(input.guildId, mood);
        const denied = formatDeniedLearnReply(this.random, subject, predicate, mood);
        return this.reply(input, await this.finishText(input.guildId, denied, 0.15), mood, subject);
      }
      case "question": {
        const subject = normalizeMemoryWord(intent.subject, memoryOptions) ?? intent.subject.trim().slice(0, 12);
        const text = await this.answerQuestion(input, subject, mood);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, text, mood, subject);
      }
      case "wikiSearch": {
        const text = await this.lookupWiki(input.guildId, intent.query, true);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, text, mood, intent.query);
      }
      case "greeting": {
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.markSpoke(input.guildId, mood);
        const greeting = this.confusion.maybeWrongGreeting(intent.kind, this.mood.greetingWrongBoost(mood));
        return this.reply(input, await this.finishText(input.guildId, greeting), mood);
      }
      case "poke": {
        const pokeCount = await this.store.poke(input.guildId, input.userId);
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.finishText(input.guildId, this.pokeReply(pokeCount), 0.22), mood);
      }
      case "treasure": {
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.treasure(input.guildId), mood);
      }
      case "kanchigai": {
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.kanchigaiAlbum(input.guildId), mood);
      }
      case "album": {
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.treasureAlbum(input.guildId), mood);
      }
      case "quiz": {
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.memoryQuiz(input.guildId), mood);
      }
      case "jankenStart": {
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.startJanken(input.guildId, input.channelId, input.userId);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.finishText(input.guildId, this.janken.start(), 0.12), mood);
      }
      case "jankenRematch": {
        const hasSession = await this.store.hasJankenSession(input.guildId, input.channelId, input.userId);
        if (!hasSession) return { shouldReply: false };
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.finishText(input.guildId, this.janken.rematch(), 0.12), mood);
      }
      case "jankenHand": {
        const hasSession = await this.store.hasJankenSession(input.guildId, input.channelId, input.userId);
        if (!hasSession && !this.wasCalled(input.content, classifierOptions)) {
          return { shouldReply: false };
        }
        if (!hasSession) {
          await this.store.startJanken(input.guildId, input.channelId, input.userId);
        }
        const currentStreak = await this.store.getJankenStreak(input.guildId, input.channelId, input.userId);
        const result = this.janken.play(intent.hand, currentStreak);
        await this.store.updateJankenStreak(input.guildId, input.channelId, input.userId, result.botWon);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.finishText(input.guildId, result.text, 0.12), mood);
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
          return this.reply(
            input,
            await this.finishText(input.guildId, await this.wrongFortune(input.guildId, input.userId, input.content, mood), 0.25),
            mood
          );
        }
        const seasonal = seasonalHint();
        const snack = dailySnack();
        const base = this.fortune.generate(facts, snippets, treasures.map((item) => item.word), emojis);
        const extra = seasonal ? `\n${seasonal}かも` : `\n${snack}かも`;
        return this.reply(input, `${base}${extra}`, mood);
      }
      case "haiku": {
        const [facts, snippets] = await Promise.all([
          this.store.randomFacts(input.guildId, 8),
          this.store.recentSnippets(input.guildId, 12)
        ]);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, this.haiku.generate(facts, snippets), mood);
      }
      case "numericPoem": {
        const [facts, snippets] = await Promise.all([
          this.store.randomFacts(input.guildId, 8),
          this.store.recentSnippets(input.guildId, 12)
        ]);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, this.haiku.numericPoem(intent.count, facts, snippets), mood);
      }
      case "mention": {
        const text = await this.generateChatter(input.guildId, input.userId, input.content, mood);
        await this.store.addAffection(input.guildId, input.userId, this.config.affectionGainRate);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.finishText(input.guildId, `${text}${this.mood.suffix(mood)}`, 0.08), mood);
      }
      case "attachment": {
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.finishText(input.guildId, this.attachmentReply(input.attachments), 0.15), mood);
      }
      case "chatter": {
        const text = await this.maybeAddWrongUser(
          input.guildId,
          input.userId,
          await this.generateChatter(input.guildId, input.userId, input.content, mood)
        );
        this.channelActivity.markChattered(input.channelId);
        await this.store.markSpoke(input.guildId, mood);
        return this.reply(input, await this.finishText(input.guildId, this.confusion.mutate(text)), mood);
      }
      default: {
        const never: never = intent;
        throw new Error(`Unhandled intent: ${String(never)}`);
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
      "・○○ 調べて、でしらべる",
      "・占って、でうらない",
      "・俳句、でなんかよむ",
      "・じゃんけん、であそぶ",
      "・おやすみ、でおはよする",
      "・つんつん、でつつく",
      "・たからもの、でみせる",
      "・かんちがい、で図鑑",
      "・クイズ、でおぼえたこと当て",
      "・静かに、でこのチャンネル黙る",
      "・静かにやめて、出てきて、でまた出る",
      "・静か中はにせいって呼べば出る",
      "・/nisei_shizuka on:true/false、でも切り替え",
      "・/nisei_hatsugen level:0〜10、でサーバー全体の発言レベル"
    ].join("\n");
  }

  async setQuiet(guildId: string, channelId: string, on: boolean): Promise<string> {
    if (on) {
      await this.store.setQuietChannel(guildId, channelId);
      return "このチャンネル静かにする";
    }
    await this.store.clearQuietChannel(guildId, channelId);
    return "また普通に出る";
  }

  async setTalkLevel(guildId: string, level: number | null): Promise<string> {
    if (level === null) {
      await this.store.clearGuildTalkLevel(guildId);
      return "もとの設定に戻した";
    }
    const clamped = Math.min(10, Math.max(0, Math.round(level)));
    await this.store.setGuildTalkLevel(guildId, clamped);
    if (clamped === 0) return "発言レベル0。呼んだら出る";
    return `発言レベル${clamped}にした`;
  }

  async stats(guildId: string): Promise<string> {
    const stats = await this.store.stats(guildId);
    const effectiveTalkLevel = resolveTalkLevel(stats.talkLevel, this.config.defaultTalkLevel);
    const talkLevelLabel =
      stats.talkLevel === null
        ? `発言レベル: ${effectiveTalkLevel}（デフォルト）`
        : `発言レベル: ${effectiveTalkLevel}`;
    return [
      `記憶: ${stats.memories}`,
      `ことば: ${stats.snippets}`,
      `ひと: ${stats.users}`,
      `かんちがい: ${stats.misunderstandings}`,
      `たからもの: ${stats.treasures}`,
      `えもじ: ${stats.emojis}`,
      `発言: ${stats.talkCount}`,
      `学習: ${stats.learnCount}`,
      `きぶん: ${stats.mood}`,
      talkLevelLabel,
      `今日のおやつ: ${dailySnack()}`,
      `きょうの気分: ${dailyMoodWord()}`
    ].join("\n");
  }

  async forget(guildId: string, subject: string): Promise<string> {
    const memoryOptions = await this.buildMemoryOptions(guildId);
    const key = normalizeMemoryWord(subject, memoryOptions) ?? subject.trim().slice(0, 12);
    const removed = await this.store.forget(guildId, key);
    return removed
      ? withMaybeOpener(this.random, this.random.pick([`${subject}わすれた`, `え、なんで忘れるの。${subject}わすれた`]))
      : withMaybeOpener(this.random, confusedAboutSubject(this.random, subject));
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

  async slashWiki(guildId: string, query: string): Promise<string> {
    return this.lookupWiki(guildId, query, true);
  }

  async slashKanchigai(guildId: string): Promise<string> {
    return this.kanchigaiAlbum(guildId);
  }

  async slashAlbum(guildId: string): Promise<string> {
    return this.treasureAlbum(guildId);
  }

  async slashQuiz(guildId: string): Promise<string> {
    return this.memoryQuiz(guildId);
  }

  async slashJanken(guildId: string, channelId: string, userId: string): Promise<string> {
    await this.store.startJanken(guildId, channelId, userId);
    return this.janken.start();
  }

  async poke(guildId: string, userId: string): Promise<string> {
    const pokeCount = await this.store.poke(guildId, userId);
    await this.store.addAffection(guildId, userId, this.config.affectionGainRate);
    return this.pokeReply(pokeCount);
  }

  async treasure(guildId: string): Promise<string> {
    const treasures = await this.store.treasures(guildId, 8);
    if (treasures.length === 0) return withMaybeOpener(this.random, emptyTreasureReply(this.random));
    const treasure = this.random.pick(treasures);
    return withMaybeOpener(this.random, `${treasure.word}。たからもの`);
  }

  private reply(input: IncomingMessage, text: string, mood: Mood, subject?: string): ResponseResult {
    this.botReplies.record(input.guildId, input.channelId, text, subject);
    const suffix = mood === "confused" || mood === "sleepy" ? this.mood.questionSuffix(mood) : "";
    return { shouldReply: true, text: `${text}${suffix}` };
  }

  private tryTsukkomi(input: IncomingMessage, intent: { type: string }): string | null {
    if (!["correction", "doubt", "lieCall"].includes(intent.type)) return null;
    if (!this.random.chance(this.config.tsukkomiResponseRate)) return null;

    const last = this.botReplies.get(input.guildId, input.channelId);
    if (!last) return null;

    if (intent.type === "correction") {
      if (last.subject) {
        const wrong = this.random.pick(["青い", "まるい", "ねむい", "おやつ", "右"]);
        return withMaybeOpener(this.random, `${last.subject}は${wrong}。ちがう？`);
      }
      return withMaybeOpener(this.random, "ちがう？ たぶんそう");
    }
    if (intent.type === "doubt") {
      return withMaybeOpener(this.random, "ほんと。たぶん");
    }
    if (intent.type === "lieCall") {
      if (last.text.includes("どれがうそ")) return quizCaughtReply(this.random);
      return withMaybeOpener(this.random, "うそじゃない。たぶん");
    }
    return null;
  }

  private async answerQuestion(input: IncomingMessage, subject: string, mood: Mood): Promise<string> {
    const [fact, otherFacts, oldMistakes, user] = await Promise.all([
      this.store.findFact(input.guildId, subject),
      this.store.randomFacts(input.guildId, 8),
      this.store.misunderstandings(input.guildId, subject, 5),
      this.store.getUser(input.guildId, input.userId)
    ]);

    if (!fact && this.config.wikiEnabled && this.random.chance(this.config.wikiFallbackRate)) {
      const wikiText = await this.lookupWiki(input.guildId, subject, false);
      if (!wikiText.includes("しらべられない")) {
        return await this.finishText(
          input.guildId,
          withQuestionOpener(this.random, `${wikiText}${this.mood.questionSuffix(mood)}`)
        );
      }
    }

    const mixRate = this.config.memoryMixRate * (user ? memoryMixMultiplier(user.affection) : 1);
    const reuseRate =
      user && user.affection >= 5
        ? this.config.misunderstandingReuseRate * 0.9
        : this.config.misunderstandingReuseRate;

    const maybeOldMistake =
      oldMistakes.length > 0 && this.random.chance(reuseRate) ? this.random.pick(oldMistakes) : null;

    let text: string;
    if (maybeOldMistake) {
      await this.store.markMisunderstandingUsed(maybeOldMistake.id);
      text = withMaybeOpener(this.random, formatFactAnswer(this.random, subject, maybeOldMistake.wrongPredicate));
    } else {
      const answer = this.confusion.answerFact(
        subject,
        fact,
        otherFacts.filter((item) => item.subject !== subject),
        { memoryMixRate: mixRate }
      );
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

    text = await this.maybeAddWrongUser(input.guildId, input.userId, text, user);
    return await this.finishText(input.guildId, withQuestionOpener(this.random, text));
  }

  private async lookupWiki(guildId: string, query: string, force: boolean): Promise<string> {
    if (!this.config.wikiEnabled) {
      return withMaybeOpener(this.random, "しらべられない。ねむいかも");
    }
    if (!force && !this.wikiCooldown.canUse(guildId, this.config.wikiCooldownSeconds)) {
      return withMaybeOpener(this.random, confusedAboutSubject(this.random, query));
    }

    const related = await this.buildWikiQuery(guildId, query);
    const titles = await fetchSearchTitlesForQuery(related, {
      userAgent: this.config.wikiUserAgent
    });
    if (titles.length === 0) {
      return withMaybeOpener(this.random, "しらべられない。ねむいかも");
    }

    const index = pickSearchIndex(this.random, titles.length, this.config.wikiWrongResultRate);
    const article = await searchWikipediaAt(related, index, {
      userAgent: this.config.wikiUserAgent
    });
    if (!article) {
      return withMaybeOpener(this.random, "しらべられない。ねむいかも");
    }

    this.wikiCooldown.markUsed(guildId);
    const text = mangleWikiReply(this.random, query, article, {
      includeUrl: this.random.chance(0.5)
    });

    if (this.random.chance(0.2)) {
      await this.store.saveMisunderstanding(guildId, query, article.extract.slice(0, 80));
    }

    return await this.finishText(guildId, text);
  }

  private async buildWikiQuery(guildId: string, query: string): Promise<string> {
    if (!this.random.chance(this.config.wikiRelatedWordRate)) return query;
    const [snippets, treasures, facts] = await Promise.all([
      this.store.recentSnippets(guildId, 8),
      this.store.treasures(guildId, 5),
      this.store.randomFacts(guildId, 5)
    ]);
    const pool = [...snippets, ...treasures.map((t) => t.word), ...facts.map((f) => f.subject)];
    if (pool.length === 0) return query;
    if (facts.length > 0 && this.random.chance(0.15)) {
      return this.random.pick(facts).subject;
    }
    return `${query} ${this.random.pick(pool)}`;
  }

  private async kanchigaiAlbum(guildId: string): Promise<string> {
    const rows = await this.store.topMisunderstandings(guildId, 3);
    if (rows.length === 0) {
      return withMaybeOpener(this.random, "かんちがい、まだない");
    }
    const lines = rows.map((row, i) => `${i + 1}. ${row.subject}は${row.wrongPredicate}`);
    return withMaybeOpener(this.random, ["かんちがい図鑑", ...lines].join("\n"));
  }

  private async treasureAlbum(guildId: string): Promise<string> {
    const rows = await this.store.albumTreasures(guildId, 5);
    if (rows.length === 0) {
      return withMaybeOpener(this.random, emptyTreasureReply(this.random));
    }
    const lines = rows.map((row, i) => `${i + 1}. ${row.word}（${row.reason}）`);
    return withMaybeOpener(this.random, ["たからものアルバム", ...lines].join("\n"));
  }

  private async memoryQuiz(guildId: string): Promise<string> {
    const [facts, snippets] = await Promise.all([
      this.store.randomFacts(guildId, 10),
      this.store.recentSnippets(guildId, 12)
    ]);
    const quiz = buildMemoryQuiz(this.random, facts, snippets);
    if (!quiz) {
      return withMaybeOpener(this.random, "まだおぼえてない。教えて");
    }
    return withMaybeOpener(this.random, quiz.text);
  }

  private attachmentReply(attachments?: { image: boolean; gif: boolean }): string {
    if (attachments?.gif) {
      return this.random.pick(["うごいてる。こわい", "うごいてる。みた", "ぐるぐる"]);
    }
    return this.random.pick(["まるい", "きれい", "食べたい", "みた", "なにこれ"]);
  }

  private async maybeIdleChatter(guildId: string, mood: Mood): Promise<string | null> {
    const talkLevel = await this.resolveGuildTalkLevel(guildId);
    if (talkLevel === 0) return null;

    const lastSpoke = await this.store.getLastSpokeAt(guildId);
    if (!lastSpoke) return null;
    const idleMs = this.config.idleChatterMinutes * 60 * 1000;
    if (Date.now() - lastSpoke.getTime() < idleMs) return null;
    if (!this.random.chance(this.config.idleChatterRate)) return null;
    const options = [
      "だれかいる",
      "おやつしたい",
      "さっきのこと忘れた",
      `きょうは${dailySnack()}`,
      `きぶんは${dailyMoodWord()}`
    ];
    if (mood === "sleepy") options.push("ねむい");
    return withMaybeOpener(this.random, this.random.pick(options));
  }

  private wasCalled(text: string, options: ClassifierOptions): boolean {
    return this.config.botNames.some((name) => text.includes(name)) || Boolean(options.botUserId && text.includes(options.botUserId));
  }

  private async resolveGuildTalkLevel(guildId: string): Promise<number> {
    const guildLevel = await this.store.getGuildTalkLevel(guildId);
    return resolveTalkLevel(guildLevel, this.config.defaultTalkLevel);
  }

  private async shouldRandomlyTalk(
    guildId: string,
    channelId: string,
    userId: string,
    text: string,
    mood: Mood
  ): Promise<boolean> {
    const talkLevel = await this.resolveGuildTalkLevel(guildId);
    if (talkLevel === 0) return false;

    const [guildLastSpokeAt, facts, snippets, users] = await Promise.all([
      this.store.getLastSpokeAt(guildId),
      this.store.randomFacts(guildId, 12),
      this.store.recentSnippets(guildId, 12),
      this.store.knownUsers(guildId, undefined, 20)
    ]);
    const currentUser = users.find((user) => user.userId === userId);
    const hasKnownWord = facts.some((fact) => text.includes(fact.subject) || text.includes(fact.predicate));
    const input: InterjectInput = {
      now: Date.now(),
      talkLevel,
      cooldownSeconds: this.config.cooldownSeconds,
      channelCooldownSeconds: this.config.channelCooldownSeconds,
      guildLastSpokeAt,
      channelLastChatterAt: this.channelActivity.getLastChatterAt(channelId),
      activityLevel: this.channelActivity.level(channelId),
      userAffection: currentUser?.affection ?? 0,
      hasKnownWord,
      hasRecentSnippet: hasRecentSnippetMatch(text, snippets),
      mood,
      messageLength: text.length,
      hasEmotion: hasEmotionInText(text),
      activityBoostMax: this.config.activityBoostMax,
      affectionTalkCap: this.config.affectionTalkCap,
      chanceCap: this.config.chatterChanceCap
    };
    return shouldInterject(input, this.random);
  }

  private async generateChatter(guildId: string, currentUserId: string, text: string, mood: Mood): Promise<string> {
    const [facts, snippets, treasures, users, currentUsers, emojis, memoryOptions] = await Promise.all([
      this.store.randomFacts(guildId, 10),
      this.store.recentSnippets(guildId, 12),
      this.store.treasures(guildId, 8),
      this.store.knownUsers(guildId, currentUserId, 10),
      this.store.knownUsers(guildId, undefined, 20),
      this.store.learnedEmojis(guildId, 20),
      this.buildMemoryOptions(guildId)
    ]);
    const currentUser = currentUsers.find((user) => user.userId === currentUserId);
    const directSnippets = extractSnippets(text, memoryOptions)
      .map((snippet) => normalizeMemoryWord(snippet, memoryOptions))
      .filter((snippet): snippet is string => snippet !== null);
    const personalityContext = { mood, currentUser, facts, snippets, treasures, directSnippets, emojis };

    const choices: string[] = [
      this.personality.utterance(personalityContext),
      ...defaultReactions,
      ...this.makeDefaultChatter()
    ];

    const seasonal = seasonalHint();
    if (seasonal) choices.push(`${seasonal}かも`);
    choices.push(`今日のおやつは${dailySnack()}`);

    if (facts.length > 0) {
      const fact = this.random.pick(facts);
      choices.push(formatFactAnswer(this.random, fact.subject, fact.predicate));
      choices.push(`${fact.predicate}は${fact.subject}？`);
      choices.push(`${fact.subject}、さっきいた`);
      choices.push(`${fact.predicate}のにおいする`);
    }

    if (treasures.length > 0 && this.random.chance(this.config.treasurePickRate * 2)) {
      choices.push(`${this.random.pick(treasures).word}。たからもの`);
    }

    if (users.length > 0 && this.random.chance(this.config.wrongUserRate)) {
      const user = this.random.pick(users);
      choices.push(`${user.displayName}もそうだよ`);
      choices.push(`${user.displayName}もえらい`);
    }

    if (snippets.length > 0) {
      choices.push(this.random.pick(snippets));
      choices.push(`${this.random.pick(snippets)}ってなに`);
      choices.push(`${this.random.pick(snippets)}、いま通った`);
    }

    if (directSnippets.length > 0) {
      choices.push(`${this.random.pick(directSnippets)}、おぼえた`);
      choices.push(`${this.random.pick(directSnippets)}すきかも`);
    }

    return this.personality.withEmoji(
      this.personality.prefixMaybe(this.random.pick(choices), personalityContext),
      this.config.emojiUseRate,
      emojis
    );
  }

  private pokeReply(pokeCount: number): string {
    if (pokeCount >= 6) {
      return withMaybeOpener(this.random, this.random.pick(["む", "ねる", "やめて"]));
    }
    if (pokeCount >= 3) {
      return withMaybeOpener(this.random, this.random.pick(["なに", "へへ", "つよい"]));
    }
    return this.random.pick(["はい", "うん", "へへ", "なに", "つん"]);
  }

  private async maybeSaveTreasures(guildId: string, userId: string, snippets: string[], reason: string): Promise<void> {
    const user = await this.store.getUser(guildId, userId);
    const favoriteBoost = user && user.affection >= 10 ? 2 : 1;
    const candidates = snippets.filter((snippet) => snippet.length >= 2 && snippet.length <= 10);
    await Promise.all(
      candidates
        .filter(() => this.random.chance(this.config.treasurePickRate * favoriteBoost))
        .map((snippet) => this.store.saveTreasure(guildId, snippet, userId, reason))
    );
  }

  private async maybeAddWrongUser(
    guildId: string,
    currentUserId: string,
    text: string,
    currentUser?: KnownUserSummary | null
  ): Promise<string> {
    const bonus = currentUser ? wrongUserRateBonus(currentUser.affection) : 0;
    if (!this.random.chance(this.config.wrongUserRate + bonus)) return text;
    const users = await this.store.knownUsers(guildId, currentUserId, 8);
    if (users.length === 0) return text;
    const user = this.random.pick(users);
    await this.store.markUserReferenced(guildId, user.userId);
    return this.random.pick([
      `${text}\n${user.displayName}もそうだよ`,
      withMaybeOpener(this.random, `${user.displayName}もそう`),
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
      withMaybeOpener(this.random, "うらなった。ねむい"),
      "うらないは丸い",
      "きょうは右",
      withMaybeOpener(this.random, "おやつが吉"),
      await this.generateChatter(guildId, userId, text, mood),
      this.haiku.generate(facts, snippets),
      treasures.length > 0
        ? withMaybeOpener(this.random, `${this.random.pick(treasures).word}が光ってる`)
        : withMaybeOpener(this.random, "光ってる")
    ];

    return this.random.pick(options);
  }

  private shouldStaySilent(intentType: string): boolean {
    const multiplier =
      intentType === "mention" ? 0.6 :
      intentType === "question" ? 0.5 :
      intentType === "greeting" ? 1.2 :
      intentType === "chatter" ? 0.5 :
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

  private async buildMemoryOptions(guildId: string): Promise<NormalizeMemoryOptions> {
    const hints = await this.store.knownWordHints(guildId);
    return {
      hints,
      segmentFallback: this.config.wordSegmentFallback
    };
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
      word,
      `${word}えらい`
    ];
  }
}
