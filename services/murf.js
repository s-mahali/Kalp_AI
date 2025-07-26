import axios from "axios";
import { config } from "../config/config.js";
import {
  AudioPlayerStatus,
  createAudioResource,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import {MonoToStereo} from "../utils/audio.js"
import {WebSocket} from 'ws'
export class MurfService {
  static async textToSpeech(text, session) {
    return new Promise((resolve, reject) => {
      //Check if the voice connection is still active
      if (session.connection?.state.status !== VoiceConnectionStatus.Ready) {
        console.error(
          "❌ Discord Voice connection is not ready, cannot convert text to speech"
        );
        session.isSpeaking = false;
        return reject(
          new Error(
            "Discord Voice connection is not ready, cannot convert text to speech"
          )
        );
      }

      const WS_URL = `wss://api.murf.ai/v1/speech/stream-input?api-key=${config.apis.murfApiKey}&sample_rate=48000&channel_type=MONO&format=PCM`;
      const ws = new WebSocket(WS_URL);

      //This transform stream converts Murf's mono audio to stereo for Discord
      const monoToStereo = new MonoToStereo();
      let playInitiated = false;

      ws.on("open", () => {
        console.log("Murf WebSocket connection opened");
        //Send voice configuration
        ws.send(
          JSON.stringify({
            voice_config: {
              voiceId: "en-US-Ken",
              style: "Conversational",
            },
          })
        );
        //send the text to be synthesized
        ws.send(
          JSON.stringify({
            text,
            end: true,
          })
        );
      });

      ws.on("message", (data) => {
        const response = JSON.parse(data.toString());
        if (response.audio) {
          //As audio chunks arrive, write them to our convertor stream
           
          if (!monoToStereo.writableEnded) {
            monoToStereo.write(Buffer.from(response.audio, "base64"));
          }
          //Start playing the audio as soon as the first chunk arrives
          if (!playInitiated) {
            const audioResource = createAudioResource(monoToStereo, {
              inputType: "raw",
            });
            session.audioPlayer.play(audioResource);
            playInitiated = true;

            //Handle playback finishing
            session.audioPlayer.once(AudioPlayerStatus.Idle, () => {
              console.log(" Audio playback finished");
              session.isSpeaking = false;
              ws.close();
              resolve();
            });

            session.audioPlayer.once("error", (error) => {
              console.error("❌ Audio playback error:", error);
              session.isSpeaking = false;
              ws.close();
              reject(error);
              
            });
          }
        }

        if (response.isFinalAudio) {
          //When Murf signals it's done, end the convertor stream
          if (!monoToStereo.writableEnded) {
            monoToStereo.end();
          }
        }
      });

      ws.on("error", (error) => {
        console.error("❌ Murf WebSocket error:", error);
        if (!monoToStereo.destroyed) {
          monoToStereo.destroy(error);
          
        }
        session.isSpeaking = false;
        reject(error);
        
      });

      ws.on("close", (code, reason) => {
        console.log(`🔐 Murf WebSocket closed: ${code} - ${reason.toString()}`);
        // If the stream hasn't ended properly, end it now
        if (!monoToStereo.writableEnded) {
          monoToStereo.end();
          
        }
      });
    });
  }
}
