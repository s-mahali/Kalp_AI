// import { config } from "../config/config.js";
// import {
//   AudioPlayerStatus,
//   createAudioResource,
//   VoiceConnectionStatus,
// } from "@discordjs/voice";
// import {MonoToStereo} from "../utils/audio.js"
// import {WebSocket} from 'ws'
// // export class MurfService {
// //   static async textToSpeech(text, session) {
// //     return new Promise((resolve, reject) => {
// //       //Check if the voice connection is still active
// //       if (session.connection?.state.status !== VoiceConnectionStatus.Ready) {
// //         console.error(
// //           "❌ Discord Voice connection is not ready, cannot convert text to speech"
// //         );
// //         session.isSpeaking = false;
// //         return reject(
// //           new Error(
// //             "Discord Voice connection is not ready, cannot convert text to speech"
// //           )
// //         );
// //       }

// //       const WS_URL = `wss://api.murf.ai/v1/speech/stream-input?api-key=${config.apis.murfApiKey}&sample_rate=48000&channel_type=MONO&format=PCM`;
// //       const ws = new WebSocket(WS_URL);

// //       //This transform stream converts Murf's mono audio to stereo for Discord
// //       const monoToStereo = new MonoToStereo();
// //       let playInitiated = false;

// //       ws.on("open", () => {
// //         console.log("Murf WebSocket connection opened");
// //         //Send voice configuration
// //         ws.send(
// //           JSON.stringify({
// //             voice_config: {
// //               voiceId: "en-US-Ken",
// //               style: "Conversational",
// //             },
// //           })
// //         );
// //         //send the text to be synthesized
// //         ws.send(
// //           JSON.stringify({
// //             text,
// //             end: true,
// //           })
// //         );
// //       });

// //       ws.on("message", (data) => {
// //         const response = JSON.parse(data.toString());
// //         if (response.audio) {
// //           //As audio chunks arrive, write them to our convertor stream

// //           if (!monoToStereo.writableEnded) {
// //             monoToStereo.write(Buffer.from(response.audio, "base64"));
// //           }
// //           //Start playing the audio as soon as the first chunk arrives
// //           if (!playInitiated) {
// //             const audioResource = createAudioResource(monoToStereo, {
// //               inputType: "raw",
// //             });
// //             session.audioPlayer.play(audioResource);
// //             playInitiated = true;

// //             //Handle playback finishing
// //             session.audioPlayer.once(AudioPlayerStatus.Idle, () => {
// //               console.log(" Audio playback finished");
// //               session.isSpeaking = false;
// //               ws.close();
// //               resolve();
// //             });

// //             session.audioPlayer.once("error", (error) => {
// //               console.error("❌ Audio playback error:", error);
// //               session.isSpeaking = false;
// //               ws.close();
// //               reject(error);

// //             });
// //           }
// //         }

// //         if (response.isFinalAudio) {
// //           //When Murf signals it's done, end the convertor stream
// //           if (!monoToStereo.writableEnded) {
// //             monoToStereo.end();
// //           }
// //         }
// //       });

// //       ws.on("error", (error) => {
// //         console.error("❌ Murf WebSocket error:", error);
// //         if (!monoToStereo.destroyed) {
// //           monoToStereo.destroy(error);

// //         }
// //         session.isSpeaking = false;
// //         reject(error);

// //       });

// //       ws.on("close", (code, reason) => {
// //         console.log(`🔐 Murf WebSocket closed: ${code} - ${reason.toString()}`);
// //         // If the stream hasn't ended properly, end it now
// //         if (!monoToStereo.writableEnded) {
// //           monoToStereo.end();

// //         }
// //       });
// //     });
// //   }
// // }

// export class MurfService {
//   static async textToSpeech(text, session) {
//     return new Promise((resolve, reject) => {
//       // Validate Discord voice connection
//       if (session.connection?.state.status !== VoiceConnectionStatus.Ready) {
//         console.error("❌ Discord voice connection is not ready.");
//         session.isSpeaking = false;
//         return reject(new Error("Voice connection not ready."));
//       }

//       // Reset playback state
//       session.isSpeaking = true;
//       session.hasPlaybackFinished = false;

//       if (!session.murfSocket || session.murfSocket.readyState !== WebSocket.OPEN) {
//         const WS_URL = `wss://api.murf.ai/v1/speech/stream-input?api-key=${config.apis.murfApiKey}&sample_rate=48000&channel_type=MONO&format=PCM`;
//         const ws = new WebSocket(WS_URL);
//         session.murfSocket = ws;

//         // Transform stream
//         session.monoToStereo = new MonoToStereo();
//         let playInitiated = false;

//         ws.on("open", () => {
//           console.log("✅ Murf WebSocket connected");

//           ws.send(
//             JSON.stringify({
//               voice_config: {
//                 voiceId: "en-US-Ken",
//                 style: "Conversational",

//               },
//             })
//           );

//           // Now send text
//           ws.send(JSON.stringify({ text, end: true }));
//         });

