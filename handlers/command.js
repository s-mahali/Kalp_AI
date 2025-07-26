import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  flatten,
} from "discord.js";
import { VoiceInterviewSession } from "../models/voiceSession.js";
import { GeminiService } from "../services/gemini.js";
import { VoiceHandler } from "../handlers/voice.js";
import { ROLE_CHOICES, DIFFICULTY_CHOICES } from "../utils/constants.js";
import { MurfService } from "../services/murf.js";

export const voiceInterviewSessions = new Map();

export class CommandHandler {
  static getCommands() {
    return [
      new SlashCommandBuilder()
        .setName("join-interview")
        .setDescription("Kalp AI joins your voice channel for interview")
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
          "Kalp AI leaves the voice channel and ends interview session"
        ),

      new SlashCommandBuilder()
        .setName("interview-status")
        .setDescription("Check your current interview status"),

      new SlashCommandBuilder()
        .setName("conversation")
        .setDescription("Start a free-form conversation with the Kalp AI"),

      new SlashCommandBuilder()
        .setName("end-conversation")
        .setDescription("End Conversation"),
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    //Check if user already have an active session
    if (voiceInterviewSessions.has(userId)) {
      await interaction.reply({
        content:
          "You already have an active interview session. Use `/leave-interview` to end it first.",
        flags: MessageFlags.Ephemeral,
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

      //murf starting welcome message
      //Hello! Welcome to your ${role} interview. I'll be asking you ${
      //   questions.length
      //  } questions. Please speak clearly and take your time.
      //Start the interview with first question

      setTimeout(async () => {
        const welcomeText = ` Let's begin with the first question: ${session.getCurrentQuestion()}`;
        await MurfService.textToSpeech(welcomeText, session);

        //Enable listening after welcome message
        setTimeout(() => {
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

  // Enhanced handleLeaveInterview function
  static async handleLeaveInterview(interaction) {
    const userId = interaction.user.id;
    const session = voiceInterviewSessions.get(userId);

    if (!session) {
      await interaction.reply({
        content: "You don't have an active voice interview session.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if(session.mode === "conversation") {
      await interaction.reply({
        content: "You are in a conversation mode. Use `/end-conversation` to end it first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show typing indicator while generating report
    await interaction.deferReply();

    try {
      // Generate comprehensive final report
      const finalReport = await GeminiService.generateFinalReport(session);

      // Calculate interview duration
      const durationMinutes = Math.round(
        (Date.now() - session.startTime) / 60000
      );
      const completionRate = Math.round(
        (session.answers.length / session.questions.length) * 100
      );

      // Create performance indicator
      const getPerformanceEmoji = (score) => {
        if (score >= 8) return "🟢";
        if (score >= 6) return "🟡";
        return "🔴";
      };

      // Create progress bar
      const createProgressBar = (current, total, length = 10) => {
        const filled = Math.round((current / total) * length);
        const empty = length - filled;
        return "█".repeat(filled) + "░".repeat(empty);
      };

      const embed = new EmbedBuilder()
        .setColor(
          finalReport.overallPerformance >= 7
            ? 0x00ff00
            : finalReport.overallPerformance >= 5
            ? 0xffff00
            : 0xff0000
        )
        .setTitle("🎯 Mock Interview Report")
        .setDescription(
          `**Position:** ${session.role}\n**Candidate:** ${interaction.user.displayName}`
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: "📊 Overall Performance",
            value: `${getPerformanceEmoji(finalReport.overallPerformance)} **${
              finalReport.overallPerformance
            }/10**\n${createProgressBar(finalReport.overallPerformance, 10)}`,
            inline: true,
          },
          {
            name: "📈 Completion Rate",
            value: `**${completionRate}%**\n${session.answers.length}/${session.questions.length} questions`,
            inline: true,
          },
          {
            name: "⏱️ Duration",
            value: `**${durationMinutes} minutes**\n${
              Math.round((durationMinutes / session.answers.length) * 10) / 10
            } min/question`,
            inline: true,
          },
          {
            name: "🔧 Technical Skills",
            value: `${getPerformanceEmoji(finalReport.technicalScore + 4)} ${
              finalReport.technicalScore
            }/10`,
            inline: true,
          },
          {
            name: "💬 Communication",
            value: `${getPerformanceEmoji(
              finalReport.communicationScore + 4
            )} ${finalReport.communicationScore}/10`,
            inline: true,
          },
          {
            name: "🎯 Total Score",
            value: `${getPerformanceEmoji(finalReport.totalScore + 4)} ${
              finalReport.totalScore
            }/10`,
            inline: true,
          }
          // {
          //     name: "💪 Key Strengths",
          //     value: finalReport.strengths.map(strength => `• ${strength}`).join('\n'),
          //     inline: false
          // },
          // {
          //     name: "🔄 Areas for Improvement",
          //     value: finalReport.improvementAreas.map(area => `• ${area}`).join('\n'),
          //     inline: false
          // },
          // {
          //     name: "📝 Detailed Feedback",
          //     value: finalReport.detailedFeedback,
          //     inline: false
          // },
          // {
          //     name: "🚀 Next Steps",
          //     value: finalReport.nextSteps,
          //     inline: false
          // }
        )
        .setFooter({
          text: `Interview completed on ${new Date().toLocaleDateString()}`,
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      // // Add reaction buttons for feedback
      // const row = new ActionRowBuilder().addComponents(
      //   new ButtonBuilder()
      //     .setCustomId("interview_feedback_helpful")
      //     .setLabel("👍 Helpful")
      //     .setStyle(ButtonStyle.Success),
      //   new ButtonBuilder()
      //     .setCustomId("interview_feedback_retry")
      //     .setLabel("🔄 Start New Interview")
      //     .setStyle(ButtonStyle.Primary),
      //   new ButtonBuilder()
      //     .setCustomId("interview_export_report")
      //     .setLabel("📄 Export Report")
      //     .setStyle(ButtonStyle.Secondary)
      // );

      await interaction.editReply({
        embeds: [embed],
        
      });

      // Send follow-up message with additional resources if performance is low
      if (finalReport.overallPerformance < 6) {
        const resourceEmbed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("📚 Recommended Resources")
          .setDescription(
            "Based on your performance, here are some resources to help you improve:"
          )
          .addFields(
            {
              name: "Technical Skills",
              value:
                "• Practice coding problems\n• Review fundamental concepts\n• Work on system design basics",
              inline: true,
            },
            {
              name: "Communication",
              value:
                "• Practice explaining solutions aloud\n• Record yourself answering questions\n• Join mock interview groups",
              inline: true,
            }
          );

        setTimeout(async () => {
          await interaction.followUp({
            embeds: [resourceEmbed],
            flags: MessageFlags.Ephemeral,
          });
        }, 2000);
      }
    } catch (error) {
      console.error("Error in handleLeaveInterview:", error);
      await interaction.editReply({
        content:
          "❌ There was an error generating your interview report. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    } finally {
      // Cleanup session
      await session.cleanup();
      voiceInterviewSessions.delete(userId);
    }
  }

  static async handleInterviewStatus(interaction) {
    const userId = interaction.user.id;
    const session = voiceInterviewSessions.get(userId);

    if (!session) {
      await interaction.reply({
        content: "You don't have an active voice interview session.",
        flags: MessageFlags.Ephemeral,
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
          value: `${session.currentQuestionIndex + 1} / ${
            session.questions.length
          }`,
          inline: true,
        },
        {
          name: "⏱️ Duration",
          value: `${Math.round(
            (Date.now() - session.startTime) / 60000
          )} minutes`,
          inline: true,
        },
        {
          name: "🔊 Status",
          value: session.isSpeaking ? "Speaking" : "Ongoing",
          inline: true,
        },
        {
          name: "📝 Current Question",
          value: session.isActive
            ? session.getCurrentQuestion()
            : "Interview completed",
        }
      );

    await interaction.reply({ embeds: [embed] });
  }

  static async handleConversation(interaction) {
    const userId = interaction.user.id;
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return await interaction.reply({
        content: "You must be in a voice channel to start a conversation.",
        flags: MessageFlags.Ephemeral,
      });
    }

    

    if (voiceInterviewSessions.has(userId)) {
      return await interaction.reply({
        content:
          "You are already in a session. Use `/leave-interview` to end it first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      // Create a new session instance
      const session = new VoiceInterviewSession(
        userId,
        interaction.guildId,
        voiceChannel.id
      );

      // --- SET THE MODE TO CONVERSATION ---
      session.mode = "conversation";
      session.isActive = true;
      voiceInterviewSessions.set(userId, session);

      // Use your existing VoiceHandler to connect and set up the pipeline
      await VoiceHandler.setupVoiceConnection(
        session,
        voiceChannel,
        interaction.client.user.id
      );

      await interaction.editReply({
        content: "Starting live chat session... I'm now listening. 🎤",
      });

      // Optional: Play a welcome message
      await MurfService.textToSpeech(
        "Hey there! What's on your mind?",
        session
      );
    } catch (error) {
      console.error("❌ Error starting conversation:", error);
      voiceInterviewSessions.delete(userId); // Cleanup on failure
      await interaction.editReply({
        content: "Failed to start the conversation. Please try again.",
      });
    }
  }

  static async handleEndconversation(interaction) {
    const userId = interaction.user.id;
    const session = voiceInterviewSessions.get(userId);

    if (!session) {
      await interaction.reply({
        content: "You don't have an active conversation.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (session.mode !== "conversation") {
      await interaction.reply({
        content:
          "You are not in a conversation mode. Use /leave-interview to end it first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    } else if (session.mode === "interview") {
      await interaction.reply({
        content:
          "You are in an interview mode. Use /leave-interview to end it first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("🎤 Conversation Ended")
        .setDescription(
          `Thankyou ${interaction.user.displayName} for using Kalp AI, Have a nice day!`
        )
        .setFooter({
          text: `Kalp AI | developed by Classroom of the Elite ${new Date().toLocaleDateString()}`,
          text: "https://github/s-mahali",
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        });
    } catch (error) {
      console.error("Error in handleLeaveInterview:", error);
      await interaction.editReply({
        content:
          "❌ There was an error ending your conversation. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    } finally {
      // Cleanup session
      await session.cleanup();
      voiceInterviewSessions.delete(userId);
    }
  }

  static getSessions() {
    return voiceInterviewSessions;
  }
}
