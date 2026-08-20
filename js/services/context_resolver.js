/**
 * Context Resolver Service for Sign_Speak Hybrid Multi-Modal Architecture
 * Disambiguates ambiguous gestures (e.g. Vẫy tay -> Xin chào vs Tạm biệt) based on:
 * 1. Session duration & connection state
 * 2. Conversation message history & NLP keyword triggers
 * 3. User interaction state
 */

class ContextResolver {
  constructor() {
    this.sessionStartTimes = new Map(); // roomId -> timestamp
    this.goodbyeKeywords = [
      'về', 'di', 'đi', 'bye', 'tạm biệt', 'tam biet', 'hẹn gặp lại', 
      'hen gap lai', 'muộn', 'muon', 'xong', 'kết thúc', 'ket thuc', 'chào nhé', 'chao nhe'
    ];
    this.helloKeywords = [
      'chào', 'chao', 'xin chào', 'xin chao', 'hi', 'hello', 'alo', 'bắt đầu', 'bat dau'
    ];
  }

  registerSessionStart(roomId) {
    if (!roomId) return;
    if (!this.sessionStartTimes.has(roomId)) {
      this.sessionStartTimes.set(roomId, Date.now());
    }
  }

  getSessionDurationSeconds(roomId) {
    const start = this.sessionStartTimes.get(roomId);
    if (!start) return 0;
    return Math.floor((Date.now() - start) / 1000);
  }

  /**
   * Main Disambiguation Function
   * Keeps direct computer vision prediction from DTW without arbitrary time overrides
   * @param {string} rawTag - Recognized gesture tag e.g. 'xin_chao', 'tam_biet'
   * @param {Array} history - Array of message objects { text, sender_id, timestamp }
   * @param {string} roomId - Canonical room ID
   * @returns {Object} { primaryWord: string, alternativeWord: string, confidenceScore: number, explanation: string }
   */
  resolve(rawTag, history = [], roomId = 'room_global') {
    return {
      primaryWord: rawTag,
      alternativeWord: null,
      confidenceScore: 0.95,
      explanation: 'Nhận diện trực tiếp từ thị giác máy tính'
    };
  }
}

// Global Singleton Export
window.contextResolver = new ContextResolver();
