import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { VoiceInterviewSession } from "../models/voiceSession.js";
import { GeminiService } from "../services/gemini.js";
import { VoiceHandler } from "../handlers/voice.js";
import { ROLE_CHOICES, DIFFICULTY_CHOICES } from "../utils/constants.js";

export const voiceInterviewSessions = new Map();

export class CommandHandler {
  static getCommands() {
    return [
      new SlashCommandBuilder()
        .setName("join-interview")
        .setDescription("Interviewer joins your voice channel for interview")
        .addStringOption((option) =>
          option
            .setName("role")
            .setDescription("The role yo want to practice for")
            .setRequired(true)
            .addChoices(...ROLE_CHOICES)
        )
        .addStringOption((option) =>
          option
            .setName("difficulty")
            .setDescription("Interview difficulty level")
            .addChoices(...DIFFICULTY_CHOICES)
        ),

      new SlashCommandBuilder()
        .setName("leave-interview")
        .setDescription(
          "Interviewer leaves the voice channel and ends interview session"
        ),

      new SlashCommandBuilder()
        .setName("interview-status")
        .setDescription("Check your current interview status"),
    ];
  }

  static async handleJoinInterview(interaction) {
    const userId = interaction.user.id;
    const role = interaction.options.getString("role");
    const difficulty =
      interaction.options.getString("difficulty") || "intermediate";

    // Check if user is in a voice channel
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: "You must be in a voice channel to start an interview.",
        ephemeral: true,
      });
      return;
    }

    //Check if user already have an active session
    if (voiceInterviewSessions.has(userId)) {
      await interaction.reply({
        content:
          "You already have an active interview session. Use `/leave-interview` to end it first.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      //Generate Questions
      const questions = await GeminiService.generateInterviewQuestions(
        role,
        difficulty
      );
      console.log("Generated questions:", questions.length);

      //Create session
      const session = new VoiceInterviewSession(
        userId,
        interaction.guildId,
        voiceChannel.id,
        role,
        difficulty
      );
      session.questions = questions;
      session.isActive = true;
      voiceInterviewSessions.set(userId, session);

      //Setup voice connection
      await VoiceHandler.setupVoiceConnection(
        session,
        voiceChannel,
        interaction.client.user.id
      );

      const embed = new EmbedBuilder()
        .setColor(0x00ff99)
        .setTitle("🎤 Voice Interview Started!")
        .setDescription(
          `I've joined **${voiceChannel.name}** and we're ready to begin.`
        )
        .addFields(
          { name: "🎯 Role", value: role, inline: true },
          { name: "📊 Difficulty", value: difficulty, inline: true },
          {
            name: "❓ Questions",
            value: questions.length.toString(),
            inline: true,
          }
        )
        .setFooter({
          text: "Speak clearly and wait for my response. Good luck!",
        });

      await interaction.editReply({ embeds: [embed] });

      //Start the interview with first question
      setTimeout(async () => {
        const welcomeText = `Hello! Welcome to your ${role} interview. I'll be asking you ${
          questions.length
        } questions. Please speak clearly and take your time. Let's begin with the first question: ${session.getCurrentQuestion()}`;
        await VoiceHandler.speakResponse(session, welcomeText);

        //Enable listening after welcome message
        setTimeout(() => {
          session.isListening = true;
          console.log("🎙️ Now  Listening for user response...");
        }, 1000);
      }, 2000);
    } catch (error) {
      console.error("❌ Error joining voice channel:", error);
      voiceInterviewSessions.delete(userId);
      await interaction.editReply({
        content: "Failed to start voice interview. Please try again.",
      });
    }
  }

  static async handleLeaveInterview(interaction) {
    const userId = interaction.user.id;
    const session = voiceInterviewSessions.get(userId);

    if (!session) {
      await interaction.reply({
        content: "You don't have an active voice interview session.",
        ephemeral: true,
      });
      return;
    }

    // Cleanup session
    await session.cleanup();
    voiceInterviewSessions.delete(userId);
    VoiceHandler.cleanupUserAudio(session);

    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle("👋 Interview Ended")
      .setDescription(
        "I've left the voice channel. Thanks for the interview practice!"
      )
      .addFields(
        {
          name: "📊 Progress",
          value: `Completed ${session.answers.length} out of ${session.questions.length} questions`,
        },
        {
          name: "⏱️ Duration",
          value: `${Math.round(
            (Date.now() - session.startTime) / 60000
          )} minutes`,
        }
      );

    await interaction.reply({ embeds: [embed] });
  }

  static async handleInterviewStatus(interaction) {
    const userId = interaction.user.id;
    const session = voiceInterviewSessions.get(userId);

    if (!session) {
      await interaction.reply({
        content: "You don't have an active voice interview session.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🎤 Voice Interview Status")
      .addFields(
        { name: "🎯 Role", value: session.role, inline: true },
        {
          name: "📊 Progress",
          value: `${session.currentQuestionIndex + 1} / ${session.questions.length}`,
          inline: true,
        },
        {
          name: "⏱️ Duration",
          value: `${Math.round((Date.now() - session.startTime) / 60000)} minutes`,
          inline: true,
        },
        {
          name: "🔊 Status",
          value: session.isListening
            ? "Listening for your response"
            : session.isSpeaking
            ? "Speaking"
            : "Processing",
          inline: true,
        },
        {
          name: "📝 Current Question",
          value: session.isActive ? session.getCurrentQuestion() : "Interview completed",
        }
      );

    await interaction.reply({ embeds: [embed] });
  }

   static getSessions () {
      return voiceInterviewSessions;
   }


}
