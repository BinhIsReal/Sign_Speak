/**
 * Context Resolver Service for Sign_Speak VSL Hybrid Multi-Modal Architecture
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
   * @param {string} rawTag - Recognized gesture tag e.g. 'xin_chao', 'vau_tay', 'tam_biet'
   * @param {Array} history - Array of message objects { text, sender_id, timestamp }
   * @param {string} roomId - Canonical room ID
   * @returns {Object} { primaryWord: string, alternativeWord: string, confidenceScore: number, explanation: string }
   */
  resolve(rawTag, history = [], roomId = 'room_global') {
    const cleanTag = (rawTag || '').toLowerCase().trim();

    // Check if the gesture is ambiguous (Vẫy tay / Xin chào / Tạm biệt)
    const isWaveGesture = cleanTag === 'xin_chao' || cleanTag === 'vau_tay' || cleanTag === 'tam_biet' || cleanTag === 'wave';

    if (!isWaveGesture) {
      return {
        primaryWord: rawTag,
        alternativeWord: null,
        confidenceScore: 0.95,
        explanation: 'Cử chỉ đơn nghĩa'
      };
    }

    this.registerSessionStart(roomId);
    const durationSec = this.getSessionDurationSeconds(roomId);
    const msgCount = history ? history.length : 0;

    let hasGoodbyeTrigger = false;
    let hasHelloTrigger = false;

    if (history && history.length > 0) {
      const recentMessages = history.slice(-3); // Check last 3 messages
      for (const msg of recentMessages) {
        const text = (msg.text || '').toLowerCase();
        if (this.goodbyeKeywords.some(kw => text.includes(kw))) {
          hasGoodbyeTrigger = true;
        }
        if (this.helloKeywords.some(kw => text.includes(kw))) {
          hasHelloTrigger = true;
        }
      }
    }

    // Rule 1: New session or zero history -> Definitely "Xin chào"
    if (msgCount === 0 || durationSec < 90) {
      if (hasGoodbyeTrigger) {
        return {
          primaryWord: 'Tạm biệt',
          alternativeWord: 'Xin chào',
          confidenceScore: 0.88,
          explanation: 'Phát hiện từ khóa chia tay trong tin nhắn gần nhất'
        };
      }
      return {
        primaryWord: 'Xin chào',
        alternativeWord: 'Tạm biệt',
        confidenceScore: 0.96,
        explanation: 'Đầu cuộc hội thoại (Session < 90s)'
      };
    }

    // Rule 2: Prolonged conversation (> 3 minutes) or contains farewell trigger -> "Tạm biệt"
    if (hasGoodbyeTrigger || durationSec > 180) {
      return {
        primaryWord: 'Tạm biệt',
        alternativeWord: 'Xin chào',
        confidenceScore: 0.92,
        explanation: 'Cuộc hội thoại đã diễn ra dài hoặc có từ khóa chia tay'
      };
    }

    // Default Fallback
    return {
      primaryWord: 'Xin chào',
      alternativeWord: 'Tạm biệt',
      confidenceScore: 0.85,
      explanation: 'Ngữ cảnh mặc định'
    };
  }
}

// Global Singleton Export
window.contextResolver = new ContextResolver();
