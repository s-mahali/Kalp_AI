# Kulp AI Discord Bot -

Welcome to the **Kulp AI** 
Built by **S Mahali** and **Vishal Kumar** for the **Murf AI** Coding Challenge, this project powers **Kulp AI**, a Discord bot that helps users practice mock interviews and improve communication skills through real-time voice conversations.

---

## What is Kulp AI?

Kulp AI is an AI-powered Discord bot designed to:
- **Conduct technical mock interviews** tailored to different roles and difficulty levels.
- **Engage in free-form conversations** to help users improve their spoken English and confidence.
- **Provide real-time feedback** on answers and overall performance.
- **Support natural, interactive voice-based practice.**

---

## Key Features

- **Interview Practice:**  
  Choose a role (e.g., Backend Node.js Developer, Frontend React Developer, DevOps Engineer) and difficulty. Kulp AI generates questions using Gemini and evaluates your responses conversationally.

- **Free Conversation Mode:**  
  Chat with Kulp AI in your voice channel for open-ended practice, powered by AI.

- **Real-Time Voice:**  
  Speak naturally; the bot listens, transcribes, responds, and speaks back instantly.

- **AI Stack:**
  - **Gemini (Google Generative AI):** Generates interview questions, evaluates answers, and provides feedback.
  - **Murf AI:** Converts Kulp AI’s text responses into high-quality voice (TTS).
  - **AssemblyAI:** Streams and transcribes user speech in real time (STT).
   **DiscordJs**

---

## How Does It Work?

### 1. **Join a Voice Channel**
- Use `/join-interview` (or `/conversation`) to invite Kulp AI.
- Select your desired interview role and difficulty.

### 2. **Interview Flow**
- Kulp AI asks questions, listens to your spoken answers, and evaluates them using Gemini.
- All communication is in real time.
- At the end, you'll receive overall feedback and encouragement.

### 3. **Free Conversation**
- Use `/conversation` to start chatting with Kulp AI for casual practice.
- End the session with `/end-conversation`.

### 4. **Voice Tech Stack**
- **AssemblyAI** captures and transcribes your speech.
- **Gemini** processes the text and generates a relevant response.
- **Murf AI** streams the response as natural speech back to Discord.

---

## Setup Instructions

### 1. **Clone the Repo**
```bash
git clone https://github.com/s-mahali/skillspar.git
cd skillspar
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Configure Environment**
Create a `.env` file with your API keys and Discord bot credentials:
```
DISCORD_TOKEN=your_discord_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id

GEMINI_API_KEY=your_gemini_api_key
MURF_API_KEY=your_murf_api_key
ASSEMBLY_API_KEY=your_assemblyai_api_key
```

### 4. **Run the Bot**
```bash
npm start
```
Or for development:
```bash
npm run dev
```

---

## Commands

- `/join-interview` – Start a mock interview.
- `/leave-interview` – End your interview session.
- `/interview-status` – Check your current session status.
- `/conversation` – Start a free-form conversation.
- `/end-conversation` – End conversational mode.

---

## Code Structure

- `services/gemini.js` – Handles question generation, answer evaluation, and feedback using Gemini.
- `services/murf.js` – Manages real-time TTS streaming with Murf AI.
- `services/assemblyai.js` – Provides real-time STT via AssemblyAI.
- `handlers/command.js` – Discord command definitions and logic.
- `utils/audio.js` – Audio processing helpers for Discord voice.
- `utils/HandleTranscript.js` – Conversation and interview flow.
- `config/config.js` – Loads environment/config variables.
- `index.js` – Entry point and Discord client setup.

---

## Authors

- **S Mahali** ([GitHub](https://github.com/s-mahali))
- **Vishal Kumar** ([GitHub](https://github.com/Vishalpandey1799))

---

## Notes

- This project is a prototype for the Murf AI hackathon.  
- All AI APIs require proper keys and usage plans.
- For more details, see the source files or [browse the repo on GitHub](https://github.com/s-mahali/skillspar).

---

## License

MIT
