import {
  Client,
  Events,
  GatewayIntentBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message
} from "discord.js";
import {
  applyImageLabels,
  buildEmptySummaryEmbed,
  buildErrorEmbed,
  buildSummaryEmbed,
  canBotReadChannel,
  canMemberViewChannel,
  fetchMessagesSince,
  formatTranscript,
  loadSummaryImages,
  resolveSummaryChannel,
  selectImagesForTranscript,
  SUMMARY_MORE_BUTTON_ID,
  SUMMARY_SKIP_BUTTON_ID,
  summarizeChannelDay
} from "./channel-summary.js";
import {
  explainAiStatusInNiseiStyle,
  fetchProviderStatus,
  isAiStatusProviderId
} from "./ai-status.js";
import { loadConfig } from "./config.js";
import { ChannelActivityTracker } from "./channel-activity.js";
import { MemoryStore, prisma } from "./db.js";
import { MessageGuard } from "./message-guard.js";
import { MathRandomSource } from "./random.js";
import { ResponsePlanner } from "./responder.js";
import {
  advanceSummaryPage,
  buildSummaryContinueComponents,
  deleteSummaryPageSession,
  getSummaryPageSession,
  saveSummaryPageSession,
  summaryContinueContent
} from "./summary-page-store.js";

const config = loadConfig();
const store = new MemoryStore(prisma);
const channelActivity = new ChannelActivityTracker(
  config.activityWindowSeconds,
  config.activitySaturateCount,
  config.channelCooldownSeconds
);
const responder = new ResponsePlanner(config, store, new MathRandomSource(), channelActivity);
const messageGuard = new MessageGuard();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  if (config.botDisplayName && readyClient.user.username !== config.botDisplayName) {
    try {
      await readyClient.user.setUsername(config.botDisplayName);
      console.log(`Renamed bot user to ${config.botDisplayName}`);
    } catch (error) {
      console.error("Failed to rename bot user", error);
    }
  }
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (!message.guildId) return;
  if (!messageGuard.begin(message.id)) {
    console.warn(`Skipping duplicate message event: ${message.id}`);
    return;
  }

  const claimed = await store.tryClaimMessage(message.id);
  if (!claimed) {
    messageGuard.abort(message.id);
    console.warn(`Skipping message already claimed by another instance: ${message.id}`);
    return;
  }

  try {
    channelActivity.record(message.channelId);
    const result = await responder.plan({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      displayName: message.member?.displayName ?? message.author.displayName ?? message.author.username,
      content: message.content,
      isBot: message.author.bot,
      botUserId: client.user?.id,
      attachments: summarizeAttachments(message)
    });

    if (result.shouldReply && result.text && "send" in message.channel) {
      await message.channel.send({
        content: result.text,
        allowedMentions: { parse: [] }
      });
      if (result.followUps) {
        for (const followUp of result.followUps) {
          await sleep(followUp.delayMs);
          await message.channel.send({
            content: followUp.text,
            allowedMentions: { parse: [] }
          });
        }
      }
    }

    messageGuard.complete(message.id);
  } catch (error) {
    await store.releaseMessage(message.id);
    messageGuard.abort(message.id);
    console.error("Failed to handle message", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleSummaryButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand() || !interaction.guildId) return;

    if (interaction.commandName === "nisei_summary") {
      await handleSummaryCommand(interaction);
      return;
    }

    if (interaction.commandName === "nisei_ai_status") {
      await handleAiStatusCommand(interaction);
      return;
    }

    const response = await handleCommand(interaction);
    await interaction.reply(response);
  } catch (error) {
    console.error("Failed to handle interaction", error);
    const message = "わからなくなった。あとでまたやる";
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  }
});

