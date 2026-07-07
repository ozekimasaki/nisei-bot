export type MessageIntent =
  | { type: "mention" }
  | { type: "teach"; subject: string; predicate: string }
  | { type: "denyTeach"; subject: string; predicate: string }
  | { type: "question"; subject: string }
  | { type: "wikiSearch"; query: string }
  | { type: "greeting"; kind: "morning" | "night" | "home" | "other" }
  | { type: "fortune" }
  | { type: "haiku" }
  | { type: "poke" }
  | { type: "treasure" }
  | { type: "kanchigai" }
  | { type: "album" }
  | { type: "quiz" }
  | { type: "correction" }
  | { type: "doubt" }
  | { type: "lieCall" }
  | { type: "jankenStart" }
  | { type: "jankenRematch" }
  | { type: "jankenHand"; hand: JankenHand }
  | { type: "numericPoem"; count: number }
  | { type: "attachment" }
  | { type: "quietOn" }
  | { type: "quietOff" }
  | { type: "chatter" };

export type JankenHand = "gu" | "choki" | "pa";

export type ClassifierOptions = {
  botNames: string[];
  botUserId?: string;
};

const handAliases: Record<string, JankenHand> = {
  "ぐー": "gu",
  "グー": "gu",
  "ぐう": "gu",
  "グウ": "gu",
  "✊": "gu",
  "ちょき": "choki",
  "チョキ": "choki",
  "ちょきー": "choki",
  "✌": "choki",
  "✌️": "choki",
  "ぱー": "pa",
  "パー": "pa",
  "ぱあ": "pa",
  "パア": "pa",
  "✋": "pa"
};

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function isCalled(text: string, options: ClassifierOptions): boolean {
  const normalized = normalize(text);
  if (options.botUserId && normalized.includes(`<@${options.botUserId}>`)) return true;
  if (options.botUserId && normalized.includes(`<@!${options.botUserId}>`)) return true;
  return options.botNames.some((name) => normalized.includes(name));
}

export function classifyMessage(text: string, options: ClassifierOptions): MessageIntent {
  const normalized = normalize(text);

  const wikiExplicit =
    normalized.match(/^(.{1,40}?)\s*(?:を)?(?:調べて|しらべて|wiki|ウィキ(?:ペディア)?)[。.!！]*$/iu) ??
    normalized.match(/^(?:wiki|ウィキ(?:ペディア)?)\s+(.{1,40})[。.!！]*$/iu);
  if (wikiExplicit) {
    const query = (wikiExplicit[1] ?? "").trim();
    if (query) return { type: "wikiSearch", query };
  }

  const denyTeach = normalized.match(/^(.{1,40}?)[はって]([^?？]{1,100}?)じゃない(?:よ|ぞ)?[。.!！]*$/u);
  if (denyTeach) {
    return {
      type: "denyTeach",
      subject: denyTeach[1]!.trim(),
      predicate: denyTeach[2]!.trim()
    };
  }

  const teach = normalized.match(/^(.{1,40}?)[はって]([^?？]{1,100}?)(?:だよ|です|だ|なの|やで|だね)[。.!！]*$/u);
  if (teach) {
    return {
      type: "teach",
      subject: teach[1]!.trim(),
      predicate: teach[2]!.trim()
    };
  }

  if (/^(?:ちがう|違う|じゃない|ちがいます|違います)/u.test(normalized)) {
    return { type: "correction" };
  }
  if (/^(?:ほんと|本当|マジ|まじ)[?？]?$/iu.test(normalized)) {
    return { type: "doubt" };
  }
  if (/^うそ[?!！]?$/u.test(normalized)) {
    return { type: "lieCall" };
  }

  if (/^クイズ(?:して|やって|出して)?[。.!！]*$|^quiz[!.!！]*$/iu.test(normalized)) return { type: "quiz" };
  if (/かんちがい|勘違い/u.test(normalized)) return { type: "kanchigai" };
  if (/図鑑|アルバム/u.test(normalized)) return { type: "album" };

  const questionBare = normalized.match(/^(なに|何|なんだっけ|何だっけ|だれ|誰)[?？]$/u);
  if (questionBare) {
    return {
      type: "question",
      subject: questionBare[1]!
    };
  }

  const questionWithTopic = normalized.match(
    /^(.{1,40}?)(?:は|って)(?:なに|何|なんだっけ|何だっけ|だれ|誰)?[?？]$/u
  );
  if (questionWithTopic) {
    return {
      type: "question",
      subject: questionWithTopic[1]!.trim()
    };
  }

  const questionRecall = normalized.match(/^(.{1,40}?)(?:なんだっけ|何だっけ)[?？]$/u);
  if (questionRecall) {
    return {
      type: "question",
      subject: questionRecall[1]!.trim()
    };
  }

  if (/^(?:もう一回|もういっかい|まだ)/u.test(normalized)) return { type: "jankenRematch" };
  if (/^(?:じゃんけん|ジャンケン|janken)/iu.test(normalized)) return { type: "jankenStart" };
  const hand = handAliases[normalized];
  if (hand) return { type: "jankenHand", hand };

  if (/占(?:い|って|う)|うらない|運勢/u.test(normalized)) return { type: "fortune" };
  if (/俳句|一句|575|五七五/u.test(normalized)) return { type: "haiku" };
  if (/つんつん|つっつ|poke|にせいつん/u.test(normalized)) return { type: "poke" };
  if (/たからもの|宝物|宝もの|treasure/u.test(normalized)) return { type: "treasure" };

  if (/静かにやめ(?:て|といて)?/iu.test(normalized)) return { type: "quietOff" };
  if (/しずかにやめ(?:て|といて)?/iu.test(normalized)) return { type: "quietOff" };
  if (/出てきて|また話して|戻ってきて|もういいよ/u.test(normalized)) {
    return { type: "quietOff" };
  }
  if (/静かに(?:して|しといて|で)?/iu.test(normalized)) return { type: "quietOn" };
  if (/しずかに(?:して|しといて|で)?/iu.test(normalized)) return { type: "quietOn" };

  const numeric = normalized.match(/^\d{1,2}$/u);
  if (numeric) return { type: "numericPoem", count: Number(numeric[0]) };

  if (/おはよ|お早う|good morning/iu.test(normalized)) return { type: "greeting", kind: "morning" };
  if (/おやすみ|寝る|ねる|good night/iu.test(normalized)) return { type: "greeting", kind: "night" };
  if (/ただいま/u.test(normalized)) return { type: "greeting", kind: "home" };
  if (/こんにちは|こんばんは|やあ|hello|hi/iu.test(normalized)) return { type: "greeting", kind: "other" };

  if (isCalled(normalized, options)) return { type: "mention" };

  return { type: "chatter" };
}
