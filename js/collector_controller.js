/**
 * Collector Controller for Sign_Speak Gesture Training & Benchmark Evaluator
 * Features:
 * - Controlled Gesture Recording (3-2-1 countdown, 1.0s stillness auto-stop, manual finish & cancel)
 * - AI Anomaly & Outlier Detection across dataset samples
 * - Realtime Live DTW Classifier Tester
 */

// State & Collector Variables
let dictionary = [];
let customWords = [];
let collectedDataset = {}; // { wordId: [ { id, sequence: [190D], word }, ... ] }
let featureExtractor = new FeatureExtractor();
let cameraInstance = null;
let currentMode = "auto"; // 'auto', 'one_hand', 'two_hands'

// Explicit Recording State Engine
let isRecordingSession = false;
let sessionRecordedFrames = [];
let sessionStillFrames = 0;
let sessionStartTimestamp = 0;
const MIN_SESSION_FRAMES = 6;
const AUTO_STOP_STILL_FRAMES = 25; // ~0.8s - 1.0s of continuous stillness
const MAX_SESSION_FRAMES = 50; // ~1.6s

let webcamVideo = null;
let outputCanvas = null;
let canvasCtx = null;
let startRecordBtn = null;
let stopRecordBtn = null;
let cancelRecordBtn = null;
let countdownOverlay = null;
let countdownNumber = null;
let statusLabel = null;
let velocityLabel = null;
let progressBar = null;
let samplesListContainer = null;
let totalSampleBadge = null;
let signWordSelect = null;
let newWordInput = null;
let addNewWordBtn = null;

// Realtime Live Tester State & Classifier Loader
let dtwClassifier = new DTWClassifier();
let isTestMode = false;
let testHistory = [];
let lastTestWord = '';
let lastTestWordTime = 0;
const TEST_WORD_COOLDOWN_MS = 1400;