async function handleSummaryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      embeds: [buildErrorEmbed("サーバーじゃないとまとめられない")],
      allowedMentions: { parse: [] }
    });
    return;
  }

  await interaction.deferReply();
  await store.rememberUser(guildId, interaction.user.id, interactionDisplayName(interaction));

  const replyEmbed = async (embed: ReturnType<typeof buildErrorEmbed>) => {
    await interaction.editReply({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  };

  if (!config.geminiApiKey) {
    await replyEmbed(buildErrorEmbed("Geminiのキーがない。`.env` に `GEMINI_API_KEY` 書いて"));
    return;
  }

  const selected = interaction.options.getChannel("channel", true);
  const fetchedChannel =
    (await interaction.guild?.channels.fetch(selected.id).catch(() => null)) ?? null;
  const channel = resolveSummaryChannel(fetchedChannel);
  if (!channel) {
    await replyEmbed(buildErrorEmbed("そのチャンネルまとめられない"));
    return;
  }

  const botUserId = client.user?.id;
  if (!botUserId || !canBotReadChannel(channel, botUserId)) {
    await replyEmbed(buildErrorEmbed("にせいが読めない。権限みて"));
    return;
  }
  if (!canMemberViewChannel(channel, interaction.user.id)) {
    await replyEmbed(buildErrorEmbed("きみはそのチャンネル見れない"));
    return;
  }

  try {
    const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
    const fetched = await fetchMessagesSince(channel, sinceMs);
    const labeled = applyImageLabels(fetched.messages);
    const lines = formatTranscript(labeled.messages);
    const transcript = lines.join("\n");
    const pendingImages = selectImagesForTranscript(transcript, labeled.pending);
    const images = await loadSummaryImages(pendingImages);
    const truncatedInput = false;

    if (!transcript) {
      await replyEmbed(buildEmptySummaryEmbed(channel.name));
      return;
    }

    const summary = await summarizeChannelDay({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      thinkingLevel: config.geminiThinkingLevel,
      transcript,
      truncatedInput,
      images
    });

    const pageCount = summary.pages.length;
    const hasMore = pageCount > 1;
    const embed = buildSummaryEmbed({
      channelName: channel.name,
      body: summary.pages[0] ?? summary.text,
      truncatedInput,
      pageIndex: hasMore ? 0 : undefined,
      pageCount: hasMore ? pageCount : undefined
    });

    const replied = await interaction.editReply({
      content: summaryContinueContent(hasMore) ?? undefined,
      embeds: [embed],
      components: hasMore ? buildSummaryContinueComponents() : [],
      allowedMentions: { parse: [] }
    });

    if (hasMore) {
      saveSummaryPageSession(replied.id, {
        userId: interaction.user.id,
        channelName: channel.name,
        truncatedInput,
        pages: summary.pages,
        pageIndex: 0
      });
    }
  } catch (error) {
    console.error("Failed to summarize channel", error);
    if (error instanceof Error && error.message === "empty_gemini_response") {
      await replyEmbed(buildErrorEmbed("なにも言えなくなった"));
      return;
    }
    await replyEmbed(buildErrorEmbed("まとめられなかった。あとでまたやって"));
  }
}

async function handleAiStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "サーバーじゃないと調べられない",
      allowedMentions: { parse: [] }
    });
    return;
  }

  await interaction.deferReply();
  await store.rememberUser(guildId, interaction.user.id, interactionDisplayName(interaction));

  const replyText = async (content: string) => {
    await interaction.editReply({
      content,
      allowedMentions: { parse: [] }
    });
  };

  if (!config.geminiApiKey) {
    await replyText("Geminiのキーがない。`.env` に `GEMINI_API_KEY` 書いて");
    return;
  }

  const providerRaw = interaction.options.getString("provider", true);
  if (!isAiStatusProviderId(providerRaw)) {
    await replyText("その会社しらない");
    return;
  }

  try {
    const status = await fetchProviderStatus(providerRaw, {
      timeoutMs: config.aiStatusTimeoutMs,
      userAgent: config.wikiUserAgent
    });
    const text = await explainAiStatusInNiseiStyle({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      thinkingLevel: config.geminiThinkingLevel,
      status
    });
    await replyText(text);
  } catch (error) {
    console.error("Failed to explain AI status", error);
    if (error instanceof Error && error.message === "empty_gemini_response") {
      await replyText("なにも言えなくなった");
      return;
    }
    await replyText("しらべられなかった。あとでまたやって");
  }
}

