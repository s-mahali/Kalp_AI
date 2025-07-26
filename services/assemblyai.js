import { AssemblyAI } from "assemblyai";
import { config } from "../config/config.js";
import { AUDIO_CONFIG } from "../utils/constants.js";
import { MurfService } from "./murf.js";
import { GeminiService } from "./gemini.js";

const assemblyAI = new AssemblyAI({
  apiKey: config.apis.assemblyAiApiKey,
});

export class AssemblyAIService {
  static async createTranscriber(session) {
    //wordboost
    const wordBoost = [
      "JavaScript",
      "Python",
      "React",
      "Gemini",
      "AI",
      "Node.js",
      "Frontend",
      "Backend",
      "Development",
      "MurfAI",
      "Kulp AI",
      "Coding",
      "AI Agent",
       "Next.js", "Vue","AWS", 
                "Docker", "Kubernetes", "API", "database", "tech stack", "Classroom of the Elite"
    ];
    try {
      console.log("setting up AssemblyAi transcriber...");
      const transcriber = assemblyAI.streaming.transcriber({
        sampleRate: AUDIO_CONFIG.ASSEMBLY_SAMPLE_RATE,
        formatTurns: true,
        wordBoost: wordBoost,
        encoding: "pcm_s16le",
        enableAutomaticPunctuation: true,
      });

      //Set up event handlers
      transcriber.on("open", ({ id }) => {
        console.log(`✅ Real-time session opened with ID: ${id}`);
      });
      transcriber.on("error", (error) => {
        console.error("❌ RealTime transcription error:", error);
      });
      transcriber.on("close", (code, reason) => {
        console.log("📴 Real-Time session closed:", code, reason);
      });

      //Handle turn events
      transcriber.on("turn", async (turn) => {
        // Ignore empty transcripts or if the bot is currently speaking
        if (!turn.transcript || session.isSpeaking) {
          return;
        }
        console.log(`📝 Transcript received: "${turn.transcript}"`);
        session.lastUserTranscript = turn.transcript; // Keep track of the latest transcript

        //Clear any existing timer
        if (session.debounceTimer) {
          clearTimeout(session.debounceTimer);
        }

        // Set a new timer. If the user keeps talking, this gets reset.
        // If they pause for 1 second, the code inside will run.

        session.debounceTimer = setTimeout(async () => {
          if (!session.lastUserTranscript) return;

          const finalTranscript = session.lastUserTranscript;
          if (!finalTranscript) return;
          session.lastUserTranscript = "";
          //clear it for the next turn
          console.log(`👤 User finished speaking: ${finalTranscript}`);
          session.isSpeaking = true; // Set flag to prevent bot from listening to itself

          try {
            //------Conversation Logic------
            if (session.mode === "conversation") {
              const { responseText, updatedHistory } =
                await GeminiService.continueConversation(
                  finalTranscript,
                  session.chatHistory
                );
              session.chatHistory = updatedHistory; // IMPORTANT: Update history
              await MurfService.textToSpeech(responseText, session);
              //----Interview Logic -----
            } else {
              session.addAnswer(finalTranscript);
              let responseText;
              if (session.nextQuestion()) {
                const evaluation = await GeminiService.evaluateAnswer(
                  session.questions[session.currentQuestionIndex - 2], // Previous question
                  finalTranscript,
                  session.role
                );
                responseText = `${evaluation}  ${session.getCurrentQuestion()}`;
              } else {
                session.isActive = false;
                const finalFeedback = await GeminiService.generateFinalFeedback(
                  session
                );
                responseText = `${finalFeedback} Thank you for completing the interview! You can use the leave command to disconnect.`;
              }

              console.log(`🤖 Gemini response: ${responseText}`);

              // 2. Stream the response back as audio using the MurfService
              await MurfService.textToSpeech(responseText, session);
            }
          } catch (error) {
            console.error("❌ AI/TTS API error:", error?.message);
            session.isSpeaking = false; // Reset the flag on error
            const fallbackText = session.isActive
              ? "I'm sorry, there was an error. Let's continue with the next question."
              : "Thank you for your response. The interview is now complete.";

            await MurfService.textToSpeech(session, fallbackText);
          }
        }, 1200);
      });

      // Connect to the transcription service
      console.log("🔌 Connecting to AssemblyAI streaming service...");
      await transcriber.connect();
      console.log("✅ AssemblyAI transcriber setup complete");
      return transcriber;
    } catch (error) {
      console.error("❌ error transcripting audio", error);
      return null;
    }
  }
}
