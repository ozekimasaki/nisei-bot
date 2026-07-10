import { REST, Routes } from "discord.js";
import { slashCommands } from "./commands.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const rest = new REST({ version: "10" }).setToken(config.discordToken);

if (config.guildId) {
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: slashCommands
  });
  // グローバル側が残っていると同一名コマンドが二重表示されるため空にする
  await rest.put(Routes.applicationCommands(config.clientId), {
    body: []
  });
  console.log(`Deployed ${slashCommands.length} guild commands to ${config.guildId}`);
  console.log("Cleared global commands to avoid duplicates");
} else {
  await rest.put(Routes.applicationCommands(config.clientId), {
    body: slashCommands
  });
  console.log(`Deployed ${slashCommands.length} global commands`);
}