//         ws.on("message", (data) => {
//           const response = JSON.parse(data.toString());

//           if (response.audio) {
//             const audioChunk = Buffer.from(response.audio, "base64");
//             if (!session.monoToStereo.writableEnded) {
//               session.monoToStereo.write(audioChunk);
//             }

//             if (!playInitiated) {
//               const audioResource = createAudioResource(session.monoToStereo, {
//                 inputType: "raw",
//               });

//               session.audioPlayer.play(audioResource);
//               playInitiated = true;

//               session.audioPlayer.once(AudioPlayerStatus.Idle, () => {
//                 session.hasPlaybackFinished = true;
//                 setTimeout(() => (session.isSpeaking = false), 150);
//                 if (ws.readyState === WebSocket.OPEN) ws.close();
//                 resolve();
//               });

//               session.audioPlayer.once("error", (err) => {
//                 console.error("❌ Audio playback error:", err);
//                 session.isSpeaking = false;
//                 ws.close();
//                 reject(err);
//               });
//             }
//           }

//           if (response.isFinalAudio && !session.monoToStereo.writableEnded) {
//             session.monoToStereo.end();
//           }
//         });

//         ws.on("error", (err) => {
//           console.error("❌ Murf WebSocket error:", err.message);
//           if (!session.monoToStereo.destroyed) session.monoToStereo.destroy(err);
//           session.isSpeaking = false;
//           reject(err);
//         });

//         ws.on("close", (code, reason) => {
//           console.log(`🔐 Murf WebSocket closed: ${code} - ${reason || "No reason"}`);
//           session.murfSocket = null;
//           if (!session.hasPlaybackFinished) {
//             session.isSpeaking = false;
//             reject(new Error("TTS closed before finishing playback."));
//           }
//         });
//       } else {
//         console.log("📡 Murf WebSocket already connected.");
//         session.murfSocket.send(JSON.stringify({ text, end: true }));
//       }
//     });
//   }
// }

// services/murf.js

import { config } from "../config/config.js";
import {
  AudioPlayerStatus,
  createAudioResource,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { MonoToStereo } from "../utils/audio.js";
import { WebSocket } from "ws";

export class MurfService {
  static async textToSpeech(text, session) {
    try {
      return new Promise((resolve, reject) => {
        // 1. Check for a valid voice connection
        if (session.connection?.state.status !== VoiceConnectionStatus.Ready) {
          console.error("❌ Discord Voice connection is not ready.");
          // CRITICAL FIX: Do not manage isSpeaking here. Let VoiceHandler do it.
          return reject(new Error("Voice connection not ready."));
        }

        const WS_URL = `wss://api.murf.ai/v1/speech/stream-input?api-key=${config.apis.murfApiKey}&sample_rate=48000&channel_type=MONO&format=PCM`;
        const ws = new WebSocket(WS_URL);

        // This transform stream converts Murf's mono audio to stereo for Discord
        const monoToStereo = new MonoToStereo();
        let playInitiated = false;

        ws.on("open", () => {
          console.log("✅ Murf WebSocket connection opened for TTS.");
          // Send voice configuration
          ws.send(
            JSON.stringify({
              voice_config: {
                voiceId: "en-US-Ken",
                style: "Conversational",
              },
            })
          );
          // Send the text to be synthesized
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
            // As audio chunks arrive, write them to our converter stream
            if (!monoToStereo.writableEnded) {
              monoToStereo.write(Buffer.from(response.audio, "base64"));
            }

            if (!session.audioPlayer) {
              console.error(
                "FATAL: textToSpeech was called but session.audioPlayer is NOT ready!"
              );
              ws.close();
              return reject(new Error("Audio player not available."));
            }
            // Start playing the audio as soon as the first chunk arrives
            if (!playInitiated) {
              const audioResource = createAudioResource(monoToStereo, {
                inputType: "raw",
              });
              session.audioPlayer.play(audioResource);
              playInitiated = true;

              // The 'Idle' event in VoiceHandler will set isSpeaking to false.
              // We just need to resolve the promise here so the logic can continue.
              session.audioPlayer.once(AudioPlayerStatus.Idle, () => {
                console.log("Audio playback finished, resolving TTS promise.");
                ws.close();
                resolve();
              });

              session.audioPlayer.once("error", (error) => {
                console.error("❌ Audio playback error:", error);
                ws.close();
                reject(error);
              });
            }
          }

          if (response.isFinalAudio) {
            // When Murf signals it's done, end the converter stream
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
          reject(error);
        });

        ws.on("close", (code, reason) => {
          console.log(
            `🔐 Murf WebSocket closed: ${code} - ${reason.toString()}`
          );
          // If the stream hasn't ended, ensure it does to prevent leaks.
          if (!monoToStereo.writableEnded) {
            monoToStereo.end();
          }
        });
      });
    } catch (error) {
      console.error("Error in MurfService", error?.message);
      return null;
    }
  }
}
