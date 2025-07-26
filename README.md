import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import WebSocket from 'ws';
import { Writable, Transform } from 'stream';
import dotenv from 'dotenv';
dotenv.config();

const prism = require('prism-media');

import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  AudioPlayerStatus,
  VoiceConnectionStatus
} from '@discordjs/voice';

import { AssemblyAI } from 'assemblyai';
import { userInteraction } from './config/Gemini.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const sessionMap = new Map();

class AudioChunker extends Transform {
  constructor(chunkSize, options) {
    super(options);
    this.chunkSize = chunkSize;
    this.internalBuffer = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    this.internalBuffer = Buffer.concat([this.internalBuffer, chunk]);
    while (this.internalBuffer.length >= this.chunkSize) {
      const chunkToSend = this.internalBuffer.slice(0, this.chunkSize);
      this.internalBuffer = this.internalBuffer.slice(this.chunkSize);
      this.push(chunkToSend);
    }
    callback();
  }

  _flush(callback) {
    if (this.internalBuffer.length > 0) {
      this.push(this.internalBuffer);
    }
    callback();
  }
}

class MonoToStereo extends Transform {
  _transform(chunk, encoding, callback) {
    const stereoBuffer = Buffer.alloc(chunk.length * 2);
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i);
      stereoBuffer.writeInt16LE(sample, i * 2);
      stereoBuffer.writeInt16LE(sample, i * 2 + 2);
    }
    this.push(stereoBuffer);
    callback();
  }
}

