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
    ),
  new SlashCommandBuilder()
    .setName("nisei_wiki")
    .setDescription("ウィキペディアを調べます")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("調べる言葉")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("nisei_kanchigai")
    .setDescription("かんちがい図鑑を見ます"),
  new SlashCommandBuilder()
    .setName("nisei_album")
    .setDescription("たからものアルバムを見ます"),
  new SlashCommandBuilder()
    .setName("nisei_quiz")
    .setDescription("なに覚えてるかクイズを出します"),
  new SlashCommandBuilder()
    .setName("nisei_janken")
    .setDescription("じゃんけんを始めます"),
  new SlashCommandBuilder()
    .setName("nisei_shizuka")
    .setDescription("このチャンネルでにせいを静かにします")
    .addBooleanOption((option) =>
      option
        .setName("on")
        .setDescription("true=静かに / false=また話す")
        .setRequired(true)
    )
].map((command) => command.toJSON());
