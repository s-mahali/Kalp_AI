import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/config.js";

const genAI = new GoogleGenerativeAI(config.apis.geminiApiKey);

export class GeminiService {
  static async generateInterviewQuestions(role, difficulty = "intermediate") {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Generate 5 technical interview questions for a ${role} position at ${difficulty} level. 
      Format the response as a JSON array of strings. Questions should be practical and relevant to the role.
      For backend nodejs role, include questions about Node.js, databases, APIs, authentication, etc.
      Keep questions concise for voice interview format.
      
      Example format:
      ["Question 1 here", "Question 2 here", "Question 3 here", "Question 4 here", "Question 5 here"]`;

    try {
      const result = await model.generateContent(prompt);
      if (result?.response.text()) {
        let cleanedText = result.response
          .text()
          .replace(/```json|```/g, "")
          .trim();
        console.log("cleanedText", cleanedText);
        return JSON.parse(cleanedText);
      }
    } catch (error) {
      console.error("Error generating questions:", error?.message);
      return [
        "Can you explain the event loop in Node.js?",
        "What's the difference between SQL and NoSQL databases?",
        "How would you implement user authentication in a Node.js app?",
        "Explain middleware in Express.js with an example.",
        "How would you optimize a slow Node.js application?",
      ];
    }
  }

  static async evaluateAnswer(question, answer, role) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `As an interviewer for a ${role} position, provide brief feedback on this answer:
      
      Question: ${question}
      Answer: ${answer}
      
      Give a short, encouraging response (1-2 sentences) and then ask the next question naturally.
      Keep it conversational for voice interview.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result?.response;
      console.log("followup Question", response.text());
      return response.text();
    } catch (error) {
      console.error("Error evaluating answer:", error);
      return "Thank you for that answer. Let's move on to the next question.";
    }
  }

  static async generateFinalFeedback(session) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const qaText = session.answers
      .map(
        (qa, index) =>
          `Q${index + 1}: ${qa.question}\nA${index + 1}: ${qa.answer}`
      )
      .join("\n\n");

    const prompt = `Provide brief overall interview feedback for a ${session.role} candidate:

${qaText}

Give encouraging feedback in 2-3 sentences covering:
- Overall performance
- Key strengths
- One area for improvement

Keep it conversational and positive for voice delivery.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      console.log("final feedback", response.text());
      return response.text();
    } catch (error) {
      console.error("Error generating feedback:", error);
      return "Great job completing the interview! Keep practicing and you'll continue to improve.";
    }
  }
}
