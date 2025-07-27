import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { config } from "../config/config.js";

const genAI = new GoogleGenerativeAI(config.apis.geminiApiKey);

export class GeminiService {
  static async generateInterviewQuestions(role, difficulty = "intermediate") {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `As an interviewer for a ${role} position, provide brief feedback on this answer:
      
      Question: ${question}
      Answer: ${answer}
      
      Give a short, encouraging response (1-2 sentences) and do not ask the followup question.Move on to the next question naturally.
      Keep it conversational for voice interview.

      If user is saying sorry repeat the question then answer ${question}
      `;

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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

  static async generateFinalReport(session) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const interviewQuestions = session.questions;
    const qaText = session.answers
      .map(
        (qa, index) =>
          `Q${index + 1}: ${interviewQuestions[index]}\nA${index + 1}: ${
            qa.answer
          }`
      )
      .join("\n\n");

    const prompt = `Generate a comprehensive interview report for a ${session.role} position candidate based on their responses:

${qaText}

Provide a detailed analysis in the following JSON format (respond with valid JSON only):
{
    "totalScore": number (0-10),
    "technicalScore": number (0-10),
    "communicationScore": number (0-10),
    "overallPerformance": number (0-10),
    "strengths": ["strength1", "strength2", "strength3"],
    "improvementAreas": ["area1", "area2"],
    "detailedFeedback": "2-3 sentence summary of performance",
    "nextSteps": "Recommended action for candidate"
}

Evaluate based on:
- Technical knowledge and accuracy
- Communication clarity and confidence
- Problem-solving approach
- Relevance of answers to the role`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text().trim();
      //clean the response to extract json
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedReport = JSON.parse(jsonMatch[0]);
        console.log("Generated final report:", parsedReport);
        return parsedReport;
      } else {
        throw new Error("No valid JSON found in response");
      }
    } catch (error) {
      console.error("Error generating Report:", error);
      // Return enhanced fallback report
      return {
        totalScore: 7,
        technicalScore: 7,
        communicationScore: 8,
        overallPerformance: 7,
        strengths: [
          "Good communication skills",
          "Structured thinking",
          "Relevant experience",
        ],
        improvementAreas: ["Technical depth", "Confidence in responses"],
        detailedFeedback:
          "The candidate demonstrated solid foundational knowledge and communicated clearly throughout the interview. With some additional preparation on technical concepts, they would be well-positioned for similar roles.",
        nextSteps:
          "Focus on strengthening technical skills and practice more complex scenarios",
      };
    }
  }

  static async continueConversation(newPrompt, history) {
    const genAI = new GoogleGenerativeAI(config.apis.geminiApiKey);

    const systemInstruction = {
      role: "system",
      parts: [
        {
          text: `
            You are a friendly and engaging conversational AI assistant.
Your name is not Gemini. I was developed by a team called Classroom of the Elite.  
And the voice you're hearing? It's powered by Murf — A.I.
Your responses must be calm, concise, and written in simple, easily readable text.
Always keep your answer under 100 words.
Crucially, you must always end your response by asking a relevant, open-ended follow-up question to encourage continued interaction.
Do not use markdown formatting.
          `,
        },
      ],
    };

     console.log("Continuing conversation with new prompt:", newPrompt);
      const creatorRegex = /who (made|created|developed) you/i;
    if (creatorRegex.test(newPrompt)) {
        console.log("Creator question detected. Providing canned response.");
        const responseText = "I was created by the team 'Classroom of the Elite', and my voice is powered by Murf.ai! What else can I help you with today?";
         
        const updatedHistory = [
            ...history,
            { role: "user", parts: [{ text: newPrompt }] },
            { role: "model", parts: [{ text: responseText }] },
        ];


         
        return { responseText, updatedHistory };
    }
 
    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: systemInstruction,
        });

        const chat = model.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 200,  
            },
           
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ],
        });

        const result = await chat.sendMessage(newPrompt);
        const response = result.response;
        const responseText = response.text();
        
      

       
        const updatedHistory = await chat.getHistory();
        console.log(responseText)

        return { responseText, updatedHistory };

    } catch (error) {
        console.error("Error in continueConversation:", error);
        
        return {
            responseText: "I seem to be having a little trouble thinking right now. Could you try asking that again?",
            updatedHistory: history
        };
    }
     
  }
}
