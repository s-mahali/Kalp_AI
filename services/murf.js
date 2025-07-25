import axios from 'axios';
import {config} from "../config/config.js";

export class MurfService {
    static async textToSpeech(text) {
    try {
      const response = await axios.post(
        "https://api.murf.ai/v1/speech/generate",
        {
          text: text,
          voice_id: "en-US-Ken",
          format: "WAV",
          sample_rate: 48000,
        },
        {
          headers: {
            "api-key": config.apis.murfApiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (response?.data && response?.data.audioFile) {
        const audioResponse = await axios.get(response.data.audioFile, {
          responseType: "arraybuffer",
        });
        console.log("audioResponse", audioResponse.data);
        return Buffer.from(audioResponse.data);
      }
      return null;
    } catch (error) {
      console.error("Error with Murf AI:", error);
      return null;
    }
  }
}