import dotenv from "dotenv";
dotenv.config();

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
  },
  apis: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    murfApiKey: process.env.MURF_API_KEY,
    assemblyAiApiKey: process.env.ASSEMBLY_API_KEY,
  },
};
