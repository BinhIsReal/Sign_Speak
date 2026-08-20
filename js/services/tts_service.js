/**
 * Vietnamese Text-to-Speech (TTS) Service for Sign_Speak
 *
 * Architecture:
 * - Dictionary words (slugMap): phát ngay file .wav thu âm chất lượng cao (0ms latency).
 * - Custom words (user-added): dùng Web Speech API với strict vi-VN voice.
 *   Nếu không có voice tiếng Việt -> bỏ qua hoàn toàn, không phát giọng tiếng Anh.
 * - speechSynthesis KHÔNG BAO GIỜ được dùng cho câu tích luỹ (cumulativeText).
 *   speak() chỉ nhận 1 token từ mới nhất (e.g. "A", "Tôi", "tên là").
 */

class TTSService {
  constructor(options = {}) {
    // Dictionary Slug Mapping: (word text / id) -> audio file slug
    this.slugMap = {
      không: "khong",
      khong: "khong",
      tôi: "toi",
      toi: "toi",
      bạn: "ban",
      ban: "ban",
      "cảm ơn": "cam_on",
      cam_on: "cam_on",
      "xin lỗi": "xin_loi",
      xin_loi: "xin_loi",
      "giúp đỡ": "giup_do",
      giup_do: "giup_do",
      "vui vẻ": "vui_ve",
      vui_ve: "vui_ve",
      "hẹn gặp lại": "hen_gap_lai",
      hen_gap_lai: "hen_gap_lai",
      "tạm biệt": "tam_biet",
      tam_biet: "tam_biet",
      "đồng ý": "dong_y",
      dong_y: "dong_y",
      "khỏe mạnh": "khoe_manh",
      khoe_manh: "khoe_manh",
      đừng: "dung",
      dung: "dung",
      a: "a",
      b: "b",
      c: "c",
      d: "d",
      e: "e",
      g: "g",
      h: "h",
      i: "i",
      k: "k",
      l: "l",
      m: "m",
      n: "n",
      o: "o",
      p: "p",
      q: "q",
      r: "r",
      s: "s",
      t: "t",
      u: "u",
      v: "v",
      x: "x",
      y: "y",
      "xin chào": "xin_chao",
      xin_chao: "xin_chao",
      chào: "xin_chao",
      chao: "xin_chao",
      // Custom words with generated gTTS audio files:
      "tên là": "ten_la",
      ten_la: "ten_la",
      "học sinh": "hoc_sinh",
      hoc_sinh: "hoc_sinh",
      "gia đình": "gia_dinh",
      gia_dinh: "gia_dinh",
      "bạn bè": "ban_be",
      ban_be: "ban_be",
      "yêu thương": "yeu_thuong",
      yeu_thuong: "yeu_thuong",
      "nhà trường": "nha_truong",
      nha_truong: "nha_truong",
      "thầy giáo": "thay_giao",
      thay_giao: "thay_giao",
      "cô giáo": "co_giao",
      co_giao: "co_giao",
      "trẻ em": "tre_em",
      tre_em: "tre_em",
      "người lớn": "nguoi_lon",
      nguoi_lon: "nguoi_lon",
    };

    // Preloaded HTML5 Audio Memory Cache (0ms latency playback)
    this.preloadedAudioMap = {};
    this.audioQueue = [];
    this.isProcessingQueue = false;

    // Custom words registered dynamically by user (word text -> display text)
    // These will be spoken via Web Speech API (vi-VN only)
    this.customWordSet = new Set();

    // Auto-register custom words from localStorage into slugMap at boot
    // This allows any word added via gesture_collector to be auto-mapped
    this._autoRegisterFromLocalStorage();

    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
    this.activePlayingAudio = null;

    // Cache resolved Vietnamese voice
    this._viVoice = null;
    this._voicesLoaded = false;

    // Preload all dictionary audio files into RAM immediately on boot
    this._preloadAll();

    // Load existing custom words from localStorage
    this._loadCustomWordsFromStorage();

    // Pre-resolve Vietnamese voice when voices become available
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this._resolveViVoice();
      }
      setTimeout(() => this._resolveViVoice(), 500);
    }
  }

  /**
   * Preload all known .wav audio files into RAM cache for instant playback
   */
  _preloadAll() {
    const uniqueSlugs = Array.from(new Set(Object.values(this.slugMap)));
    uniqueSlugs.forEach((slug) => {
      try {
        const audio = new Audio(`assets/media/audio/${slug}.wav`);
        audio.preload = "auto";
        this.preloadedAudioMap[slug] = audio;
      } catch (_e) {}
    });
    console.log(
      `[TTSService] Preloaded ${uniqueSlugs.length} Vietnamese .wav files into RAM.`,
    );
  }

  /**
   * Auto-register custom words from localStorage into slugMap on boot.
   * Words added via gesture_collector get a slug like "ten_la" -> audio/ten_la.wav
   */
  _autoRegisterFromLocalStorage() {
    try {
      const saved = localStorage.getItem("vsl_custom_words");
      if (!saved) return;
      const words = JSON.parse(saved);
      words.forEach((w) => {
        if (!w || !w.word || !w.id) return;
        const lowerWord = w.word.toLowerCase();
        const slug = w.id; // e.g. "ten_la"
        // Register both display text and slug -> same audio slug
        if (!this.slugMap[lowerWord]) {
          this.slugMap[lowerWord] = slug;
        }
        if (!this.slugMap[slug]) {
          this.slugMap[slug] = slug;
        }
        // Preload the audio file if not already cached
        if (!this.preloadedAudioMap[slug]) {
          try {
            const audio = new Audio(`assets/media/audio/${slug}.wav`);
            audio.preload = "auto";
            this.preloadedAudioMap[slug] = audio;
          } catch (_e) {}
        }
      });
      console.log(
        `[TTSService] Auto-registered ${words.length} custom words from localStorage into slugMap.`,
      );
    } catch (e) {
      console.warn("[TTSService] _autoRegisterFromLocalStorage error:", e);
    }
  }

  /**
   * Load previously registered custom words from localStorage
   */
  _loadCustomWordsFromStorage() {
    try {
      const saved = localStorage.getItem("vsl_custom_words");
      if (saved) {
        const words = JSON.parse(saved);
        words.forEach((w) => {
          if (w && w.word) this.customWordSet.add(w.word.toLowerCase());
          if (w && w.id) this.customWordSet.add(w.id.toLowerCase());
        });
        if (this.customWordSet.size > 0) {
          console.log(
            `[TTSService] Loaded ${this.customWordSet.size} custom words for vi-VN synthesis.`,
          );
        }
      }
    } catch (_e) {}
  }

  /**
   * Resolve and cache the best available Vietnamese voice on this system
   */
  _resolveViVoice() {
    if (!("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    this._viVoice =
      voices.find(
        (v) =>
          (v.lang && v.lang.toLowerCase().replace("_", "-").startsWith("vi")) ||
          (v.name &&
            (v.name.toLowerCase().includes("vietnam") ||
              v.name.toLowerCase().includes("tiếng việt") ||
              v.name.toLowerCase().includes("vietnamese"))),
      ) || null;
    this._voicesLoaded = true;
    if (this._viVoice) {
      console.log(
        `[TTSService] Đã tìm thấy voice tiếng Việt: "${this._viVoice.name}" (${this._viVoice.lang})`,
      );
    } else {
      console.warn(
        "[TTSService] Không tìm thấy voice tiếng Việt trên hệ thống. Custom words sẽ không được đọc.",
      );
    }
  }

  /**
   * Register a new custom word for Vietnamese TTS synthesis.
   * Call this when user adds a new word in gesture_collector.
   * @param {string} wordText
   * @param {string} [slug]
   */
  registerCustomWord(wordText, slug) {
    if (!wordText) return;
    const lowerWord = wordText.toLowerCase();
    this.customWordSet.add(lowerWord);
    if (slug) this.customWordSet.add(slug.toLowerCase());
    console.log(`[TTSService] Đã đăng ký từ mới cho vi-VN TTS: "${wordText}"`);

    // Persist to localStorage so it survives page reload
    this._saveCustomWordsToStorage(wordText, slug);
  }

  /**
   * @private Save a custom word key to localStorage (merged into vsl_custom_words)
   */
  _saveCustomWordsToStorage(wordText, slug) {
    try {
      const saved = localStorage.getItem("vsl_custom_words");
      const words = saved ? JSON.parse(saved) : [];
      const exists = words.some(
        (w) =>
          (w.word && w.word.toLowerCase() === wordText.toLowerCase()) ||
          (slug && w.id && w.id === slug),
      );
      if (!exists) {
        words.push({
          id: slug || wordText.toLowerCase().replace(/\s+/g, "_"),
          word: wordText,
          category: "Custom",
        });
        localStorage.setItem("vsl_custom_words", JSON.stringify(words));
      }
    } catch (_e) {}
  }

  /**
   * @param {string} text - A single gesture word or token
   */
  speak(text) {
    if (!text || typeof text !== "string") return;

    // Strip emoji/label prefixes if accidentally passed full subtitle
    const cleanText = text
      .replace(/^\[.*?\]\s*:\s*/, "")
      .replace(/^[🤟🎙️]+\s*/, "")
      .trim();
    if (!cleanText) return;

    const lowerText = cleanText.toLowerCase();

    // Debounce: skip if same word spoken within 500ms
    const now = Date.now();
    if (lowerText === this.lastSpokenText && now - this.lastSpokenTime < 500) {
      return;
    }
    this.lastSpokenText = lowerText;
    this.lastSpokenTime = now;

    const slug = this.slugMap[lowerText];

    if (slug) {
      // Known dictionary word -> enqueue WAV playback
      this.audioQueue.push({ type: "wav", slug, label: cleanText });
    } else if (this.customWordSet.has(lowerText)) {
      // Custom user-defined word -> enqueue vi-VN synthesis
      this.audioQueue.push({ type: "synthesis", label: cleanText });
    } else {
      // Unknown word, not registered -> skip silently (no English voice)
      console.log(`[TTSService] Từ "${cleanText}" chưa được đăng ký - bỏ qua.`);
      return;
    }

    this._processQueue();
  }

  /**
   * Sequential Queue Worker - plays one item at a time, waits for completion
   */
  async _processQueue() {
    if (this.isProcessingQueue || this.audioQueue.length === 0) return;

    this.isProcessingQueue = true;
    const item = this.audioQueue.shift();

    try {
      if (item.type === "wav") {
        await this._playWav(item.slug);
      } else if (item.type === "synthesis") {
        await this._speakVietnamese(item.label);
      }
    } catch (_err) {
      // Fail silently
    } finally {
      this.isProcessingQueue = false;
      if (this.audioQueue.length > 0) {
        setTimeout(() => this._processQueue(), 60);
      }
    }
  }

  /**
   * Play a preloaded .wav file from RAM cache
   * @param {string} slug - The audio file slug (e.g. "toi", "xin_chao")
   */
  _playWav(slug) {
    return new Promise((resolve) => {
      const audioObj = this.preloadedAudioMap[slug];
      if (!audioObj) {
        resolve();
        return;
      }

      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          this.activePlayingAudio = null;
          resolve();
        }
      };

      audioObj.onended = finish;
      audioObj.onerror = finish;
      setTimeout(finish, 2500);

      try {
        audioObj.currentTime = 0;
        this.activePlayingAudio = audioObj;
        const p = audioObj.play();
        if (p !== undefined) p.catch(finish);
      } catch (_e) {
        finish();
      }
    });
  }

  /**
   * Speak a custom word using Web Speech API with STRICT Vietnamese-only voice.
   * If no Vietnamese voice found -> skip silently (NO English voice fallback).
   * @param {string} text - The display word to speak (e.g. "tên là")
   */
  _speakVietnamese(text) {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }

      // Ensure voices are resolved
      if (!this._voicesLoaded) this._resolveViVoice();

      // STRICT GATE: if no Vietnamese voice -> skip silently
      if (!this._viVoice) {
        console.warn(
          `[TTSService] Không có voice vi-VN - bỏ qua từ "${text}".`,
        );
        resolve();
        return;
      }

      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "vi-VN";
        utterance.voice = this._viVoice;
        utterance.rate = 0.92;
        utterance.pitch = 1.0;
        utterance.onend = finish;
        utterance.onerror = finish;
        setTimeout(finish, 4000); // Safety timeout for long phrases
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("[TTSService] Speech synthesis error:", e);
        finish();
      }
    });
  }

  /**
   * Stop all audio immediately and clear the queue
   */
  stop() {
    this.audioQueue = [];
    if (this.activePlayingAudio) {
      try {
        this.activePlayingAudio.pause();
        this.activePlayingAudio.currentTime = 0;
      } catch (_e) {}
      this.activePlayingAudio = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_e) {}
    }
  }
}

window.ttsService = new TTSService();