async function handleSummaryButton(interaction: ButtonInteraction): Promise<void> {
  if (
    interaction.customId !== SUMMARY_MORE_BUTTON_ID &&
    interaction.customId !== SUMMARY_SKIP_BUTTON_ID
  ) {
    return;
  }

  const session = getSummaryPageSession(interaction.message.id);
  if (!session) {
    await interaction.reply({
      content: "もうおそい。またまとめて",
      ephemeral: true
    });
    return;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: "きみのまとめじゃない",
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate();

  if (interaction.customId === SUMMARY_SKIP_BUTTON_ID) {
    deleteSummaryPageSession(interaction.message.id);
    await interaction.message.edit({
      content: null,
      components: [],
      allowedMentions: { parse: [] }
    });
    return;
  }

  const updated = advanceSummaryPage(interaction.message.id);
  if (!updated) {
    await interaction.followUp({
      content: "もうおそい。またまとめて",
      ephemeral: true
    });
    return;
  }

  const page = updated.pages[updated.pageIndex] ?? "";
  const hasMore = updated.pageIndex < updated.pages.length - 1;
  const embed = buildSummaryEmbed({
    channelName: updated.channelName,
    body: page,
    truncatedInput: updated.truncatedInput,
    pageIndex: updated.pageIndex,
    pageCount: updated.pages.length
  });

  await interaction.message.edit({
    content: summaryContinueContent(hasMore),
    embeds: [embed],
    components: hasMore ? buildSummaryContinueComponents() : [],
    allowedMentions: { parse: [] }
  });

  if (!hasMore) {
    deleteSummaryPageSession(interaction.message.id);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<string> {
  const guildId = interaction.guildId;
  if (!guildId) return "サーバーじゃないと忘れる";
  await store.rememberUser(guildId, interaction.user.id, interactionDisplayName(interaction));

  switch (interaction.commandName) {
    case "nisei_help":
      return responder.help();
    case "nisei_uranai":
      return responder.slashFortune(guildId);
    case "nisei_haiku":
      return responder.slashHaiku(guildId);
    case "nisei_stats":
      return responder.stats(guildId);
    case "nisei_poke":
      return responder.poke(guildId, interaction.user.id);
    case "nisei_treasure":
      return responder.treasure(guildId);
    case "nisei_forget":
      return responder.forget(guildId, interaction.options.getString("subject", true));
    case "nisei_wiki":
      return responder.slashWiki(guildId, interaction.options.getString("query", true));
    case "nisei_kanchigai":
      return responder.slashKanchigai(guildId);
    case "nisei_album":
      return responder.slashAlbum(guildId);
    case "nisei_quiz":
      return responder.slashQuiz(guildId);
    case "nisei_janken":
      return responder.slashJanken(guildId, interaction.channelId, interaction.user.id);
    case "nisei_shizuka":
      return responder.setQuiet(
        guildId,
        interaction.channelId,
        interaction.options.getBoolean("on", true)
      );
    case "nisei_hatsugen": {
      const reset = interaction.options.getBoolean("reset") ?? false;
      if (reset) {
        return responder.setTalkLevel(guildId, null);
      }
      return responder.setTalkLevel(guildId, interaction.options.getInteger("level", true));
    }
    default:
      return "そのコマンド知らない。作った？";
  }
}

function interactionDisplayName(interaction: ChatInputCommandInteraction): string {
  const member = interaction.member;
  if (member && "displayName" in member && typeof member.displayName === "string") {
    return member.displayName;
  }
  return interaction.user.displayName ?? interaction.user.username;
}

function summarizeAttachments(message: Message): { image: boolean; gif: boolean } | undefined {
  if (message.attachments.size === 0) return undefined;
  let image = false;
  let gif = false;
  for (const attachment of message.attachments.values()) {
    const contentType = attachment.contentType ?? "";
    if (contentType.includes("gif")) gif = true;
    if (contentType.startsWith("image/")) image = true;
  }
  return { image, gif };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown(): Promise<void> {
  console.log("Shutting down");
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

await client.login(config.discordToken);
