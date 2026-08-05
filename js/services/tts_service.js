/**
 * Vietnamese Text-to-Speech (TTS) Service for Sign_Speak
 * 
 * Sequential Audio Queue Architecture + Dynamic Speech Fallback:
 * - Queues up recognized gesture words sequentially in real-time.
 * - Checks preloaded .wav audio cache first (0ms latency, 100% offline).
 * - Dynamically speaks ANY newly added custom words or letters ("H", "A", "B", "C", "Xin chào")!
 */

class TTSService {
  constructor(options = {}) {
    // Dictionary Slug Mapping: (word text / id) -> audio file slug
    this.slugMap = {
      "không": "khong",
      "khong": "khong",
      "tôi": "toi",
      "toi": "toi",
      "bạn": "ban",
      "ban": "ban",
      "cảm ơn": "cam_on",
      "cam_on": "cam_on",
      "xin lỗi": "xin_loi",
      "xin_loi": "xin_loi",
      "giúp đỡ": "giup_do",
      "giup_do": "giup_do",
      "vui vẻ": "vui_ve",
      "vui_ve": "vui_ve",
      "hẹn gặp lại": "hen_gap_lai",
      "hen_gap_lai": "hen_gap_lai",
      "tạm biệt": "tam_biet",
      "tam_biet": "tam_biet",
      "đồng ý": "dong_y",
      "dong_y": "dong_y",
      "khỏe mạnh": "khoe_manh",
      "khoe_manh": "khoe_manh",
      "đừng": "dung",
      "dung": "dung",
      "a": "a", "b": "b", "c": "c", "d": "d", "e": "e", "g": "g", "h": "h",
      "i": "i", "k": "k", "l": "l", "m": "m", "n": "n", "o": "o", "p": "p",
      "q": "q", "r": "r", "s": "s", "t": "t", "u": "u", "v": "v", "x": "x", "y": "y",
      "xin chào": "xin_chao", "xin_chao": "xin_chao", "chào": "xin_chao", "chao": "xin_chao"
    };

    // Preloaded HTML5 Audio Memory Cache (0ms latency playback)
    this.preloadedAudioMap = {};
    this.audioQueue = []; // Sequential Speech Queue
    this.isProcessingQueue = false;

    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
    this.activePlayingAudio = null;

    // Preload all VSL dictionary audio files into RAM immediately on boot
    this.preloadAllDictionaryAudio();
  }

  /**
   * Preload all .wav and .mp3 native Vietnamese audio files into RAM cache
   */
  preloadAllDictionaryAudio() {
    const uniqueSlugs = Array.from(new Set(Object.values(this.slugMap)));
    uniqueSlugs.forEach(slug => {
      try {
        const audioWav = new Audio(`assets/media/audio/${slug}.wav`);
        audioWav.preload = "auto";
        this.preloadedAudioMap[slug] = audioWav;
      } catch (e) {
        console.warn(`[TTS Preload Warning]: Cannot preload ${slug}.wav:`, e);
      }
    });
    console.log(`[TTSService] Đã preload thành công ${uniqueSlugs.length} file .wav giọng Việt thật vào bộ nhớ RAM.`);
  }

  /**
   * Enqueue word for sequential playback (Realtime Queue, No Word Cutting)
   * @param {String} text Gesture word or ID (e.g. "Tôi", "H", "Xin chào")
   */
  async speak(text) {
    if (!text || text.trim() === '') return;

    // Clean text string
    const cleanText = text.replace(/\[.*?\]/g, '').replace(/:\s*/g, '').trim();
    if (!cleanText) return;

    const lowerText = cleanText.toLowerCase();

    // Debounce identical text if recently queued within 600ms for continuous streams
    const now = Date.now();
    if (lowerText === this.lastSpokenText && (now - this.lastSpokenTime) < 600) {
      return;
    }
    this.lastSpokenText = lowerText;
    this.lastSpokenTime = now;

    // Push into Sequential Speech Queue
    this.audioQueue.push({ text: cleanText, lowerText: lowerText });

    // Process queue sequentially
    this.processQueue();
  }