document.addEventListener('DOMContentLoaded', () => {
  webcamVideo = document.getElementById("webcamVideo");
  outputCanvas = document.getElementById("outputCanvas");
  if (outputCanvas) canvasCtx = outputCanvas.getContext("2d");
  startRecordBtn = document.getElementById("startRecordBtn");
  stopRecordBtn = document.getElementById("stopRecordBtn");
  cancelRecordBtn = document.getElementById("cancelRecordBtn");
  countdownOverlay = document.getElementById("countdownOverlay");
  countdownNumber = document.getElementById("countdownNumber");
  statusLabel = document.getElementById("statusLabel");
  velocityLabel = document.getElementById("velocityLabel");
  progressBar = document.getElementById("progressBar");
  samplesListContainer = document.getElementById("samplesListContainer");
  totalSampleBadge = document.getElementById("totalSampleBadge");
  signWordSelect = document.getElementById("signWordSelect");
  newWordInput = document.getElementById("newWordInput");
  addNewWordBtn = document.getElementById("addNewWordBtn");

  // Load saved dataset from localStorage or master dataset
  const savedLocalDataset = localStorage.getItem("vsl_custom_dataset");
  if (savedLocalDataset) {
    try {
      collectedDataset = JSON.parse(savedLocalDataset);
    } catch (e) {
      console.warn("Lỗi nạp vsl_custom_dataset từ localStorage:", e);
    }
  }

  // Load master dataset if empty
  if (!collectedDataset || Object.keys(collectedDataset).length === 0) {
    fetch(`assets/data/vsl_dataset.json?v=${Date.now()}`, { cache: "no-cache" })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(masterData => {
        if (masterData && Object.keys(masterData).length > 0) {
          collectedDataset = masterData;
          localStorage.setItem("vsl_custom_dataset", JSON.stringify(collectedDataset));
          updateSamplesList();
          console.info("[Collector AI] Đã tự động nạp thành công bộ mẫu cử chỉ chuẩn (Master Dataset)!");
        }
      })
      .catch(err => {
        console.warn("Lỗi nạp assets/data/vsl_dataset.json:", err);
      });
  }

  const savedCustomWords = localStorage.getItem("vsl_custom_words");
  if (savedCustomWords) {
    try {
      customWords = JSON.parse(savedCustomWords);
    } catch (e) {
      console.warn("Lỗi nạp vsl_custom_words:", e);
    }
  }

  // Export & Import Dataset Handlers
  const exportDatasetBtn = document.getElementById("exportDatasetBtn");
  const importDatasetBtn = document.getElementById("importDatasetBtn");
  const importDatasetInput = document.getElementById("importDatasetInput");

  if (exportDatasetBtn) {
    exportDatasetBtn.addEventListener("click", () => {
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(collectedDataset, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "vsl_dataset_export.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  function broadcastDatasetUpdated() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const ch = new BroadcastChannel('vsl_dataset_sync');
        ch.postMessage({ type: 'DATASET_UPDATED' });
      } catch (e) {}
    }
  }

  if (importDatasetBtn && importDatasetInput) {
    importDatasetBtn.addEventListener("click", () => importDatasetInput.click());
    importDatasetInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported && typeof imported === 'object') {
            collectedDataset = imported;
            localStorage.setItem("vsl_custom_dataset", JSON.stringify(collectedDataset));
            updateSamplesList();
            if (isTestMode) reloadTestClassifierTemplates();
            broadcastDatasetUpdated();
            alert(`✅ Đã nạp thành công bộ dữ liệu mới từ file JSON! (${Object.keys(imported).length} từ vựng)`);
          }
        } catch (err) {
          alert("Lỗi đọc file JSON: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Load Dictionary
  fetch("assets/data/sign-dictionary.json")
    .then((res) => res.json())
    .then((data) => {
      dictionary = data;
      populateWordDropdown();
    })
    .catch((err) => console.error("Lỗi nạp sign-dictionary.json:", err));

  function populateWordDropdown() {
    if (!signWordSelect) return;
    let optionsHtml = dictionary
      .map(
        (item) => `
    <option value="${item.id}">${item.word} (${item.category || "Ký hiệu"})</option>
  `,
      )
      .join("");

    if (customWords.length > 0) {
      optionsHtml += customWords
        .map(
          (item) => `
      <option value="${item.id}">➕ ${item.word} (Từ tự thêm)</option>
    `,
        )
        .join("");
    }

    signWordSelect.innerHTML = optionsHtml;
    updateSamplesList();
  }

  // Add New Word Logic
  if (addNewWordBtn) {
    addNewWordBtn.addEventListener("click", () => {
      const val = newWordInput.value.trim();
      if (!val) {
        alert("Vui lòng nhập tên từ ký hiệu mới!");
        return;
      }

      const slug = val
        .toLowerCase()
        .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a")
        .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")
        .replace(/ì|í|ị|ỉ|ĩ/g, "i")
        .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o")
        .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")
        .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y")
        .replace(/đ/g, "d")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      const exists =
        dictionary.some((d) => d.id === slug) ||
        customWords.some((w) => w.id === slug);

      if (exists) {
        alert(`Từ "${val}" (id: ${slug}) đã tồn tại trong danh sách!`);
        return;
      }

      const newWordObj = {
        id: slug,
        word: val,
        category: "Tự thêm",
        type: currentMode,
        description: `Cử chỉ ${val} tự thu thập`,
        media_url: "",
      };

      customWords.push(newWordObj);
      localStorage.setItem("vsl_custom_words", JSON.stringify(customWords));

      if (window.ttsService) {
        window.ttsService.registerCustomWord(slug, val);
      }

      populateWordDropdown();
      signWordSelect.value = slug;
      newWordInput.value = "";
      updateSamplesList();
      alert(
        `Đã thêm từ mới "${val}" thành công! Hệ thống sẽ đọc từ này bằng giọng Việt khi AI nhận diện được ký hiệu. Bây giờ bạn có thể quay mẫu cho từ này.`,
      );
    });
  }

  // Init MediaPipe Hands
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults((rawResults) => {
    const results = {
      leftHandLandmarks: null,
      rightHandLandmarks: null,
    };

    if (rawResults.multiHandLandmarks && rawResults.multiHandedness) {
      for (let i = 0; i < rawResults.multiHandLandmarks.length; i++) {
        const label = rawResults.multiHandedness[i].label;
        const landmarks = rawResults.multiHandLandmarks[i];
        if (label === "Left") {
          results.leftHandLandmarks = landmarks;
        } else {
          results.rightHandLandmarks = landmarks;
        }
      }
    }

    onResults(results);
  });

  let isProcessingCollectorFrame = false;
  let lastCollectorAiTime = 0;
  const AI_THROTTLE_MS = 33; // 30 FPS AI background execution

  async function initCollectorCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { ideal: 30 } },
        audio: false,
      });
      webcamVideo.srcObject = stream;
      await webcamVideo.play();
      console.log("[Collector GPU Camera Preview Started]");

      cameraInstance = new Camera(webcamVideo, {
        onFrame: async () => {
          if (isProcessingCollectorFrame) return;
          const now = performance.now();
          if (now - lastCollectorAiTime < AI_THROTTLE_MS) return;
          lastCollectorAiTime = now;
          isProcessingCollectorFrame = true;
          try {
            await hands.send({ image: webcamVideo });
          } catch (e) {
            // ignore
          } finally {
            isProcessingCollectorFrame = false;
          }
        },
        width: 640,
        height: 480,
      });
      cameraInstance.start();
    } catch (err) {
      console.error("Camera access error:", err);
    }
  }
  initCollectorCamera();

  function onResults(results) {
    if (!canvasCtx || !outputCanvas) return;
    canvasCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    canvasCtx.save();
    if (results.poseLandmarks) {
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: "#38bdf8",
        lineWidth: 1.5,
      });
    }
    if (results.leftHandLandmarks) {
      drawConnectors(
        canvasCtx,
        results.leftHandLandmarks,
        HAND_CONNECTIONS,
        { color: "#818cf8", lineWidth: 2 },
      );
      drawLandmarks(canvasCtx, results.leftHandLandmarks, {
        color: "#c084fc",
        lineWidth: 1,
        radius: 2,
      });
    }
    if (results.rightHandLandmarks) {
      drawConnectors(
        canvasCtx,
        results.rightHandLandmarks,
        HAND_CONNECTIONS,
        { color: "#34d399", lineWidth: 2 },
      );
      drawLandmarks(canvasCtx, results.rightHandLandmarks, {
        color: "#a7f3d0",
        lineWidth: 1,
        radius: 2,
      });
    }
    canvasCtx.restore();

    if (
      currentMode === "one_hand" &&
      results.leftHandLandmarks &&
      results.rightHandLandmarks
    ) {
      results.rightHandLandmarks = null;
    }

    // ACTIVE RECORDING SESSION ENGINE
    if (isRecordingSession) {
      const fullVector = featureExtractor.extractFeatureVector(results);
      const velocity = featureExtractor.calculateMotionVelocity(fullVector);

      sessionRecordedFrames.push(fullVector);
      const frameCount = sessionRecordedFrames.length;
      const elapsedSec = ((performance.now() - sessionStartTimestamp) / 1000).toFixed(1);

      const motionOverlay = document.getElementById('recordingMotionOverlay');
      if (motionOverlay) motionOverlay.classList.remove('hidden');
      const frameCounter = document.getElementById('recordingFrameCounter');
      if (frameCounter) frameCounter.innerText = `${frameCount} frames (${elapsedSec}s)`;

      if (velocityLabel) velocityLabel.innerText = `Vận tốc cử chỉ: ${velocity.toFixed(4)}`;

      if (statusLabel) {
        statusLabel.innerText = `🔴 Đang quay: ${frameCount} frames (${elapsedSec}s) — Dừng yên tay 1s để tự ngắt`;
        statusLabel.className = "text-amber-400 font-bold animate-pulse";
      }

      if (progressBar) {
        const pct = Math.min(100, (frameCount / MAX_SESSION_FRAMES) * 100);
        progressBar.style.width = `${pct}%`;
      }

      // Check auto-stop stillness after minimum 6 movement frames recorded
      if (frameCount >= MIN_SESSION_FRAMES) {
        if (velocity < 0.007) {
          sessionStillFrames++;
        } else {
          sessionStillFrames = 0;
        }

        if (sessionStillFrames >= AUTO_STOP_STILL_FRAMES || frameCount >= MAX_SESSION_FRAMES) {
          const trimmedFrames = sessionRecordedFrames.slice(0, Math.max(MIN_SESSION_FRAMES, sessionRecordedFrames.length - (sessionStillFrames - 2)));
          finishRecordingSession(trimmedFrames);
        }
      }
      return; // Skip normal test/inference while actively recording a training sample
    }

    // LIVE TESTING MODE
    const frameData = featureExtractor.processFrame(results);
    if (velocityLabel) velocityLabel.innerText = `Vận tốc cử chỉ: ${frameData.velocity.toFixed(4)}`;

    if (
      isTestMode &&
      frameData.sequenceComplete &&
      frameData.sequenceComplete.length >= 4
    ) {
      const prediction = dtwClassifier.predict(frameData.sequenceComplete);

      const isPassed = !prediction.isRejected && prediction.confidence >= 80;
      const wordText = isPassed
        ? prediction.word
        : prediction.matchedTemplate
          ? `${prediction.matchedTemplate} (Dưới 80%)`
          : "Chưa nhận diện";

      const wordElem = document.getElementById("testPredictedWord");
      if (wordElem) wordElem.innerText = wordText;
      const badgeElem = document.getElementById("testConfidenceBadge");
      if (badgeElem) {
        badgeElem.innerText = `${prediction.confidence}%`;
        badgeElem.className = isPassed
          ? "text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800"
          : "text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800";
      }
      const distElem = document.getElementById("testDistanceText");
      if (distElem) distElem.innerText = `dist: ${prediction.distance} | threshold: ${prediction.thresholdUsed}`;

      const nowTime = performance.now();
      const isDuplicateRapid = (isPassed && prediction.word === lastTestWord && (nowTime - lastTestWordTime < TEST_WORD_COOLDOWN_MS));

      if (isPassed && !isDuplicateRapid) {
        lastTestWord = prediction.word;
        lastTestWordTime = nowTime;
        if (window.ttsService) {
          window.ttsService.speak(prediction.word);
        }
      }

      if (!isDuplicateRapid) {
        testHistory.unshift({
          word: wordText,
          confidence: prediction.confidence,
          distance: prediction.distance,
          isPassed: isPassed,
          time: new Date().toLocaleTimeString(),
        });
      }

      const logCountBadge = document.getElementById("testLogCountBadge");
      if (logCountBadge) logCountBadge.innerText = `${testHistory.length} lượt test`;
      const logHtml = testHistory
        .slice(0, 10)
        .map(
          (item) => `
      <div class="py-1.5 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-slate-500">${item.time}</span>
          <strong class="${item.isPassed ? "text-emerald-400" : "text-amber-300"}">${item.word}</strong>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-[11px] text-slate-400">dist: ${item.distance}</span>
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${item.isPassed ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-amber-950 text-amber-300 border border-amber-800"}">${item.confidence}%</span>
        </div>
      </div>
    `,
        )
        .join("");

      const logList = document.getElementById("testLogList");
      if (logList) logList.innerHTML = logHtml;
    }
  }

  // 3-2-1 Countdown Recording Trigger
  if (startRecordBtn) {
    startRecordBtn.addEventListener("click", () => {
      startRecordingCountdown();
    });
  }

  function startRecordingCountdown() {
    const selectedId = signWordSelect.value;
    if (!selectedId) {
      alert("Vui lòng chọn từ ký hiệu!");
      return;
    }

    if (countdownOverlay) countdownOverlay.classList.remove("hidden");
    let count = 3;
    if (countdownNumber) countdownNumber.innerText = count;

    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        if (countdownNumber) countdownNumber.innerText = count;
      } else {
        clearInterval(timer);
        if (countdownOverlay) countdownOverlay.classList.add("hidden");
        
        // Start active recording
        isRecordingSession = true;
        sessionRecordedFrames = [];
        sessionStillFrames = 0;
        sessionStartTimestamp = performance.now();

        if (startRecordBtn) startRecordBtn.classList.add("hidden");
        const actionGroup = document.getElementById("activeRecordingActionGroup");
        if (actionGroup) actionGroup.classList.remove("hidden");

        const motionOverlay = document.getElementById('recordingMotionOverlay');
        if (motionOverlay) motionOverlay.classList.remove('hidden');

        if (statusLabel) {
          statusLabel.innerText = `🔴 Hãy thực hiện cử chỉ ngay bây giờ... (Giữ yên 1s khi xong)`;
          statusLabel.className = "text-amber-400 font-bold animate-pulse";
        }
      }
    }, 800);
  }

  if (stopRecordBtn) {
    stopRecordBtn.addEventListener("click", () => {
      if (sessionRecordedFrames.length >= MIN_SESSION_FRAMES) {
        finishRecordingSession(sessionRecordedFrames);
      } else {
        cancelRecordingSession();
      }
    });
  }

  if (cancelRecordBtn) {
    cancelRecordBtn.addEventListener("click", () => {
      cancelRecordingSession();
    });
  }

  // Keyboard shortcut: Spacebar to toggle record / stop
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (!isRecordingSession) {
        startRecordingCountdown();
      } else {
        if (sessionRecordedFrames.length >= MIN_SESSION_FRAMES) {
          finishRecordingSession(sessionRecordedFrames);
        } else {
          cancelRecordingSession();
        }
      }
    }
  });

  function finishRecordingSession(frames) {
    isRecordingSession = false;
    if (startRecordBtn) startRecordBtn.classList.remove("hidden");
    const actionGroup = document.getElementById("activeRecordingActionGroup");
    if (actionGroup) actionGroup.classList.add("hidden");

    const motionOverlay = document.getElementById('recordingMotionOverlay');
    if (motionOverlay) motionOverlay.classList.add('hidden');

    if (frames && frames.length >= MIN_SESSION_FRAMES) {
      saveRecordedSequence(frames);
      const frameCount = frames.length;
      const durationSec = (frameCount * 0.033).toFixed(1);
      if (statusLabel) {
        statusLabel.innerText = `✅ ĐÃ LƯU MẪU THÀNH CÔNG! (${frameCount} frames | ${durationSec}s)`;
        statusLabel.className = "text-emerald-400 font-bold";
        setTimeout(() => {
          if (!isRecordingSession && !isTestMode && statusLabel) {
            statusLabel.innerText = `Trạng thái: Sẵn sàng`;
            statusLabel.className = "text-slate-400 font-medium";
            if (progressBar) progressBar.style.width = `0%`;
          }
        }, 3000);
      }
    } else {
      if (statusLabel) {
        statusLabel.innerText = `⚠️ Mẫu quá ngắn (< 6 frames), đã hủy bỏ. Vui lòng quay lại.`;
        statusLabel.className = "text-rose-400 font-bold";
      }
    }
  }

  function cancelRecordingSession() {
    isRecordingSession = false;
    sessionRecordedFrames = [];
    if (startRecordBtn) startRecordBtn.classList.remove("hidden");
    const actionGroup = document.getElementById("activeRecordingActionGroup");
    if (actionGroup) actionGroup.classList.add("hidden");

    const motionOverlay = document.getElementById('recordingMotionOverlay');
    if (motionOverlay) motionOverlay.classList.add('hidden');

    if (statusLabel) {
      statusLabel.innerText = `❌ Đã hủy bỏ lượt quay.`;
      statusLabel.className = "text-slate-400 font-medium";
      if (progressBar) progressBar.style.width = `0%`;
    }
  }

  function saveRecordedSequence(sequence) {
    const selectedId = signWordSelect.value;
    const selectedItem =
      dictionary.find((d) => d.id === selectedId) ||
      customWords.find((w) => w.id === selectedId);
    const wordName = selectedItem ? selectedItem.word : selectedId;

    if (!collectedDataset[selectedId]) {
      collectedDataset[selectedId] = [];
    }

    const sampleObj = {
      id: `${selectedId}_sample_${collectedDataset[selectedId].length + 1}`,
      word: wordName,
      sequence: sequence,
      timestamp: new Date().toISOString(),
    };

    collectedDataset[selectedId].push(sampleObj);

    localStorage.setItem(
      "vsl_custom_dataset",
      JSON.stringify(collectedDataset),
    );
    updateSamplesList();
    broadcastDatasetUpdated();

    fetch("api/save_dataset.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_sample",
        wordId: selectedId,
        sample: sampleObj,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("[Dataset Disk Sync Success]:", data);
        if (isTestMode) reloadTestClassifierTemplates();
      })
      .catch((err) => console.warn("[Dataset Disk Sync Error]:", err));
  }

  // AI ANOMALY / OUTLIER DETECTION ENGINE
  function analyzeWordConsistency(wordId) {
    const samples = collectedDataset[wordId] || [];
    const N = samples.length;
    if (N < 3) {
      return {
        wordId,
        sampleCount: N,
        hasEnoughSamples: false,
        meanDist: 0,
        outliers: [],
        sampleStats: samples.map((s, idx) => ({ index: idx, avgDist: 0, isOutlier: false }))
      };
    }

    // Calculate DTW distance matrix between all pairs of samples
    const distMatrix = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const d = dtwClassifier.computeDTWDistance(samples[i].sequence, samples[j].sequence);
        distMatrix[i][j] = d;
        distMatrix[j][i] = d;
      }
    }

    // Calculate average distance of each sample to other samples
    const sampleStats = [];
    const avgDists = [];
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < N; j++) {
        if (i !== j) sum += distMatrix[i][j];
      }
      const avgD = sum / (N - 1);
      avgDists.push(avgD);
    }

    const meanDist = avgDists.reduce((a, b) => a + b, 0) / N;

    const outliers = [];
    for (let i = 0; i < N; i++) {
      const avgD = avgDists[i];
      // True Outlier Criteria:
      // A sample is an outlier ONLY if it deviates significantly from the group mean (+40% higher and > 0.08 absolute difference), OR > 0.45 extreme distance.
      const isOutlier = (meanDist > 0 && avgD > meanDist * 1.40 && (avgD - meanDist) > 0.08) || (avgD > 0.45);
      const stat = {
        index: i,
        sampleId: samples[i].id || `${wordId}_sample_${i + 1}`,
        frameCount: samples[i].sequence.length,
        avgDist: parseFloat(avgD.toFixed(4)),
        isOutlier: isOutlier,
        diffPct: meanDist > 0 ? Math.round(((avgD - meanDist) / meanDist) * 100) : 0
      };
      sampleStats.push(stat);
      if (isOutlier) {
        outliers.push(stat);
      }
    }

    return {
      wordId,
      sampleCount: N,
      hasEnoughSamples: true,
      meanDist: parseFloat(meanDist.toFixed(4)),
      outliers,
      sampleStats
    };
  }

  function updateSamplesList() {
    if (!signWordSelect || !samplesListContainer) return;
    const selectedId = signWordSelect.value;
    const samples = collectedDataset[selectedId] || [];

    let totalCount = 0;
    Object.keys(collectedDataset).forEach((k) => {
      totalCount += collectedDataset[k].length;
    });
    if (totalSampleBadge) totalSampleBadge.innerText = `${totalCount} mẫu tổng`;

    const consistencyLabel = document.getElementById("wordConsistencyLabel");
    const consistencyReport = analyzeWordConsistency(selectedId);

    if (consistencyLabel) {
      if (samples.length < 3) {
        consistencyLabel.innerHTML = `<span class="text-slate-400 font-normal">Quay thêm ${3 - samples.length} mẫu nữa để AI phân tích độ đồng nhất</span>`;
      } else if (consistencyReport.outliers.length === 0) {
        consistencyLabel.innerHTML = `<span class="text-emerald-400 font-bold">✨ Độ đồng nhất tốt (Khoảng cách TB: ${consistencyReport.meanDist})</span>`;
      } else {
        consistencyLabel.innerHTML = `<span class="text-rose-400 font-bold animate-pulse">⚠️ Phát hiện ${consistencyReport.outliers.length} mẫu dị biệt (lệch xa so với trung bình)!</span>`;
      }
    }

    if (samples.length === 0) {
      samplesListContainer.innerHTML = `<p class="text-slate-500 text-xs italic">Từ này chưa có mẫu cử chỉ nào được lưu.</p>`;
    } else {
      samplesListContainer.innerHTML = samples
        .map((item, i) => {
          const stat = consistencyReport.sampleStats[i] || { isOutlier: false, avgDist: 0 };
          const isOutlier = stat.isOutlier;

          return `
      <div class="flex items-center justify-between p-2.5 rounded-xl text-xs transition-all ${isOutlier ? "bg-rose-950/60 border border-rose-500/60 shadow-lg shadow-rose-950/30" : "bg-slate-900/80 border border-slate-800"}">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold ${isOutlier ? "text-rose-300" : "text-sky-400"}">Mẫu #${i + 1}</span>
            <span class="text-slate-500 font-mono text-[10px]">(${item.sequence.length} frames)</span>
            ${isOutlier ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-600 text-white animate-pulse">⚠️ DỊ BIỆT</span>` : `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">✅ Chuẩn</span>`}
          </div>
          ${stat.avgDist > 0 ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">Khoảng cách chéo: ${stat.avgDist}</div>` : ''}
        </div>
        <button onclick="deleteSample('${selectedId}', ${i})" class="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-800 text-rose-300 border border-rose-800 rounded-lg text-xs font-bold transition-all">
          Xóa
        </button>
      </div>
    `;
        })
        .join("");
    }
  }

  window.deleteSample = function (wordId, index) {
    if (collectedDataset[wordId]) {
      collectedDataset[wordId].splice(index, 1);
      localStorage.setItem(
        "vsl_custom_dataset",
        JSON.stringify(collectedDataset),
      );
      updateSamplesList();
      if (isTestMode) reloadTestClassifierTemplates();
      broadcastDatasetUpdated();
    }
  };

  // FULL DATASET ANOMALY SCANNER MODAL HANDLERS
  const scanOutliersBtn = document.getElementById("scanOutliersBtn");
  const outlierModal = document.getElementById("outlierScannerModal");
  const closeOutlierModalBtn = document.getElementById("closeOutlierModalBtn");
  const closeOutlierModalBtn2 = document.getElementById("closeOutlierModalBtn2");
  const deleteAllOutliersBtn = document.getElementById("deleteAllOutliersBtn");

  if (scanOutliersBtn) {
    scanOutliersBtn.addEventListener("click", () => {
      runFullDatasetAnomalyScan();
    });
  }

  if (closeOutlierModalBtn) closeOutlierModalBtn.addEventListener("click", () => outlierModal.classList.add("hidden"));
  if (closeOutlierModalBtn2) closeOutlierModalBtn2.addEventListener("click", () => outlierModal.classList.add("hidden"));

  function runFullDatasetAnomalyScan() {
    if (!outlierModal) return;
    outlierModal.classList.remove("hidden");
    const container = document.getElementById("outlierScanResultsContainer");
    const summaryText = document.getElementById("outlierSummaryText");

    const allWordIds = Object.keys(collectedDataset);
    const detectedOutliers = [];
    let analyzedWordsCount = 0;

    allWordIds.forEach(wId => {
      const report = analyzeWordConsistency(wId);
      if (report.hasEnoughSamples) {
        analyzedWordsCount++;
        if (report.outliers.length > 0) {
          report.outliers.forEach(out => {
            const wordObj = dictionary.find(d => d.id === wId) || customWords.find(w => w.id === wId);
            const wordLabel = wordObj ? wordObj.word : wId;
            detectedOutliers.push({
              wordId: wId,
              wordLabel: wordLabel,
              ...out
            });
          });
        }
      }
    });

    if (summaryText) {
      summaryText.innerText = `Đã phân tích ${analyzedWordsCount} từ vựng — Tìm thấy ${detectedOutliers.length} mẫu dị biệt`;
    }

    if (detectedOutliers.length === 0) {
      if (deleteAllOutliersBtn) deleteAllOutliersBtn.classList.add("hidden");
      container.innerHTML = `
        <div class="text-center py-10">
          <span class="text-4xl">🎉</span>
          <h4 class="text-base font-bold text-emerald-400 mt-2">Dữ Liệu Rất Sạch Sẽ & Chuẩn Xác!</h4>
          <p class="text-xs text-slate-400 mt-1">Toàn bộ ${analyzedWordsCount} từ vựng đều có tính đồng nhất cao, không có cử chỉ nào bị lệch hoặc nhiễu.</p>
        </div>
      `;
      return;
    }

    if (deleteAllOutliersBtn) deleteAllOutliersBtn.classList.remove("hidden");

    container.innerHTML = detectedOutliers.map(out => `
      <div class="bg-slate-950/80 border border-rose-500/40 p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-md">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-white uppercase bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">${out.wordLabel}</span>
            <span class="text-xs font-bold text-rose-400">Mẫu #${out.index + 1}</span>
            <span class="text-[10px] text-slate-500 font-mono">(${out.frameCount} frames)</span>
          </div>
          <div class="text-[11px] text-slate-300 mt-1 flex items-center gap-1.5">
            <span>⚠️ Khoảng cách DTW chéo: <strong class="text-rose-300 font-mono">${out.avgDist}</strong></span>
            <span class="text-[10px] text-rose-400 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800">Lệch +${out.diffPct}%</span>
          </div>
        </div>
        <button onclick="deleteSingleOutlier('${out.wordId}', ${out.index})" class="px-3 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all whitespace-nowrap shadow">
          🗑️ Xóa Mẫu Này
        </button>
      </div>
    `).join('');
  }

  window.deleteSingleOutlier = function(wordId, index) {
    if (collectedDataset[wordId]) {
      collectedDataset[wordId].splice(index, 1);
      localStorage.setItem("vsl_custom_dataset", JSON.stringify(collectedDataset));
      updateSamplesList();
      if (isTestMode) reloadTestClassifierTemplates();
      broadcastDatasetUpdated();
      runFullDatasetAnomalyScan();
    }
  };

  if (deleteAllOutliersBtn) {
    deleteAllOutliersBtn.addEventListener("click", () => {
      if (confirm("⚠️ Bạn có chắc chắn muốn TỰ ĐỘNG XÓA TẤT CẢ các mẫu dị biệt bị cảnh báo không?")) {
        const allWordIds = Object.keys(collectedDataset);
        let deletedCount = 0;

        allWordIds.forEach(wId => {
          const report = analyzeWordConsistency(wId);
          if (report.hasEnoughSamples && report.outliers.length > 0) {
            // Delete from highest index to lowest index to prevent index shifting
            const outlierIndices = report.outliers.map(o => o.index).sort((a, b) => b - a);
            outlierIndices.forEach(idx => {
              collectedDataset[wId].splice(idx, 1);
              deletedCount++;
            });
          }
        });

        localStorage.setItem("vsl_custom_dataset", JSON.stringify(collectedDataset));
        updateSamplesList();
        if (isTestMode) reloadTestClassifierTemplates();
        broadcastDatasetUpdated();
        runFullDatasetAnomalyScan();
        alert(`✅ Đã xóa sạch ${deletedCount} mẫu dị biệt! Dữ liệu của bạn hiện đã hoàn toàn nhất quán.`);
      }
    });
  }

  const resetBtn = document.getElementById("resetDatasetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (
        confirm(
          "⚠️ Bạn có chắc chắn muốn XÓA SẠCH toàn bộ dữ liệu mẫu cũ để bắt đầu TRAINING LẠI TỪ ĐẦU không?",
        )
      ) {
        collectedDataset = {};
        localStorage.removeItem("vsl_custom_dataset");
        dtwClassifier.loadTemplates([]);
        updateSamplesList();
        broadcastDatasetUpdated();
        alert(
          "✅ Đã reset sạch sẽ bộ nhớ! Tất cả mẫu cũ đã được xóa. Bạn có thể bắt đầu quay mẫu mới từ đầu!",
        );
      }
    });
  }

  if (signWordSelect) signWordSelect.addEventListener("change", () => updateSamplesList());

  const runBenchBtn = document.getElementById("runBenchmarkBtn");
  if (runBenchBtn) {
    runBenchBtn.addEventListener("click", () => {
      const train = [];
      const test = [];
      let totalSamplesCount = 0;

      Object.keys(collectedDataset).forEach((wordId) => {
        const wordSamples = collectedDataset[wordId];
        if (wordSamples && wordSamples.length > 0) {
          totalSamplesCount += wordSamples.length;
          if (wordSamples.length === 1) {
            train.push(wordSamples[0]);
            test.push(wordSamples[0]);
          } else {
            const trainCount = Math.max(
              1,
              Math.floor(wordSamples.length * 0.6),
            );
            for (let i = 0; i < trainCount; i++) {
              train.push(wordSamples[i]);
            }
            for (let i = trainCount; i < wordSamples.length; i++) {
              test.push(wordSamples[i]);
            }
          }
        }
      });

      if (totalSamplesCount < 3) {
        alert(
          "Vui lòng quay ít nhất 3 mẫu cử chỉ trước khi chạy đo thực nghiệm benchmark!",
        );
        return;
      }

      const evaluator = new ClassifierEvaluator();
      const evalReport = evaluator.evaluate(
        train,
        test.length > 0 ? test : train,
      );

      const tableBody = document.getElementById("benchmarkTableBody");
      if (tableBody) {
        tableBody.innerHTML = Object.keys(evalReport.evaluationMatrix)
          .map((k) => {
            const item = evalReport.evaluationMatrix[k];
            const statusBadge = item.passedRequirement
              ? `<span class="px-2.5 py-1 bg-emerald-950 text-emerald-400 text-xs font-bold rounded-full border border-emerald-800">ĐẠT (≥70%)</span>`
              : `<span class="px-2.5 py-1 bg-rose-950 text-rose-400 text-xs font-bold rounded-full border border-rose-800">KHÔNG ĐẠT</span>`;

            return `
        <tr class="border-b border-slate-800/50 hover:bg-slate-900/50">
          <td class="py-3 px-4 font-mono font-bold text-sky-400">${item.threshold}</td>
          <td class="py-3 px-4 font-bold ${item.overallAccuracy >= 70 ? "text-emerald-400" : "text-rose-400"}">${item.overallAccuracy}%</td>
          <td class="py-3 px-4">${item.truePositiveRate}%</td>
          <td class="py-3 px-4">${item.trueRejectRate}%</td>
          <td class="py-3 px-4">${statusBadge}</td>
        </tr>
      `;
          })
          .join("");
      }
    });
  }

  async function reloadTestClassifierTemplates() {
    let customTemplates = [];
    const savedCustomDataset = localStorage.getItem("vsl_custom_dataset");
    if (savedCustomDataset) {
      try {
        const customData = JSON.parse(savedCustomDataset);
        Object.keys(customData).forEach((wordId) => {
          const wordSamples = customData[wordId];
          if (wordSamples && wordSamples.length > 0) {
            wordSamples.forEach((s, idx) => {
              if (Array.isArray(s.sequence) && s.sequence.length > 0) {
                customTemplates.push({
                  id: s.id || `${wordId}_custom_${idx + 1}`,
                  word: s.word || wordId,
                  sequence: s.sequence,
                });
              }
            });
          }
        });
      } catch (e) {
        console.warn("Lỗi nạp vsl_custom_dataset:", e);
      }
    }

    try {
      const res = await fetch(`assets/data/vsl_dataset.json?v=${Date.now()}`, { cache: 'no-cache' });
      const data = await res.json();
      let defaultTemplates = [];
      if (data && typeof data === "object") {
        Object.keys(data).forEach((wordId) => {
          const wordSamples = data[wordId];
          if (wordSamples && wordSamples.length > 0) {
            wordSamples.forEach((s, idx) => {
              if (Array.isArray(s.sequence) && s.sequence.length > 0) {
                defaultTemplates.push({
                  id: s.id || `${wordId}_master_${idx + 1}`,
                  word: s.word || wordId,
                  sequence: s.sequence,
                });
              }
            });
          }
        });
      }
      // Deduplicate templates by ID
      const templateMap = new Map();
      defaultTemplates.forEach(t => templateMap.set(t.id, t));
      customTemplates.forEach(t => templateMap.set(t.id, t));
      const combined = Array.from(templateMap.values());
      dtwClassifier.loadTemplates(combined);
      console.log(
        `[Collector Live Tester] Đã nạp thành công ${combined.length} mẫu cử chỉ từ dataset vào DTW Classifier!`,
      );
      return combined.length;
    } catch (err) {
      if (customTemplates.length > 0) {
        dtwClassifier.loadTemplates(customTemplates);
      }
      return customTemplates.length;
    }
  }

  const toggleTestBtn = document.getElementById("toggleTestModeBtn");
  const testOverlay = document.getElementById("testResultOverlay");
  const testLogCard = document.getElementById("testLogCard");

  if (toggleTestBtn) {
    toggleTestBtn.addEventListener("click", async () => {
      isTestMode = !isTestMode;
      if (isTestMode) {
        if (statusLabel) {
          statusLabel.innerText = "⏳ Đang nạp toàn bộ dataset vào bộ nhớ test...";
          statusLabel.className = "text-sky-400 font-bold animate-pulse";
        }

        const count = await reloadTestClassifierTemplates();
        if (count === 0) {
          alert(
            "Chưa có mẫu cử chỉ nào được lưu! Vui lòng chọn từ ký hiệu và bấm '🔴 Bắt Đầu Thu Thập Mẫu Cử Chỉ' quay ít nhất 1 mẫu trước khi test.",
          );
        }

        toggleTestBtn.className =
          "w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl border border-rose-400 text-sm flex items-center justify-center gap-2 shadow-lg transition-all animate-pulse";
        toggleTestBtn.innerHTML = "<span>🛑</span> Tắt Chế Độ Test Ký Hiệu Trực Tiếp";
        if (testOverlay) testOverlay.classList.remove("hidden");
        if (testLogCard) testLogCard.classList.remove("hidden");
        if (statusLabel) {
          statusLabel.innerText = `🧪 CHẾ ĐỘ TEST ĐANG BẬT (${count} mẫu đã nạp sẵn): Hãy làm cử chỉ tay trước camera...`;
          statusLabel.className = "text-emerald-400 font-bold animate-pulse";
        }
      } else {
        toggleTestBtn.className =
          "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl border border-emerald-400 text-sm flex items-center justify-center gap-2 shadow-lg transition-all";
        toggleTestBtn.innerHTML = "<span>🧪</span> Bật Chế Độ Test Ký Hiệu Trực Tiếp";
        if (testOverlay) testOverlay.classList.add("hidden");
        if (testLogCard) testLogCard.classList.add("hidden");
        if (statusLabel) {
          statusLabel.innerText = "Trạng thái: Sẵn sàng";
          statusLabel.className = "text-slate-400 font-medium";
        }
      }
    });
  }

  const mirrorBtn = document.getElementById("toggleMirrorBtn");
  if (mirrorBtn) {
    mirrorBtn.addEventListener("click", () => {
      const canvas = document.getElementById("outputCanvas");
      if (canvas) canvas.classList.toggle("mirror-mode");
    });
  }

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".mode-btn").forEach((b) => {
        b.className =
          "mode-btn px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700";
      });
      e.target.className =
        "mode-btn px-3 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white border border-sky-400";
      currentMode = e.target.dataset.mode;
    });
  });
});
