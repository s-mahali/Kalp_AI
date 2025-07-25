import { AssemblyAI } from "assemblyai";
import { config } from "../config/config.js";
import { AUDIO_CONFIG } from "../utils/constants.js";
import { SessionHandler } from "../handlers/session.js";

const assemblyAI = new AssemblyAI({
  apiKey: config.apis.assemblyAiApiKey,
});

export class AssemblyAIService {
  static async createTranscriber(session) {
    try {
      console.log("setting up AssemblyAi transcriber...");
      const transcriber = assemblyAI.streaming.transcriber({
        sampleRate: AUDIO_CONFIG.ASSEMBLY_SAMPLE_RATE,
        formatTurns: true,
      });

      //Set up event handlers
      transcriber.on("open", ({ id }) => {
        console.log(`✅ Real-time session opened with ID: ${id}`);
        session.isListening = false; // Don't start listening immediately
      });
      transcriber.on("error", (error) => {
        console.error("❌ RealTime transcription error:", error);
        session.isListening = false;
      });
      transcriber.on("close", (code, reason) => {
        console.log("📴 Real-Time session closed:", code, reason);
        session.isListening = false;
      });

      //Handle turn events
      transcriber.on("turn", (turn) => {
        if (!turn.transcript || !session.isActive || session.isSpeaking) {
          return; // Ignore if bot is speaking
        }
        console.log(`📝 Turn ${turn.turn_order}:`, turn.transcript);
        console.log(
          `   Formatted: ${turn.turn_is_formatted}, End of turn: ${turn.end_of_turn}`
        );

        // Only process final, formatted transcripts
        if (turn.turn_is_formatted && turn.end_of_turn) {
          console.log("✅ Final transcript:", turn.transcript);

          if (turn.transcript.trim()) {
            SessionHandler.handleUserResponse(session, turn.transcript.trim());
          }
        } else {
          // Update current partial transcript for real-time display
          session.currentTranscript = turn.transcript;
          console.log("⏳ Partial transcript:", turn.transcript);
        }
      });

      

       // Connect to the transcription service
      console.log("🔌 Connecting to AssemblyAI streaming service...");
      await transcriber.connect();
      console.log("✅ AssemblyAI transcriber setup complete");
      return transcriber;
    } catch (error) {
       console.error("❌ Error setting up AssemblyAI:", error);
      throw error;
    }
  }
}