  /**
   * Sequential Queue Worker Loop
   * Ensures previous word finishes completely before starting next word
   */
  async processQueue() {
    if (this.isProcessingQueue || this.audioQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    const item = this.audioQueue.shift();

    try {
      await this.playAudioPromise(item);
    } catch (err) {
      console.warn("[TTS Queue Error]:", err);
    } finally {
      this.isProcessingQueue = false;
      // Immediately trigger next word in queue after current word finishes!
      if (this.audioQueue.length > 0) {
        setTimeout(() => this.processQueue(), 80);
      }
    }
  }

  /**
   * Plays a single word audio and returns a Promise that resolves ONLY when audio ends
   */
  playAudioPromise(item) {
    return new Promise((resolve) => {
      let targetSlug = this.slugMap[item.lowerText];
      if (!targetSlug) {
        targetSlug = item.lowerText.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a")
          .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")
          .replace(/ì|í|ị|ỉ|ĩ/g, "i")
          .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o")
          .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")
          .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y")
          .replace(/đ/g, "d")
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");
      }

      let hasResolved = false;
      const finish = () => {
        if (!hasResolved) {
          hasResolved = true;
          this.activePlayingAudio = null;
          resolve();
        }
      };

      // 1. Try playing preloaded or local .wav audio file
      let audioObj = null;
      if (targetSlug && this.preloadedAudioMap[targetSlug]) {
        audioObj = this.preloadedAudioMap[targetSlug];
      } else if (targetSlug) {
        audioObj = new Audio(`assets/media/audio/${targetSlug}.wav`);
        this.preloadedAudioMap[targetSlug] = audioObj;
      }

      if (audioObj) {
        audioObj.onended = finish;
        audioObj.onerror = () => {
          // If local audio file missing, fallback to SpeechSynthesis for custom text
          this.speakSpeechSynthesisFallback(item.text, finish);
        };

        setTimeout(finish, 2800); // Safety timeout

        try {
          audioObj.currentTime = 0;
          this.activePlayingAudio = audioObj;
          const p = audioObj.play();
          if (p !== undefined) {
            p.catch(e => {
              this.speakSpeechSynthesisFallback(item.text, finish);
            });
          }
        } catch (e) {
          this.speakSpeechSynthesisFallback(item.text, finish);
        }
      } else {
        this.speakSpeechSynthesisFallback(item.text, finish);
      }
    });
  }

  /**
   * Fallback speech synthesis for new custom words/letters without static .wav files
   * Guarantees 100% native Vietnamese audio stream (same engine as "Xin chào") and blocks foreign English voices.
   */
  speakSpeechSynthesisFallback(text, onDone) {
    const slug = text.toLowerCase()
      .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a")
      .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")
      .replace(/ì|í|ị|ỉ|ĩ/g, "i")
      .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o")
      .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")
      .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y")
      .replace(/đ/g, "d")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

    // 1. Try dynamic Vietnamese server TTS audio stream first (Matches "Xin chào" voice 100%)
    const dynamicAudio = new Audio(`api/generate_audio.php?word=${encodeURIComponent(text)}&slug=${encodeURIComponent(slug)}`);
    dynamicAudio.onended = () => { if (onDone) onDone(); };
    dynamicAudio.onerror = () => {
      // 2. Strict SpeechSynthesis fallback with vi-VN filtering only
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'vi-VN';
          utterance.rate = 0.95;

          const voices = window.speechSynthesis.getVoices();
          const viVoice = voices.find(v => v.lang.toLowerCase().includes('vi')) || null;
          if (viVoice) {
            utterance.voice = viVoice;
            utterance.onend = () => { if (onDone) onDone(); };
            utterance.onerror = () => { if (onDone) onDone(); };
            setTimeout(() => { if (onDone) onDone(); }, 2500);
            window.speechSynthesis.speak(utterance);
            return;
          }
        } catch (e) {
          // ignore
        }
      }
      if (onDone) onDone();
    };

    setTimeout(() => { if (onDone) onDone(); }, 2800);

    try {
      this.activePlayingAudio = dynamicAudio;
      const p = dynamicAudio.play();
      if (p !== undefined) {
        p.catch(() => {
          dynamicAudio.onerror();
        });
      }
    } catch (e) {
      dynamicAudio.onerror();
    }
  }

  stop() {
    this.audioQueue = [];
    if (this.activePlayingAudio) {
      this.activePlayingAudio.pause();
      this.activePlayingAudio.currentTime = 0;
      this.activePlayingAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

window.ttsService = new TTSService();
