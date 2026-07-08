import { MAX_MEMORY_WORD_LENGTH, normalizeMemoryWord } from "./phrase.js";

export type GuildMemoryRow = {
  id: string;
  guildId: string;
  subject: string;
  predicate: string;
  confidence: number;
  updatedAt: Date;
};

export type MessageSnippetRow = {
  id: string;
  guildId: string;
  text: string;
  createdAt: Date;
};

export type TreasureWordRow = {
  id: string;
  guildId: string;
  word: string;
  weight: number;
};

export type MisunderstandingRow = {
  id: string;
  guildId: string;
  subject: string;
  wrongPredicate: string;
  sourcePredicate: string | null;
  weight: number;
};

export type NormalizeDeleteReason = "invalid_word" | "duplicate";

export type GuildMemoryPlan =
  | { kind: "keep"; id: string }
  | { kind: "update"; id: string; before: { subject: string; predicate: string }; after: { subject: string; predicate: string } }
  | { kind: "delete"; id: string; reason: NormalizeDeleteReason }
  | {
      kind: "merge";
      intoId: string;
      mergeIds: string[];
      after: { subject: string; predicate: string; confidence: number };
    };

export type MessageSnippetPlan =
  | { kind: "keep"; id: string }
  | { kind: "update"; id: string; before: { text: string }; after: { text: string } }
  | { kind: "delete"; id: string; reason: NormalizeDeleteReason };

export type TreasureWordPlan =
  | { kind: "keep"; id: string }
  | { kind: "update"; id: string; before: { word: string }; after: { word: string } }
  | { kind: "delete"; id: string; reason: NormalizeDeleteReason }
  | { kind: "merge"; intoId: string; mergeIds: string[]; after: { word: string; weight: number } };

export type MisunderstandingPlan =
  | { kind: "keep"; id: string }
  | {
      kind: "update";
      id: string;
      before: { subject: string; wrongPredicate: string; sourcePredicate: string | null };
      after: { subject: string; wrongPredicate: string; sourcePredicate: string | null };
    }
  | { kind: "delete"; id: string; reason: NormalizeDeleteReason }
  | {
      kind: "merge";
      intoId: string;
      mergeIds: string[];
      after: { subject: string; wrongPredicate: string; sourcePredicate: string | null; weight: number };
    };

export function normalizeStoredWord(value: string): string | null {
  return normalizeMemoryWord(value);
}

export function planGuildMemoryBatch(rows: GuildMemoryRow[]): GuildMemoryPlan[] {
  const rowPlans: GuildMemoryPlan[] = [];
  const normalizedRows = rows.map((row) => ({
    row,
    subject: normalizeStoredWord(row.subject),
    predicate: normalizeStoredWord(row.predicate)
  }));

  for (const item of normalizedRows) {
    if (!item.subject || !item.predicate) {
      rowPlans.push({ kind: "delete", id: item.row.id, reason: "invalid_word" });
      continue;
    }

    if (item.subject === item.row.subject && item.predicate === item.row.predicate) {
      rowPlans.push({ kind: "keep", id: item.row.id });
      continue;
    }

    rowPlans.push({
      kind: "update",
      id: item.row.id,
      before: { subject: item.row.subject, predicate: item.row.predicate },
      after: { subject: item.subject, predicate: item.predicate }
    });
  }

  const groups = new Map<string, Array<{ row: GuildMemoryRow; subject: string; predicate: string }>>();
  for (const item of normalizedRows) {
    if (!item.subject || !item.predicate) continue;
    const key = `${item.row.guildId}:${item.subject}`;
    const bucket = groups.get(key) ?? [];
    bucket.push({ row: item.row, subject: item.subject, predicate: item.predicate });
    groups.set(key, bucket);
  }

  const mergePlans: GuildMemoryPlan[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length <= 1) continue;

    const sorted = [...bucket].sort((left, right) => {
      if (right.row.confidence !== left.row.confidence) {
        return right.row.confidence - left.row.confidence;
      }
      return right.row.updatedAt.getTime() - left.row.updatedAt.getTime();
    });
    const keeper = sorted[0]!;
    const mergeIds = sorted.slice(1).map((item) => item.row.id);
    const confidence = sorted.reduce((sum, item) => sum + item.row.confidence, 0);

    mergePlans.push({
      kind: "merge",
      intoId: keeper.row.id,
      mergeIds,
      after: {
        subject: keeper.subject,
        predicate: keeper.predicate,
        confidence
      }
    });
  }

  const mergedIds = new Set(
    mergePlans.flatMap((plan) => (plan.kind === "merge" ? [plan.intoId, ...plan.mergeIds] : []))
  );
  const filteredRowPlans = rowPlans.filter((plan) => {
    if (plan.kind === "keep" || plan.kind === "update") return !mergedIds.has(plan.id);
    if (plan.kind === "delete") return !mergedIds.has(plan.id);
    return true;
  });

  return [...filteredRowPlans, ...mergePlans];
}

