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
import { AudioChunker } from "../utils/audio.js";

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
      await entersState(connection, VoiceConnectionStatus.Ready, 20000);
      console.log("✅ Voice connection ready!");

      //Create audio player
      const audioPlayer = createAudioPlayer();
      connection.subscribe(audioPlayer);
      session.connection = connection;
      session.audioPlayer = audioPlayer;

      // --- CRITICAL CHANGE 1: Setup Audio Player State Management ---
      // This is now the ONLY place that controls the isSpeaking flag
      audioPlayer.on(AudioPlayerStatus.Playing, () => {
        console.log("▶️ Bot started speaking.");
        session.isSpeaking = true;
      });

      audioPlayer.on(AudioPlayerStatus.Idle, () => {
        console.log("⏹️ Bot finished speaking, ready to listen.");
        session.isSpeaking = false;
      });

      // --- CRITICAL CHANGE 2: Create Transcriber and Persistent Pipeline ---
      // The transcriber is created here. The logic for handling its 'turn' event will be in AssemblyAIService.
      session.transcriber = await AssemblyAIService.createTranscriber(session);

      // We call listenToUser ONCE to set up the permanent audio stream.
      this.listenToUser(session, session.userId);

      // --- CRITICAL CHANGE 3: REMOVE speaking.on LISTENER ---
      // The entire connection.receiver.speaking.on(...) block has been removed.
      // It is unstable and unnecessary with the new persistent pipeline.

      return connection;
    } catch (error) {
      console.error("❌ Error setting up voice connection:", error);
      session.cleanup();
      throw error;
    }
  }

  

  static async listenToUser(session, userId) {
    try {
      console.log(`🎤 Starting to listen to user: ${userId}`);

      if (!session.connection || !session.transcriber) {
        console.log("❌ Cannot listen: connection or transcriber is missing.");
        return;
      }

      const audioStream = session.connection.receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.Manual },
      });

      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 1,
        frameSize: 960,
      });

      // Use the AudioChunker to create correctly sized chunks for AssemblyAI
      const targetChunkSize = 48000 * 2 * 0.1; // 100ms of audio
      const chunker = new AudioChunker(targetChunkSize);

      // Create a simple Writable stream to send data to AssemblyAI
      const assemblyaiWritable = new Writable({
        write(chunk, encoding, callback) {
          if (
            session.transcriber &&
            !session.transcriber.closed &&
            !session.isSpeaking
          ) {
            session.transcriber.sendAudio(chunk);
          }
          callback();
        },
      });

      // Pipe everything together in a clean pipeline
      audioStream.pipe(decoder).pipe(chunker).pipe(assemblyaiWritable);

      session.audioPipeline = [
        audioStream,
        decoder,
        chunker,
        assemblyaiWritable,
      ];
      console.log("✅ Audio pipeline created and listening.");
    } catch (error) {
      console.error("🔴 listenToUser error:", error?.message);
    }
  }
}
