import {GeminiService} from '../services/gemini.js';
import {VoiceHandler} from './voice.js';

 export class SessionHandler {
    static async handleUserResponse(session, transcript) {
    if (!session.isActive || !transcript.trim()) {
      console.log("❌ Session not active or empty transcript");
      return;
    }

    console.log(`📝 Processing user response: ${transcript}`);

    // Stop listening temporarily while processing
    session.isListening = false;

    // Add answer to session
    session.addAnswer(transcript);

    let responseText;

    try {
      if (session.nextQuestion()) {
        // Evaluate current answer and ask next question
        const evaluation = await GeminiService.evaluateAnswer(
          session.questions[session.currentQuestionIndex - 2], // Previous question
          transcript,
          session.role
        );
        const nextQuestion = session.getCurrentQuestion();
        responseText = `${evaluation} Here's your next question: ${nextQuestion}`;
      } else {
        // Interview completed
        session.isActive = false;
        const finalFeedback = await GeminiService.generateFinalFeedback(session);
        responseText = `${finalFeedback} Thank you for completing the interview! You can use the leave command to disconnect.`;
      }

      // Convert response to speech and play
      await VoiceHandler.speakResponse(session, responseText);
      console.log("✅ Response delivered");

    } catch (error) {
      console.error("❌ Error processing user response:", error);
      
      // Fallback response
      const fallbackText = session.isActive 
        ? "I'm sorry, there was an error. Let's continue with the next question."
        : "Thank you for your response. The interview is now complete.";
      
      await VoiceHandler.speakResponse(session, fallbackText);
    }
  }
}