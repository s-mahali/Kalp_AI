import { GeminiService } from "../services/gemini.js";
import { MurfService } from "../services/murf.js";

export async function handleTranscript(transcript, session) {
  console.log(`👤 User finished speaking: ${transcript}`);
  
  

  try {
    let responseText;

    if (session.mode === "conversation") {
      const { responseText: res, updatedHistory } =
        await GeminiService.continueConversation(transcript, session.chatHistory);
      session.chatHistory = updatedHistory;
      responseText = res;
    } else {
      session.addAnswer(transcript);
      if (session.nextQuestion()) {
        const evaluation = await GeminiService.evaluateAnswer(
          session.questions[session.currentQuestionIndex - 2],
          transcript,
          session.role
        );
        responseText = `${evaluation} ${session.getCurrentQuestion()}`;
      } else {
        session.isActive = false;
        const finalFeedback = await GeminiService.generateFinalFeedback(session);
        responseText = `${finalFeedback} Thank you for completing the interview!`;
      }
    }

    console.log(`🤖 Gemini response: ${responseText}`);
    await MurfService.textToSpeech(responseText, session);

  } catch (err) {
    console.error("❌ AI/TTS error:", err.message);
    session.isSpeaking = false;

    const fallback = session.isActive
      ? "Sorry, something went wrong. Let's continue."
      : "Thanks for your time. Interview is complete.";

    await MurfService.textToSpeech(fallback, session);
  }
}

