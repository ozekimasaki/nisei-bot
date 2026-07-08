import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  planGuildMemoryBatch,
  planMessageSnippetBatch,
  planMisunderstandingBatch,
  planTreasureWordBatch,
  summarizePlans,
  type GuildMemoryPlan,
  type MessageSnippetPlan,
  type MisunderstandingPlan,
  type TreasureWordPlan
} from "../src/normalize-memories.js";

type TableName = "memory" | "snippet" | "treasure" | "misunderstanding" | "all";

type CliOptions = {
  apply: boolean;
  guildId?: string;
  table: TableName;
  limit?: number;
  verbose: boolean;
};

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const guildIds = await resolveGuildIds(options.guildId);

  if (guildIds.length === 0) {
    console.log("対象 guild がありません");
    return;
  }

  let totalUpdate = 0;
  let totalDelete = 0;
  let totalMerge = 0;

  for (const guildId of guildIds) {
    console.log(`[guild:${guildId}]`);

    if (options.table === "all" || options.table === "memory") {
      const result = await normalizeGuildMemory(guildId, options);
      totalUpdate += result.update;
      totalDelete += result.delete;
      totalMerge += result.merge;
    }

    if (options.table === "all" || options.table === "snippet") {
      const result = await normalizeMessageSnippets(guildId, options);
      totalUpdate += result.update;
      totalDelete += result.delete;
      totalMerge += result.merge;
    }

    if (options.table === "all" || options.table === "treasure") {
      const result = await normalizeTreasures(guildId, options);
      totalUpdate += result.update;
      totalDelete += result.delete;
      totalMerge += result.merge;
    }

    if (options.table === "all" || options.table === "misunderstanding") {
      const result = await normalizeMisunderstandings(guildId, options);
      totalUpdate += result.update;
      totalDelete += result.delete;
      totalMerge += result.merge;
    }
  }

  console.log("");
  console.log(`合計: 更新 ${totalUpdate} 件 / 削除 ${totalDelete} 件 / マージ ${totalMerge} 件`);
  if (!options.apply) {
    console.log("--apply を付けない限り DB は変更しません");
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    table: "all",
    verbose: false
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (arg === "--guild") {
      options.guildId = args[index + 1];
      index++;
      continue;
    }
    if (arg === "--table") {
      const table = args[index + 1] as TableName | undefined;
      if (!table || !["memory", "snippet", "treasure", "misunderstanding", "all"].includes(table)) {
        throw new Error("--table には memory/snippet/treasure/misunderstanding/all を指定してください");
      }
      options.table = table;
      index++;
      continue;
    }
    if (arg === "--limit") {
      const limit = Number(args[index + 1]);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error("--limit には正の数を指定してください");
      }
      options.limit = limit;
      index++;
      continue;
    }
    throw new Error(`不明な引数: ${arg}`);
  }

  return options;
}

async function resolveGuildIds(guildId?: string): Promise<string[]> {
  if (guildId) return [guildId];

  const rows = await prisma.guildMemory.findMany({
    select: { guildId: true },
    distinct: ["guildId"]
  });
  const snippetRows = await prisma.messageSnippet.findMany({
    select: { guildId: true },
    distinct: ["guildId"]
  });
  const treasureRows = await prisma.treasureWord.findMany({
    select: { guildId: true },
    distinct: ["guildId"]
  });
  const misunderstandingRows = await prisma.misunderstanding.findMany({
    select: { guildId: true },
    distinct: ["guildId"]
  });

  return [...new Set([
    ...rows.map((row) => row.guildId),
    ...snippetRows.map((row) => row.guildId),
    ...treasureRows.map((row) => row.guildId),
    ...misunderstandingRows.map((row) => row.guildId)
  ])];
}

async function normalizeGuildMemory(
  guildId: string,
  options: CliOptions
): Promise<{ update: number; delete: number; merge: number }> {
  const rows = await prisma.guildMemory.findMany({
    where: { guildId },
    take: options.limit,
    orderBy: { updatedAt: "desc" }
  });
  const plans = planGuildMemoryBatch(rows);
  printSummary("GuildMemory", rows.length, plans, options.verbose);
  if (options.apply) {
    await applyGuildMemoryPlans(plans);
  }
  const summary = summarizePlans(plans);
  return { update: summary.update + summary.merge, delete: summary.delete, merge: summary.merge };
}

async function normalizeMessageSnippets(
  guildId: string,
  options: CliOptions
): Promise<{ update: number; delete: number; merge: number }> {
  const rows = await prisma.messageSnippet.findMany({
    where: { guildId },
    take: options.limit,
    orderBy: { createdAt: "desc" }
  });
  const plans = planMessageSnippetBatch(rows);
  printSummary("MessageSnippet", rows.length, plans, options.verbose);
  if (options.apply) {
    await applyMessageSnippetPlans(plans);
  }
  const summary = summarizePlans(plans);
  return { update: summary.update, delete: summary.delete, merge: summary.merge };
}

