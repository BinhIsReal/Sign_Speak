/**
 * Vietnamese Speech-to-Text (STT) Service for Sign_Speak
 * Uses Web Speech Recognition API (vi-VN) supported on Chrome & Edge.
 *
 * NOTE: Web Speech API routes audio to Google's servers. Brave browser
 * intentionally blocks this connection for privacy reasons - there is no
 * fix for Brave without using a different backend (e.g. Whisper.js).
 */

class STTService {
  constructor() {
    this.recognition          = null;
    this._SpeechRec           = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.isListening          = false;
    this.onResultCallback     = null;
    this.onErrorCallback      = null;
    this.restartDelay         = 300;
    this.restartTimer         = null;
    this.consecutiveErrors    = 0;
    this.maxConsecutiveErrors = 5;

    if (this._SpeechRec) {
      this._buildRecognizer();
    } else {
      console.warn('[STTService] Web Speech API not supported. Use Chrome or Edge.');
    }
  }

  // ─── Engine name (for UI display) ────────────────────────────
  get engineName() { return 'Web Speech API'; }
  get requiresModelDownload() { return false; }

  // ─── Build / Rebuild recognizer ──────────────────────────────
  _buildRecognizer() {
    if (!this._SpeechRec) return;

    if (this.recognition) {
      try { this.recognition.abort(); } catch (e) {}
    }

    this.recognition                 = new this._SpeechRec();
    this.recognition.lang            = 'vi-VN';
    this.recognition.continuous      = false;   // Short sessions = more stable network
    this.recognition.interimResults  = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let finalText   = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        event.results[i].isFinal ? (finalText += t) : (interimText += t);
      }

      if (finalText.trim()) {
        this.consecutiveErrors = 0;
        this.restartDelay      = 300;
        console.log(`[STTService] Final: "${finalText}"`);
      }

      if (this.onResultCallback) {
        this.onResultCallback({ final: finalText.trim(), interim: interimText.trim() });
      }
    };

    this.recognition.onerror = (event) => {
      // Silently ignore these
      if (['no-speech', 'aborted'].includes(event.error)) return;

      if (event.error === 'network') {
        this.consecutiveErrors++;
        this.restartDelay = Math.min(this.restartDelay * 2, 6000);

        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          console.warn('[STTService] Too many network errors - disabling STT.');
          this.isListening = false;
          if (this.onErrorCallback) this.onErrorCallback('network_persistent');
          return;
        }
        // Will retry via onend with backoff - don't call error callback yet
        return;
      }

      if (event.error === 'not-allowed') {
        this.isListening = false;
      }

      if (this.onErrorCallback) this.onErrorCallback(event.error);
    };

    this.recognition.onend = () => {
      if (!this.isListening) return;

      if (this.restartTimer) clearTimeout(this.restartTimer);

      // Rebuild a fresh recognizer each time to avoid Chrome internal state issues
      this.restartTimer = setTimeout(() => {
        if (!this.isListening) return;
        this._buildRecognizer();
        try { this.recognition.start(); } catch (e) {}
      }, this.restartDelay);
    };
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * @param {Function}    onResult        - ({ final, interim }) => void
   * @param {Function}    onError         - (errorCode: string) => void
   * @param {MediaStream} existingStream  - WebRTC local stream (optional)
   * @param {Function}    onStatus        - ignored (kept for API compat)
   */
  startListening(onResult, onError, existingStream = null, onStatus = null) {
    if (!this._SpeechRec) {
      if (onError) onError('unsupported_browser');
      return;
    }

    this.onResultCallback  = onResult;
    this.onErrorCallback   = onError;
    this.isListening       = true;
    this.consecutiveErrors = 0;
    this.restartDelay      = 300;

    // Rebuild fresh recognizer to guarantee clean state
    this._buildRecognizer();

    const doStart = () => {
      try {
        this.recognition.start();
        console.log('[STTService] STT started (vi-VN)...');
      } catch (e) {
        console.warn('[STTService] Start error:', e.message);
      }
    };

    // If WebRTC stream exists, give it 200ms to stabilize before Speech API starts
    if (existingStream && existingStream.getAudioTracks().length > 0) {
      setTimeout(doStart, 200);
    } else {
      doStart();
    }
  }

  stopListening() {
    this.isListening       = false;
    this.consecutiveErrors = 0;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.recognition) {
      try { this.recognition.stop(); }  catch (e) {}
      try { this.recognition.abort(); } catch (e) {}
    }
    console.log('[STTService] STT stopped.');
  }
}

window.sttService = new STTService();
