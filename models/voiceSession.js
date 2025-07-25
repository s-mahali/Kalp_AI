export class VoiceInterviewSession {
    constructor(userId, guildId, channelId, role, difficulty = "intermediate") {
        this.userId = userId;
        this.guildId = guildId;
        this.channelId = channelId;
        this.role = role;
        this.difficulty = difficulty;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = [];
        this.startTime = new Date();
        this.isActive = false;
        this.isListening = false;
        this.isSpeaking = false; //Track when bot is speaking 
        this.connection = null;
        this.audioPlayer = null;
        this.transcriber = null;
        this.currentTranscript = "";
        this.audioStram = null;
        this.botUserId = null; 
        this.decoder = null;
        this.bufferAggregator = null;


    }

    addAnswer(answer){
        this.answers.push({
            question: this.questions[this.currentQuestionIndex - 1],
            answer: answer,
        })
    }

    nextQuestion(){
        this.currentQuestionIndex++;
        return this.currentQuestionIndex < this.questions.length;
    }

    getCurrentQuestion(){
        return this.questions[this.currentQuestionIndex];
    }

    isComplete(){
        return this.currentQuestionIndex >= this.questions.length;
    }

    setBotSpeaking(speaking){
        this.isSpeaking = speaking;
        if(speaking){
            this.isListening = false; // Don't listen when bot is speaking
        }
    }

    async cleanup(){
        this.isActive = false;
        this.isListening = false;

        if(this.transcriber){
            try {
                 await this.transcriber.close();
            } catch (error) {
                console.error("Error closing transcriber:", error)
            }
            this.transcriber = null;
        }

        if(this.audioStram){
            try {
                 this.audioStram.destroy();
            } catch (error) {
                 console.error("Error closing audioStream:", error)
            }
            this.audioStram = null;
        }

        if(this.connection){
            try {
                this.connection.destroy();
            } catch (error) {
                console.error("Error destroying connection:", error)
            }
            this.connection = null;
        }
        this.decoder = null;
        this.bufferAggregator = null;
        this.audioPlayer = null;
    }
}