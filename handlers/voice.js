import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
} from "@discordjs/voice";
import { Readable, Writable } from "stream";
import prism from "prism-media";
import { AUDIO_CONFIG } from "../utils/constants.js";
import { AssemblyAIService } from "../services/assemblyai.js";
import { MurfService } from "../services/murf.js";


const activeListeners = new Map();
export class VoiceHandler {
  static async setupVoiceConnection(session, channel, botUserId) {
    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      //Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 30000);
      console.log("✅ Voice connection ready!");

      //Create audio player
      const audioPlayer = createAudioPlayer();
      connection.subscribe(audioPlayer);
      session.connection = connection;
      session.audioPlayer = audioPlayer;
      session.botUserId = botUserId;

      //Setup AssemblyAI
      session.transcriber = await AssemblyAIService.createTranscriber(session);

      // Set up speaking detection with proper user filtering
      connection.receiver.speaking.on("start", (userId) => {
        console.log("User started speaking:", userId);

        //Only listen to the specific user, not the bot
        if (
          userId === session.userId &&
          session.isActive &&
          !session.isSpeaking &&
          session.transcriber
        ) {
          console.log(`Starting to listen to target user: ${userId}`);
          VoiceHandler.listenToUser(session, userId);
        } else if (userId === botUserId) {
          console.log("Bot is speaking, ignore audio ");
        } else {
          console.log(
            `Ignoring audio from  user: ${userId}not target user ${session.userId}`
          );
        }
      });

      connection.receiver.speaking.on("end", (userId) => {
        if (userId === session.userId) {
          console.log(`Target User stopped speaking: ${userId}`);
        }
      });

      // Handle audio player events
      audioPlayer.on(AudioPlayerStatus.Playing, () => {
        console.log("Bot started speaking");
        session.setBotSpeaking(true);
      });

      audioPlayer.on(AudioPlayerStatus.Idle, () => {
        console.log("🔇 Bot finished speaking");
        session.setBotSpeaking(false);
        // Resume listening after bot finishes speaking
        if (session.isActive) {
          setTimeout(() => {
            session.isListening = true;
            console.log("👂 Ready to listen again");
          }, 500);
        }
      });

      return connection;
    } catch (error) {
      console.error("❌ Error setting up voice connection:", error);
      throw error;
    }
  }

  // static async listenToUser(session, userId) {
  //   try {
  //     if (!session.connection || !session.transcriber || session.isSpeaking) {
  //       console.log(
  //         "❌ Cannot listen: connection/transcriber missing or bot is speaking"
  //       );
  //       return;
  //     }

  //     console.log(`🎙️ Setting up audio capture for user: ${userId}`);

  //     const audioStream = session.connection.receiver.subscribe(userId, {
  //       end: {
  //         behavior: EndBehaviorType.Manual,
  //         duration: AUDIO_CONFIG.SILENCE_DURATION,
  //       },
  //     });

  //     session.audioStream = audioStream;

  //     // Create Opus decoder
  //     const opusDecoder = new prism.opus.Decoder({
  //       rate: AUDIO_CONFIG.DISCORD_SAMPLE_RATE,
  //       channels: AUDIO_CONFIG.CHANNELS,
  //       frameSize: AUDIO_CONFIG.FRAME_SIZE,
  //     });

  //     console.log("✅ Audio pipeline components created");

  //     // Wait for transcriber to be ready
  //     if (!session.transcriber || session.transcriber.readyState !== "open") {
  //       console.log("⏳ Waiting for transcriber to be ready...");
  //     }

  //     console.log("🚀 Starting audio pipeline");
  //     session.isListening = true;

  //     // Set up the audio pipeline
  //     if (session.transcriber.readyState === "open") {
  //       audioStream
  //         .pipe(opusDecoder)
  //         .on("data", (chunk) => {
  //           if (
  //             session.transcriber &&
  //             session.isListening &&
  //             !session.isSpeaking &&
  //             chunk.length > 0
  //           ) {
  //             try {
  //               session.transcriber.sendAudio(chunk);
  //             } catch (error) {
  //               console.error("❌ Error sending audio to transcriber:", error);
  //             }
  //           }
  //         })
  //         .on("error", (error) => {
  //           console.error("🔴 Audio pipeline error:", error);
  //         });
  //     }
  //     // Handle stream events
  //     audioStream.on("end", () => {
  //       console.log("📴 Audio stream ended for user:", userId);
  //       session.isListening = false;
  //     });

  //     audioStream.on("error", (err) => {
  //       console.error("🔴 Audio stream error:", err);
  //       session.isListening = false;
  //     });

  //     console.log("✅ Audio pipeline established and listening");
  //   } catch (err) {
  //     console.error("🔴 listenToUser error:", err);
  //     session.isListening = false;
  //   }
  // }

  //Keep track of active listener per user

  static async listenToUser(session, userId) {
    console.log(`Starting to listen to target user: ${userId}`);
    console.log(`Setting up audio capture for user: ${userId}`);

    try {
      if (!session.connection || !session.transcriber || session.isSpeaking) {
        console.log(
          "❌ Cannot listen: connection/transcriber missing or bot is speaking"
        );
        return;
      }
      // Set up audio components
      const audioStream = session.connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.Manual,
        },
      });

      audioStream.setMaxListeners(20);
      session.audioStream = audioStream;

      // Create decoder for Discord audio
      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 1,
        frameSize: 960,
      });

      console.log("✅ Audio pipeline components created");

      // Wait for transcriber to be ready
      console.log("⏳ Waiting for transcriber to be ready...");

      if (!session.transcriber) {
        console.error("❌ Transcriber not initialized!");
        return;
      }
      session.isListening = true;
      // Buffer management for audio chunks
      let pcmBuffer = Buffer.alloc(0);
      const targetChunkSize = 4800 * 2; // ~100ms of audio at 48kHz, 16-bit

      console.log("🚀 Starting audio pipeline");

      // Create a buffer aggregator to collect and send chunks of the right size
      const bufferAggregator = new Writable({
        write(chunk, encoding, callback) {
          // Add incoming chunk to buffer
          pcmBuffer = Buffer.concat([pcmBuffer, chunk]);

          // Process complete chunks
          while (pcmBuffer.length >= targetChunkSize) {
            const chunkToSend = pcmBuffer.slice(0, targetChunkSize);
            pcmBuffer = pcmBuffer.slice(targetChunkSize);

            try {
              // Only send if transcriber is available
              if (session.transcriber && session.isListening) {
                session.transcriber.sendAudio(chunkToSend);
              }
            } catch (err) {
              console.error("Error sending audio chunk:", err.message);
            }
          }

          callback();
        },
      });

      // Set up pipeline
      audioStream.pipe(decoder).pipe(bufferAggregator);

      console.log("✅ Audio pipeline established and listening");
      session.audioStream = audioStream;
      session.decoder = decoder;
      session.bufferAggregator = bufferAggregator;

      // Store session in activeListeners map
      activeListeners.set(userId, session);

      // Handle stream end events
      audioStream.on("end", () => {
        console.log(`Audio stream for ${userId} ended`);
        if (!decoder.destroyed) decoder.destroy();
        bufferAggregator.end();
        session.isListening = false;
        VoiceHandler.cleanupUserAudio(session);
      });

      audioStream.on("error", (error) => {
        console.error("Audio stream error:", error);
        if (!decoder.destroyed) decoder.destroy();
        bufferAggregator.end();
        session.isListening = false;
        VoiceHandler.cleanupUserAudio(session);
      });
    } catch (error) {
      console.error("Error in audio capture setup:", error);
      VoiceHandler.cleanupUserAudio(session);
    }
  }

  static  cleanupUserAudio (session) {
  if (!session) return;
  
  try {
    if (session.audioStream) {
      // Remove all listeners to prevent memory leaks
      session.audioStream.removeAllListeners('end');
      session.audioStream.removeAllListeners('error');
      session.audioStream.removeAllListeners('data');
      session.audioStream.destroy();
      session.audioStream = null;
    }
    
    if (session.decoder) {
      session.decoder.removeAllListeners();
      session.decoder.destroy();
      session.decoder = null;
    }
    
    if (session.bufferAggregator) {
      session.bufferAggregator.removeAllListeners();
      session.bufferAggregator.end();
      session.bufferAggregator = null;
    }
    
    // Remove from active listeners map
    if (session.userId) {
      activeListeners.delete(session.userId);
    }
    
  } catch (err) {
    console.error("Error during audio cleanup:", err);
  }
}

  static async speakResponse(session, text) {
    try {
      console.log(
        "🗣️ Converting text to speech:",
        text.substring(0, 50) + "..."
      );

      const audioBuffer = await MurfService.textToSpeech(text);
      if (!audioBuffer || !session.connection) {
        console.error("❌ No audio buffer or connection");
        return;
      }

      // Create audio resource from buffer
      const audioResource = createAudioResource(Readable.from(audioBuffer), {
        inputType: "arbitrary",
      });

      // Mark bot as speaking before playing
      session.setBotSpeaking(true);

      // Play audio
      session.audioPlayer.play(audioResource);
      console.log("🔊 Playing audio response");

      // Wait for audio to finish (with timeout)
      try {
        await entersState(session.audioPlayer, AudioPlayerStatus.Idle, 30000);
        console.log("✅ Audio playback completed");
      } catch (error) {
        console.error("⚠️ Audio playback timeout or error:", error);
      } finally {
        session.setBotSpeaking(false);
      }
    } catch (error) {
      console.error("❌ Error playing audio:", error);
      session.setBotSpeaking(false);
    }
  }
}
