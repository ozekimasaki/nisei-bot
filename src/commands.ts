import { SlashCommandBuilder } from "discord.js";

export const slashCommands = [
  new SlashCommandBuilder()
    .setName("nisei_help")
    .setDescription("にせいっぽい使い方を表示します"),
  new SlashCommandBuilder()
    .setName("nisei_uranai")
    .setDescription("今日の運勢、ラッキーカラー、ラッキーアイテムを出します"),
  new SlashCommandBuilder()
    .setName("nisei_haiku")
    .setDescription("五七五っぽい何かを読みます"),
  new SlashCommandBuilder()
    .setName("nisei_stats")
    .setDescription("このサーバーで覚えた量を表示します"),
  new SlashCommandBuilder()
    .setName("nisei_poke")
    .setDescription("にせいをつっつきます"),
  new SlashCommandBuilder()
    .setName("nisei_treasure")
    .setDescription("にせいのたからものを見ます"),
  new SlashCommandBuilder()
    .setName("nisei_forget")
    .setDescription("覚えた言葉を忘れます")
    .addStringOption((option) =>
      option
        .setName("subject")
        .setDescription("忘れる言葉")
        .setRequired(true)
    )
].map((command) => command.toJSON());
