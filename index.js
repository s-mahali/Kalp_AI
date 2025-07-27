import { Client, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import { config } from "./config/config.js";
import { CommandHandler, voiceInterviewSessions } from "./handlers/command.js";
import { EventEmitter } from "events";
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch"

dotenv.config();


//process.env.DEBUG = "discord:*";

const app = express();
const port = process.env.PORT || 3000;


//Health check endpoint
app.get('/', (_, res) => {
    res.json({
      status: 'Bot is running',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
    });

});

//endpoint to check bot status 
app.get('/status', (_, res) => {
  res.json({
    botReady: client.isReady(),
    guilds: client.guilds.cache.size,
    users: client.users.cache.size
  });
});

//start express server 
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

//cron schedule to keep alive the server 
const keepAlive = () => {
   setInterval(() => {
      //only ping if we have a render URL
      if(process.env.RENDER_EXTERNAL_URL){
           fetch(process.env.RENDER_EXTERNAL_URL)
           .then(res => console.log(`Self Ping: ${res.status}`))
           .catch(err => console.log(`Self Ping Error: ${err.message}`));
      }
   }, 14 * 60 * 1000); //14 min
}

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
  keepAlive();
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

  if(session){
    if (session.transcriber) session.transcriber.close();
    if (session.connection) session.connection.destroy();
  }

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
