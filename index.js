import { Client, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import { config } from "./config/config.js";
import { CommandHandler, voiceInterviewSessions } from "./handlers/command.js";
import { EventEmitter } from "events";
import express from "express";
import dotenv from "dotenv";
// import fetch from "node-fetch"

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (_, res) => {
    res.json({
      status: 'Bot is running',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
      botReady: client?.isReady() || false,
      guilds: client?.guilds?.cache?.size || 0,
    });
});

// Endpoint to check bot status 
app.get('/status', (_, res) => {
  res.json({
    botReady: client?.isReady() || false,
    guilds: client?.guilds?.cache?.size || 0,
    users: client?.users?.cache?.size || 0,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Register commands function with better error handling
async function registerCommands() {
  const rest = new REST({
    version: "10",
  }).setToken(config.discord.token);

  try {
    console.log("🔄 Started refreshing application (/) commands...");
    
    // Validate config before attempting registration
    if (!config.discord.clientId || !config.discord.token) {
      throw new Error("Missing Discord client ID or token in config");
    }

    const commands = CommandHandler.getCommands();
    console.log(`📝 Found ${commands.length} commands to register:`, commands.map(cmd => cmd.name));

    // Register commands globally instead of guild-specific for production
    const route = process.env.NODE_ENV === 'production' 
      ? Routes.applicationCommands(config.discord.clientId)
      : Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId);

    const data = await rest.put(route, { body: commands });
    
    console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    return true;
    
  } catch (error) {
    console.error("❌ Error registering commands:", error);
    
    // Log more specific error details
    if (error.code === 50001) {
      console.error("Bot is missing access. Check bot permissions and guild ID.");
    } else if (error.code === 10002) {
      console.error("Unknown application. Check your client ID.");
    } else if (error.status === 401) {
      console.error("Invalid bot token.");
    }
    
    return false;
  }
}

// Cron schedule to keep alive the server 
// const keepAlive = () => {
//    const interval = setInterval(() => {
//       // Only ping if we have a render URL and bot is ready
//       if (process.env.RENDER_EXTERNAL_URL && client.isReady()) {
//            fetch(process.env.RENDER_EXTERNAL_URL)
//            .then(res => console.log(`🏓 Self Ping: ${res.status} at ${new Date().toISOString()}`))
//            .catch(err => console.log(`❌ Self Ping Error: ${err.message}`));
//       }
//    }, 14 * 60 * 1000); // 14 min
   
//    return interval;
// }



// Bot event handlers
client.once("ready", async () => {
  console.log(`🤖 ${client.user.tag} is ready for voice interviews!`);
  console.log(`📊 Connected to ${client.guilds.cache.size} guilds`);
  console.log(`👥 Serving ${client.users.cache.size} users`);
  
  // Set event emitter max listeners
  EventEmitter.defaultMaxListeners = 20;
  
  // Register commands after bot is ready
  const commandsRegistered = await registerCommands();
  
  if (commandsRegistered) {
    console.log("🎯 Bot is fully operational!");
  } else {
    console.error("⚠️ Bot started but commands failed to register");
  }
  
  
});

// Add error event handler for the client
client.on("error", (error) => {
  console.error("❌ Discord client error:", error);
});

client.on("warn", (warning) => {
  console.warn("⚠️ Discord client warning:", warning);
});

// Add disconnect handler
client.on("disconnect", () => {
  console.log("🔌 Bot disconnected");
});

client.on("reconnecting", () => {
  console.log("🔄 Bot reconnecting...");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const userId = interaction.user.id;

  console.log(`🎮 Command received: ${commandName} from user ${interaction.user.tag}`);

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
        await CommandHandler.handleConversation(interaction);
        break;
      case "end-conversation": 
        await CommandHandler.handleEndconversation(interaction);
        break;
      default:
        console.warn(`⚠️ Unknown command: ${commandName}`);
        await interaction.reply({
          content: "Unknown command.",
          flags: MessageFlags.Ephemeral
        });
    }
  } catch (error) {
    console.error(`❌ Error handling ${commandName}:`, error);
    
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `An error occurred: ${error.message}`
      : "An error occurred while processing your request.";
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (replyError) {
      console.error("❌ Failed to send error message:", replyError);
    }
  }
});

// Cleanup on bot shutdown
const cleanup = () => {
  console.log("🔄 Shutting down bot...");

 

  // Cleanup voice sessions
  voiceInterviewSessions.forEach((session, userId) => {
    try {
      if (session.transcriber) session.transcriber.close();
      if (session.connection) session.connection.destroy();
      session.cleanup();
    } catch (error) {
      console.error(`❌ Error cleaning up session for user ${userId}:`, error);
    }
  });

  voiceInterviewSessions.clear();
  
  if (client) {
    client.destroy();
  }
  
  console.log("✅ Cleanup complete");
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  cleanup();
  process.exit(1);
});

// Start express server 
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Login to Discord with better error handling
console.log("🔐 Attempting to login to Discord...");
client.login(config.discord.token)
  .then(() => {
    console.log("✅ Discord login successful");
  })
  .catch(err => {
    console.error("❌ Failed to login to Discord:", err);
    
    if (err.code === 'TokenInvalid') {
      console.error("Invalid token provided. Please check your Discord bot token.");
    } else if (err.code === 'DisallowedIntents') {
      console.error("Bot is requesting disallowed intents. Check your bot settings in the Discord Developer Portal.");
    }
    
    process.exit(1);
  });