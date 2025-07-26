import { Client, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import { config } from "./config/config.js";
import { CommandHandler, voiceInterviewSessions } from "./handlers/command.js";
import { VoiceHandler } from "./handlers/voice.js";
import { EventEmitter } from "events";

process.env.DEBUG = "discord:*";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

//Register commands
async function registerCommands() {
  const rest = new REST({
    version: "10",
  }).setToken(config.discord.token);

  try {
    console.log("Started refreshing application (/) commands.");
    await rest.put(
      Routes.applicationGuildCommands(
        config.discord.clientId,
        config.discord.guildId
      ),
      { body: CommandHandler.getCommands() }
    );
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}

// Bot event handlers
client.once("ready", () => {
  console.log(`${client.user.tag} is ready for voice interviews!`);
  registerCommands();
  EventEmitter.defaultMaxListeners = 20;
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const userId = interaction.user.id;

  try {
    switch (commandName) {
      case "join-interview":
        await CommandHandler.handleJoinInterview(interaction);
        break;
      case "leave-interview":
        await CommandHandler.handleLeaveInterview(interaction);
        break;
      case "interview-status":
        await CommandHandler.handleInterviewStatus(interaction);
        break;
      case "conversation": 
        await  CommandHandler.handleConversation(interaction);
        break;
      case "end-conversation": 
        await  CommandHandler.handleEndconversation(interaction);
        break;  
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    await interaction.reply({
      content: "An error occurred while processing your request.",
      flags: MessageFlags.Ephemeral
    });
  }
});

// Cleanup on bot shutdown
process.on("SIGINT", () => {
  console.log("Shutting down bot...");

  if (session.transcriber) session.transcriber.close();
  if (session.connection) session.connection.destroy();

  voiceInterviewSessions.clear();
  client.destroy();
  process.exit(0);
});

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

// Login to Discord
client.login(config.discord.token);