async function normalizeTreasures(
  guildId: string,
  options: CliOptions
): Promise<{ update: number; delete: number; merge: number }> {
  const rows = await prisma.treasureWord.findMany({
    where: { guildId },
    take: options.limit,
    orderBy: { createdAt: "desc" }
  });
  const plans = planTreasureWordBatch(rows);
  printSummary("TreasureWord", rows.length, plans, options.verbose);
  if (options.apply) {
    await applyTreasurePlans(plans);
  }
  const summary = summarizePlans(plans);
  return { update: summary.update + summary.merge, delete: summary.delete, merge: summary.merge };
}

async function normalizeMisunderstandings(
  guildId: string,
  options: CliOptions
): Promise<{ update: number; delete: number; merge: number }> {
  const rows = await prisma.misunderstanding.findMany({
    where: { guildId },
    take: options.limit,
    orderBy: { createdAt: "desc" }
  });
  const plans = planMisunderstandingBatch(rows);
  printSummary("Misunderstanding", rows.length, plans, options.verbose);
  if (options.apply) {
    await applyMisunderstandingPlans(plans);
  }
  const summary = summarizePlans(plans);
  return { update: summary.update + summary.merge, delete: summary.delete, merge: summary.merge };
}

function printSummary(label: string, beforeCount: number, plans: Array<{ kind: string }>, verbose: boolean): void {
  const summary = summarizePlans(plans);
  const afterCount = summary.keep + summary.update + summary.merge;
  console.log(
    `  ${label} ${beforeCount} -> ${afterCount} (更新 ${summary.update}, 削除 ${summary.delete}, マージ ${summary.merge})`
  );

  if (!verbose) return;

  for (const plan of plans) {
    if (plan.kind === "update" && "before" in plan && "after" in plan) {
      console.log(`    update ${JSON.stringify(plan.before)} -> ${JSON.stringify(plan.after)}`);
    }
    if (plan.kind === "delete" && "reason" in plan) {
      console.log(`    delete id=${plan.id} reason=${plan.reason}`);
    }
    if (plan.kind === "merge" && "after" in plan) {
      console.log(`    merge into=${plan.intoId} ids=${plan.mergeIds?.join(",") ?? ""}`);
    }
  }
}

async function applyGuildMemoryPlans(plans: GuildMemoryPlan[]): Promise<void> {
  await prisma.$transaction([
    ...plans.flatMap((plan) => {
      switch (plan.kind) {
        case "keep":
          return [];
        case "update":
          return [
            prisma.guildMemory.update({
              where: { id: plan.id },
              data: plan.after
            })
          ];
        case "delete":
          return [prisma.guildMemory.deleteMany({ where: { id: plan.id } })];
        case "merge":
          return [
            prisma.guildMemory.update({
              where: { id: plan.intoId },
              data: plan.after
            }),
            prisma.guildMemory.deleteMany({
              where: { id: { in: plan.mergeIds } }
            })
          ];
        default:
          return [];
      }
    })
  ]);
}

async function applyMessageSnippetPlans(plans: MessageSnippetPlan[]): Promise<void> {
  await prisma.$transaction([
    ...plans.flatMap((plan) => {
      switch (plan.kind) {
        case "keep":
          return [];
        case "update":
          return [
            prisma.messageSnippet.update({
              where: { id: plan.id },
              data: plan.after
            })
          ];
        case "delete":
          return [prisma.messageSnippet.deleteMany({ where: { id: plan.id } })];
        default:
          return [];
      }
    })
  ]);
}

async function applyTreasurePlans(plans: TreasureWordPlan[]): Promise<void> {
  await prisma.$transaction([
    ...plans.flatMap((plan) => {
      switch (plan.kind) {
        case "keep":
          return [];
        case "update":
          return [
            prisma.treasureWord.update({
              where: { id: plan.id },
              data: plan.after
            })
          ];
        case "delete":
          return [prisma.treasureWord.deleteMany({ where: { id: plan.id } })];
        case "merge":
          return [
            prisma.treasureWord.update({
              where: { id: plan.intoId },
              data: { word: plan.after.word, weight: plan.after.weight }
            }),
            prisma.treasureWord.deleteMany({
              where: { id: { in: plan.mergeIds } }
            })
          ];
        default:
          return [];
      }
    })
  ]);
}

async function applyMisunderstandingPlans(plans: MisunderstandingPlan[]): Promise<void> {
  await prisma.$transaction([
    ...plans.flatMap((plan) => {
      switch (plan.kind) {
        case "keep":
          return [];
        case "update":
          return [
            prisma.misunderstanding.update({
              where: { id: plan.id },
              data: plan.after
            })
          ];
        case "delete":
          return [prisma.misunderstanding.deleteMany({ where: { id: plan.id } })];
        case "merge":
          return [
            prisma.misunderstanding.update({
              where: { id: plan.intoId },
              data: plan.after
            }),
            prisma.misunderstanding.deleteMany({
              where: { id: { in: plan.mergeIds } }
            })
          ];
        default:
          return [];
      }
    })
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