export function planMessageSnippetBatch(rows: MessageSnippetRow[]): MessageSnippetPlan[] {
  const plans: MessageSnippetPlan[] = [];
  const normalizedRows = rows.map((row) => ({
    row,
    text: normalizeStoredWord(row.text)
  }));

  for (const item of normalizedRows) {
    if (!item.text) {
      plans.push({ kind: "delete", id: item.row.id, reason: "invalid_word" });
    }
  }

  const validRows = normalizedRows.filter((item): item is { row: MessageSnippetRow; text: string } => item.text !== null);
  const groups = new Map<string, Array<{ row: MessageSnippetRow; text: string }>>();

  for (const item of validRows) {
    const key = `${item.row.guildId}:${item.text}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  for (const bucket of groups.values()) {
    const sorted = [...bucket].sort((left, right) => right.row.createdAt.getTime() - left.row.createdAt.getTime());
    const keeper = sorted[0]!;

    if (keeper.text === keeper.row.text) {
      plans.push({ kind: "keep", id: keeper.row.id });
    } else {
      plans.push({
        kind: "update",
        id: keeper.row.id,
        before: { text: keeper.row.text },
        after: { text: keeper.text }
      });
    }

    for (const duplicate of sorted.slice(1)) {
      plans.push({ kind: "delete", id: duplicate.row.id, reason: "duplicate" });
    }
  }

  return dedupePlans(plans);
}

export function planTreasureWordBatch(rows: TreasureWordRow[]): TreasureWordPlan[] {
  const rowPlans: TreasureWordPlan[] = [];
  const normalizedRows = rows.map((row) => ({
    row,
    word: normalizeStoredWord(row.word)
  }));

  for (const item of normalizedRows) {
    if (!item.word) {
      rowPlans.push({ kind: "delete", id: item.row.id, reason: "invalid_word" });
      continue;
    }

    if (item.word === item.row.word) {
      rowPlans.push({ kind: "keep", id: item.row.id });
      continue;
    }

    rowPlans.push({
      kind: "update",
      id: item.row.id,
      before: { word: item.row.word },
      after: { word: item.word }
    });
  }

  const groups = new Map<string, Array<{ row: TreasureWordRow; word: string }>>();
  for (const item of normalizedRows) {
    if (!item.word) continue;
    const key = `${item.row.guildId}:${item.word}`;
    const bucket = groups.get(key) ?? [];
    bucket.push({ row: item.row, word: item.word });
    groups.set(key, bucket);
  }

  const mergePlans: TreasureWordPlan[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length <= 1) continue;
    const sorted = [...bucket].sort((left, right) => right.row.weight - left.row.weight);
    const keeper = sorted[0]!;
    mergePlans.push({
      kind: "merge",
      intoId: keeper.row.id,
      mergeIds: sorted.slice(1).map((item) => item.row.id),
      after: {
        word: keeper.word,
        weight: sorted.reduce((sum, item) => sum + item.row.weight, 0)
      }
    });
  }

  const mergedIds = new Set(
    mergePlans.flatMap((plan) => (plan.kind === "merge" ? [plan.intoId, ...plan.mergeIds] : []))
  );
  const filteredRowPlans = rowPlans.filter((plan) => {
    if (plan.kind === "keep" || plan.kind === "update" || plan.kind === "delete") {
      return !mergedIds.has(plan.id);
    }
    return true;
  });

  return dedupePlans([...filteredRowPlans, ...mergePlans]);
}

export function planMisunderstandingBatch(rows: MisunderstandingRow[]): MisunderstandingPlan[] {
  const rowPlans: MisunderstandingPlan[] = [];
  const normalizedRows = rows.map((row) => ({
    row,
    subject: normalizeStoredWord(row.subject),
    wrongPredicate: normalizeStoredWord(row.wrongPredicate),
    sourcePredicate: row.sourcePredicate ? normalizeStoredWord(row.sourcePredicate) : null
  }));

  for (const item of normalizedRows) {
    if (!item.subject || !item.wrongPredicate) {
      rowPlans.push({ kind: "delete", id: item.row.id, reason: "invalid_word" });
      continue;
    }

    if (
      item.subject === item.row.subject &&
      item.wrongPredicate === item.row.wrongPredicate &&
      item.sourcePredicate === item.row.sourcePredicate
    ) {
      rowPlans.push({ kind: "keep", id: item.row.id });
      continue;
    }

    rowPlans.push({
      kind: "update",
      id: item.row.id,
      before: {
        subject: item.row.subject,
        wrongPredicate: item.row.wrongPredicate,
        sourcePredicate: item.row.sourcePredicate
      },
      after: {
        subject: item.subject,
        wrongPredicate: item.wrongPredicate,
        sourcePredicate: item.sourcePredicate
      }
    });
  }

  const groups = new Map<
    string,
    Array<{ row: MisunderstandingRow; subject: string; wrongPredicate: string; sourcePredicate: string | null }>
  >();
  for (const item of normalizedRows) {
    if (!item.subject || !item.wrongPredicate) continue;
    const key = `${item.row.guildId}:${item.subject}:${item.wrongPredicate}`;
    const bucket = groups.get(key) ?? [];
    bucket.push({
      row: item.row,
      subject: item.subject,
      wrongPredicate: item.wrongPredicate,
      sourcePredicate: item.sourcePredicate
    });
    groups.set(key, bucket);
  }

  const mergePlans: MisunderstandingPlan[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length <= 1) continue;
    const sorted = [...bucket].sort((left, right) => right.row.weight - left.row.weight);
    const keeper = sorted[0]!;
    mergePlans.push({
      kind: "merge",
      intoId: keeper.row.id,
      mergeIds: sorted.slice(1).map((item) => item.row.id),
      after: {
        subject: keeper.subject,
        wrongPredicate: keeper.wrongPredicate,
        sourcePredicate: keeper.sourcePredicate,
        weight: sorted.reduce((sum, item) => sum + item.row.weight, 0)
      }
    });
  }

  const mergedIds = new Set(
    mergePlans.flatMap((plan) => (plan.kind === "merge" ? [plan.intoId, ...plan.mergeIds] : []))
  );
  const filteredRowPlans = rowPlans.filter((plan) => {
    if (plan.kind === "keep" || plan.kind === "update" || plan.kind === "delete") {
      return !mergedIds.has(plan.id);
    }
    return true;
  });

  return dedupePlans([...filteredRowPlans, ...mergePlans]);
}

export function summarizePlans(plans: Array<{ kind: string }>): {
  keep: number;
  update: number;
  delete: number;
  merge: number;
} {
  return {
    keep: plans.filter((plan) => plan.kind === "keep").length,
    update: plans.filter((plan) => plan.kind === "update").length,
    delete: plans.filter((plan) => plan.kind === "delete").length,
    merge: plans.filter((plan) => plan.kind === "merge").length
  };
}

function dedupePlans<T extends { kind: string; id?: string; intoId?: string; mergeIds?: string[] }>(plans: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const plan of plans) {
    const key =
      plan.kind === "merge"
        ? `merge:${plan.intoId}:${plan.mergeIds?.join(",") ?? ""}`
        : `${plan.kind}:${plan.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(plan);
  }

  return result;
}

export function isWithinStoredWordLimit(value: string): boolean {
  return value.length >= 2 && value.length <= MAX_MEMORY_WORD_LENGTH;
}