client.once('ready', () => console.log('🤖 Bot is ready!'));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;

  if (commandName === 'join') {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return await interaction.reply({
        content: 'You must be in a voice channel!',
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply();
    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
      });
      const player = createAudioPlayer();
      connection.subscribe(player);
      sessionMap.set(guild.id, {
        connection, player, transcriber: null, isBotSpeaking: false,
        lastUserTranscript: '', debounceTimer: null,
      });

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('🔗 Discord Voice Connection is Ready!');
      });
      connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        if (newState.reason === 4014) {
          console.log('🚨 Discord Voice Connection disconnected due to user action.');
          if (sessionMap.has(guild.id)) {
            const session = sessionMap.get(guild.id);
            session.transcriber?.close();
            session.player?.stop(true);
            session.connection?.destroy();
            if (session.debounceTimer) clearTimeout(session.debounceTimer);
            sessionMap.delete(guild.id);
            console.log('🗑️ Cleaned up session due to disconnect.');
          }
        } else {
          console.log(`⚠️ Discord Voice Connection disconnected: ${newState.reason}`);
        }
      });
      connection.on('error', (error) => console.error('❌ Discord Voice Connection Error:', error));


      await interaction.editReply(`Joined **${voiceChannel.name}**! Ready to chat.`);
    } catch (error) {
      console.error('❌ Join Error:', error);
      await interaction.editReply('There was an error joining the channel.');
    }
  } else if (commandName === 'leave') {
    const session = sessionMap.get(guild.id);
    if (!session) {
      return await interaction.reply({
        content: 'I am not in a voice channel!',
        flags: MessageFlags.Ephemeral,
      });
    }
    session.transcriber?.close();
    session.player?.stop(true);
    session.connection?.destroy();
    if (session.debounceTimer) clearTimeout(session.debounceTimer);
    sessionMap.delete(guild.id);
    await interaction.reply('Left the channel and ended the session. ✅');
  } else if (commandName === 'chat') {
    const session = sessionMap.get(guild.id);
    if (!session) {
      return await interaction.reply({
        content: 'I need to be in a voice channel first. Use `/join`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (session.transcriber) {
      return await interaction.reply({
        content: "I'm already listening. Just start talking!",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.reply({
      content: "Starting live chat session... I'm now listening. 🎤",
      flags: MessageFlags.Ephemeral,
    });
    try {
      const assemblyClient = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
      const transcriber = assemblyClient.streaming.transcriber({
        sampleRate: 48_000, formatTurns: true, encoding: 'pcm_s16le',
      });
      session.transcriber = transcriber;
      transcriber.on('open', ({ id }) => console.log(`AssemblyAI session opened: ${id}`));
      transcriber.on('close', (code, reason) => console.log(`Session closed: ${code} - ${reason}`));
      transcriber.on('error', (err) => console.error('Transcriber error:', err));
      transcriber.on('turn', async (turn) => {
        if (!turn.transcript || session.isBotSpeaking) return;
        console.log(`📝 Transcript received: "${turn.transcript}"`);
        session.lastUserTranscript = turn.transcript;
        if (session.debounceTimer) clearTimeout(session.debounceTimer);
        session.debounceTimer = setTimeout(async () => {
          if (!session.lastUserTranscript) return;
          console.log(`👤 User said: ${session.lastUserTranscript}`);
          session.isBotSpeaking = true;
          try {
            const geminiResponse = await userInteraction(session.lastUserTranscript);
            console.log(`🤖 Gemini response: ${geminiResponse}`);
            await streamMurfAudio(geminiResponse, session);
          } catch (apiError) {
            console.error('❌ Gemini/Murf API error:', apiError);
            session.isBotSpeaking = false;
            session.lastUserTranscript = '';
          }
        }, 1000);
      });
      await transcriber.connect();
      const audioStream = session.connection.receiver.subscribe(member.id, {
        end: { behavior: EndBehaviorType.Manual },
      });
      const decoder = new prism.opus.Decoder({
        rate: 48000, channels: 1, frameSize: 960,
      });
      const targetChunkSize = 48000 * 2 * 0.1;
      const chunker = new AudioChunker(targetChunkSize);
      const assemblyaiWritable = new Writable({
        write(chunk, encoding, callback) {
          if (transcriber && !transcriber.closed && session.connection.state.status === VoiceConnectionStatus.Ready) {
            transcriber.sendAudio(chunk);
          }
          callback();
        },
      });
      audioStream.pipe(decoder).pipe(chunker).pipe(assemblyaiWritable);
    } catch (error) {
      console.error('❌ Chat session error:', error);
      if (session.transcriber) {
        session.transcriber.close();
        session.transcriber = null;
      }
      session.isBotSpeaking = false;
      session.lastUserTranscript = '';
    }
  }
});

async function streamMurfAudio(text, session) {
  return new Promise(async (resolve, reject) => {
    console.log('🎙️ Starting new audio stream from Murf.ai...');

    if (session.connection.state.status !== VoiceConnectionStatus.Ready) {
      console.error('❌ Discord Voice Connection not ready. Cannot stream audio.');
      session.isBotSpeaking = false;
      session.lastUserTranscript = '';
      return reject(new Error('Discord Voice Connection not ready.'));
    }

    const WS_URL = `wss://api.murf.ai/v1/speech/stream-input?api-key=${process.env.MURF_API_KEY}&sample_rate=48000&channel_type=MONO&format=PCM`;
    const ws = new WebSocket(WS_URL);

    // Create a new MonoToStereo transform stream for each new audio playback
    const monoToStereo = new MonoToStereo();
    let audioResource = null; 
    let currentPlaybackPromise = null;  
 
    let playInitiated = false;

    ws.on('open', () => {
      console.log('🔗 Murf WebSocket connection opened');
      ws.send(JSON.stringify({
        voice_config: { voiceId: 'en-US-terrell', style: 'Conversational' }
      }));
      console.log(`🗣️ Streaming audio for text: "${text.substring(0, 80)}..."`);
      ws.send(JSON.stringify({ text, end: true }));
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.audio) {
          if (!monoToStereo.writableEnded && !monoToStereo.destroyed) {
            monoToStereo.write(Buffer.from(response.audio, 'base64'));
            // If we receive audio and haven't started playing, start now
            if (!playInitiated) {
              playAudioResource(session, monoToStereo, resolve, reject);
              playInitiated = true;
            }
          }
        }
        if (response.isFinalAudio) {
          console.log('Murf.ai signaled final audio.');
          if (!monoToStereo.writableEnded && !monoToStereo.destroyed) {
            monoToStereo.end();
          }
          ws.close(); // Close the Murf WebSocket when done
        }
      } catch (parseError) {
        console.error('❌ Error parsing Murf message:', parseError);
        ws.close();
        if (!monoToStereo.destroyed) monoToStereo.destroy(parseError);
        reject(parseError);
      }
    });

    ws.on('error', (err) => {
      console.error('❌ Murf WebSocket error:', err);
      if (!monoToStereo.destroyed) {
        monoToStereo.destroy(err);
      }
      reject(err);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔐 Murf WebSocket closed: ${code} - ${reason}`);
      
      if (!monoToStereo.writableEnded && !monoToStereo.destroyed) {
        monoToStereo.end();
      }
      // If WebSocket closes unexpectedly or no audio was sent at all, reject.
      if (code !== 1000 && !playInitiated) { 
        reject(new Error(`Murf WebSocket closed unexpectedly: ${reason} (Code: ${code})`));
      }
    });

    // Handle errors and end events for the MonoToStereo stream directly
    monoToStereo.on('end', () => {
      console.log('🎧 MonoToStereo stream ended (all data piped).');
    });

    monoToStereo.on('error', (err) => {
      console.error('🚨 MonoToStereo stream error:', err);
      ws.close();  
       
      if (session.player.state.status !== AudioPlayerStatus.Idle) {
        reject(err);
      }
    });

    async function playAudioResource(session, monoToStereoStream, resolvePromise, rejectPromise) {
      try {
        // Force stop the player to clear any lingering state
        if (session.player.state.status !== AudioPlayerStatus.Idle) {
          console.log(`Stopping player from state: ${session.player.state.status}`);
          session.player.stop(true);
        } else {
          console.log('Player already idle, no need to stop.');
        }

        // Small delay to allow player state to settle
        await new Promise(res => setTimeout(res, 50));

        // Create resource from the (potentially still writing) transform stream
        audioResource = createAudioResource(monoToStereoStream, {
          inputType: 'raw',
          inlineVolume: true,
        });
        audioResource.volume?.setVolume(0.8);

        // Clear previous listeners to prevent multiple resolutions/rejections
        session.player.removeAllListeners(AudioPlayerStatus.Idle);
        session.player.removeAllListeners('error');
        session.player.removeAllListeners(AudioPlayerStatus.Playing);
        session.player.removeAllListeners(AudioPlayerStatus.Buffering);
        session.player.removeAllListeners(AudioPlayerStatus.Paused);
        session.player.removeAllListeners(AudioPlayerStatus.AutoPaused);


         
        session.player.on(AudioPlayerStatus.Playing, () => {
          console.log('🎶 AudioPlayer is now Playing!');
        });
        session.player.on(AudioPlayerStatus.Buffering, () => {
          console.log('⏳ AudioPlayer is Buffering...');
        });
        session.player.on(AudioPlayerStatus.Paused, () => {
          console.log('⏸️ AudioPlayer is Paused.');
        });
        session.player.on(AudioPlayerStatus.AutoPaused, () => {
          console.log('⏯️ AudioPlayer is AutoPaused.');
        });

        currentPlaybackPromise = new Promise((res, rej) => {
          session.player.once(AudioPlayerStatus.Idle, () => {
            console.log('✅ Audio playback finished (Player Idle).');
            session.isBotSpeaking = false;
            session.lastUserTranscript = '';
            res();  
          });

          session.player.once('error', (error) => {
            console.error('🚨 Player error:', error);
            session.isBotSpeaking = false;
            session.lastUserTranscript = '';
            rej(error);  
          });
        });

        session.player.play(audioResource);
        console.log('Attempted to play new audio resource.');

        await currentPlaybackPromise;  
        resolvePromise();  
      } catch (playError) {
        console.error('❌ Error in playAudioResource:', playError);
        session.isBotSpeaking = false;
        session.lastUserTranscript = '';
        rejectPromise(playError);  
      }
    }
  });
}

process.on('SIGINT', () => {
  console.log('🛑 Shutting down bot...');
  sessionMap.forEach((session) => session.connection?.destroy());
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
