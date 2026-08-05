/**
 * Vietnamese Speech-to-Text (STT) Service for Sign_Speak
 * Uses Web Speech Recognition API (vi-VN) supported on Chrome & Edge.
 * Automatically triggers dynamic TTS voice playback for recognized speech & custom words.
 */

class STTService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onResultCallback = null;
    this.onErrorCallback = null;
    this.autoSpeak = false;

    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Trình duyệt không hỗ trợ Web Speech Recognition API. Vui lòng dùng Chrome/Edge.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'vi-VN';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript.trim() !== '') {
        console.log(`[STT Recognized]: "${finalTranscript}"`);
      }

      if (this.onResultCallback) {
        this.onResultCallback({
          final: finalTranscript.trim(),
          interim: interimTranscript.trim()
        });
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn("Lỗi Web Speech STT:", event.error);
      }
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          // ignore
        }
      }
    };
  }

  startListening(onResult, onError) {
    if (!this.recognition) {
      if (onError) onError('unsupported_browser');
      return;
    }

    this.onResultCallback = onResult;
    this.onErrorCallback = onError;
    this.isListening = true;

    try {
      this.recognition.start();
      console.log("Đã bật STT (vi-VN)...");
    } catch (e) {
      console.warn("STT đã hoạt động hoặc gặp sự cố:", e);
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.recognition) {
      this.recognition.stop();
      console.log("Đã dừng STT.");
    }
  }
}

window.sttService = new STTService();
