/**
 * Collector Controller for Sign_Speak VSL Gesture Training & Benchmark Evaluator
 */

// State & Collector Variables
let dictionary = [];
let customWords = [];
let collectedDataset = {}; // { wordId: [ { sequence: [147D], word }, ... ] }
let featureExtractor = new FeatureExtractor();
let isRecordingSession = false;
let cameraInstance = null;
let currentMode = "auto"; // 'auto', 'one_hand', 'two_hands'

let webcamVideo = null;
let outputCanvas = null;
let canvasCtx = null;
let startRecordBtn = null;
let stopRecordBtn = null;
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

document.addEventListener('DOMContentLoaded', () => {
  webcamVideo = document.getElementById("webcamVideo");
  outputCanvas = document.getElementById("outputCanvas");
  if (outputCanvas) canvasCtx = outputCanvas.getContext("2d");
  startRecordBtn = document.getElementById("startRecordBtn");
  stopRecordBtn = document.getElementById("stopRecordBtn");
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

  // Load saved dataset and custom words from localStorage
  const savedLocalDataset = localStorage.getItem("vsl_custom_dataset");
  if (savedLocalDataset) {
    try {
      collectedDataset = JSON.parse(savedLocalDataset);
    } catch (e) {
      console.warn("Lỗi nạp vsl_custom_dataset từ localStorage:", e);
    }
  }

  // Fallback: If dataset is empty (e.g. on new domain/Vercel), load pre-built starter VSL dataset
  if (!collectedDataset || Object.keys(collectedDataset).length === 0) {
    fetch("assets/data/vsl_dataset_starter.json")
      .then(res => res.json())
      .then(starterData => {
        if (starterData && Object.keys(starterData).length > 0) {
          collectedDataset = starterData;
          localStorage.setItem("vsl_custom_dataset", JSON.stringify(collectedDataset));
          updateSamplesList();
          console.info("[Collector AI] Đã tự động nạp thành công bộ mẫu VSL khởi tạo chuẩn (Starter Dataset)!");
        }
      })
      .catch(err => console.warn("Lỗi nạp vsl_dataset_starter.json:", err));
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
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(collectedDataset, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `vsl_gesture_dataset_backup_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      alert("📥 Đã tải file vsl_gesture_dataset_backup.json về máy thành công!");
    });
  }

  if (importDatasetBtn && importDatasetInput) {
    importDatasetBtn.addEventListener("click", () => {
      importDatasetInput.click();
    });

    importDatasetInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported && typeof imported === "object") {
            collectedDataset = imported;
            localStorage.setItem("vsl_custom_dataset", JSON.stringify(collectedDataset));
            updateSamplesList();
            alert(`📤 Nạp dữ liệu AI thành công! Đã khôi phục ${Object.keys(imported).length} nhóm từ cử chỉ VSL.`);
          } else {
            alert("File JSON không đúng cấu trúc dữ liệu VSL!");
          }
        } catch (err) {
          alert("Lỗi đọc file JSON: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

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
    <option value="${item.id}">${item.word} (${item.category || "VSL"})</option>
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
        alert("Từ này đã có trong danh sách!");
        return;
      }

      const newWordObj = { id: slug, word: val, category: "Custom" };
      customWords.push(newWordObj);
      localStorage.setItem("vsl_custom_words", JSON.stringify(customWords));

      if (!collectedDataset[slug]) {
        collectedDataset[slug] = [];
      }

      // Auto-generate local .wav native Vietnamese audio file via PHP backend endpoint
      fetch(
        `api/generate_audio.php?word=${encodeURIComponent(val)}&slug=${encodeURIComponent(slug)}`,
      )
        .then((res) => res.json())
        .then((resData) => {
          console.log("[Auto Audio Generator Success]:", resData);
        })
        .catch((err) => console.warn("Auto Audio Generator exception:", err));

      newWordInput.value = "";
      populateWordDropdown();
      signWordSelect.value = slug;
      updateSamplesList();
      alert(
        `Đã thêm từ mới "${val}" thành công và tự động tạo file âm thanh tiếng Việt! Bây giờ bạn có thể quay mẫu cho từ này.`,
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
  const AI_THROTTLE_MS = 33; // Balanced 30 FPS AI background execution

  async function initCollectorCamera() {
    try {
      if (!webcamVideo) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
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

    const frameData = featureExtractor.processFrame(results);
    if (velocityLabel) velocityLabel.innerText = `Vận tốc cử chỉ: ${frameData.velocity.toFixed(4)}`;

    if (
      isTestMode &&
      frameData.sequenceComplete &&
      frameData.sequenceComplete.length >= 4
    ) {
      const prediction = dtwClassifier.predict(frameData.sequenceComplete);

      const isPassed =
        !prediction.isRejected && prediction.confidence >= 80;
      const wordText = isPassed
        ? prediction.word
        : prediction.matchedTemplate
          ? `${prediction.matchedTemplate} (Dưới 80%)`
          : "Chưa nhận diện";

      const wordElem = document.getElementById("testPredictedWord");
      if (wordElem) wordElem.innerText = wordText;
      const badgeElem = document.getElementById("testConfidenceBadge");
      if (badgeElem) {
        badgeElem.innerText = `VSL ${prediction.confidence}%`;
        badgeElem.className = isPassed
          ? "text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800"
          : "text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800";
      }
      const distElem = document.getElementById("testDistanceText");
      if (distElem) distElem.innerText = `dist: ${prediction.distance} | threshold: ${prediction.thresholdUsed}`;

      if (isPassed && window.ttsService) {
        window.ttsService.speak(prediction.word);
      }

      testHistory.unshift({
        word: wordText,
        confidence: prediction.confidence,
        distance: prediction.distance,
        isPassed: isPassed,
        time: new Date().toLocaleTimeString(),
      });

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
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${item.isPassed ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-amber-950 text-amber-300 border border-amber-800"}">VSL ${item.confidence}%</span>
        </div>
      </div>
    `,
        )
        .join("");

      const logList = document.getElementById("testLogList");
      if (logList) logList.innerHTML = logHtml;
    }

    if (frameData.isRecording) {
      const motionOverlay = document.getElementById('recordingMotionOverlay');
      if (motionOverlay) motionOverlay.classList.remove('hidden');
      const frameCounter = document.getElementById('recordingFrameCounter');
      if (frameCounter) frameCounter.innerText = `${featureExtractor.currentSequence.length} frames`;
      if (statusLabel) {
        statusLabel.innerText = `🔴 Đang ghi nhận cử chỉ... (${featureExtractor.currentSequence.length} frames)`;
        statusLabel.className = "text-amber-400 font-bold animate-pulse";
      }
      const progressPct = Math.min(
        100,
        (featureExtractor.currentSequence.length /
          featureExtractor.maxFrames) *
          100,
      );
      if (progressBar) progressBar.style.width = `${progressPct}%`;
    } else {
      const motionOverlay = document.getElementById('recordingMotionOverlay');
      if (motionOverlay) motionOverlay.classList.add('hidden');
      if (!isRecordingSession && !isTestMode && statusLabel) {
        statusLabel.innerText = `Trạng thái: Sẵn sàng`;
        statusLabel.className = "text-slate-400 font-medium";
        if (progressBar) progressBar.style.width = `0%`;
      }
    }

    if (frameData.sequenceComplete && isRecordingSession) {
      saveRecordedSequence(frameData.sequenceComplete);
      isRecordingSession = false;
      if (startRecordBtn) startRecordBtn.classList.remove("hidden");
      if (stopRecordBtn) stopRecordBtn.classList.add("hidden");
      const frameCount = frameData.sequenceComplete.length;
      const durationSec = (frameCount * 0.1).toFixed(1);
      if (statusLabel) {
        statusLabel.innerText = `✅ ĐÃ LƯU MẪU THÀNH CÔNG! (Đã ghi ${frameCount} frames trong ${durationSec}s)`;
        statusLabel.className = "text-emerald-400 font-bold";
        setTimeout(() => {
          statusLabel.innerText = `Trạng thái: Sẵn sàng`;
          statusLabel.className = "text-slate-400 font-medium";
        }, 3000);
      }
    }
  }

  // 3-2-1 Countdown Recording Trigger
  if (startRecordBtn) {
    startRecordBtn.addEventListener("click", () => {
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
          isRecordingSession = true;
          startRecordBtn.classList.add("hidden");
          if (stopRecordBtn) stopRecordBtn.classList.remove("hidden");
          if (statusLabel) {
            statusLabel.innerText = `🔴 Hãy thực hiện cử chỉ ngay bây giờ...`;
            statusLabel.className = "text-amber-400 font-bold";
          }
        }
      }, 900);
    });
  }

  if (stopRecordBtn) {
    stopRecordBtn.addEventListener("click", () => {
      if (
        featureExtractor.currentSequence &&
        featureExtractor.currentSequence.length > 0
      ) {
        saveRecordedSequence(featureExtractor.currentSequence);
        if (statusLabel) {
          statusLabel.innerText = `✅ Đã lưu mẫu thủ công thành công! (${featureExtractor.currentSequence.length} frames)`;
          statusLabel.className = "text-emerald-400 font-bold";
        }
      } else {
        if (statusLabel) {
          statusLabel.innerText = `⚠️ Đã dừng quay.`;
          statusLabel.className = "text-amber-400 font-bold";
        }
      }

      featureExtractor.isRecording = false;
      featureExtractor.currentSequence = [];
      isRecordingSession = false;

      if (startRecordBtn) startRecordBtn.classList.remove("hidden");
      if (stopRecordBtn) stopRecordBtn.classList.add("hidden");

      setTimeout(() => {
        if (statusLabel) {
          statusLabel.innerText = `Trạng thái: Sẵn sàng`;
          statusLabel.className = "text-slate-400 font-medium";
        }
      }, 2000);
    });
  }

  function saveRecordedSequence(sequence) {
    const selectedId = signWordSelect.value;
    const selectedItem =
      dictionary.find((d) => d.id === selectedId) ||
      customWords.find((w) => w.id === selectedId);
    const wordName = selectedItem ? selectedItem.word : selectedId;

    const sampleObj = {
      id: selectedId,
      word: wordName,
      sequence: sequence,
      timestamp: new Date().toISOString(),
    };

    if (!collectedDataset[selectedId]) {
      collectedDataset[selectedId] = [];
    }

    collectedDataset[selectedId].push(sampleObj);

    localStorage.setItem(
      "vsl_custom_dataset",
      JSON.stringify(collectedDataset),
    );
    updateSamplesList();

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

  function updateSamplesList() {
    if (!signWordSelect || !samplesListContainer) return;
    const selectedId = signWordSelect.value;
    const samples = collectedDataset[selectedId] || [];

    let totalCount = 0;
    Object.keys(collectedDataset).forEach((k) => {
      totalCount += collectedDataset[k].length;
    });
    if (totalSampleBadge) totalSampleBadge.innerText = `${totalCount} mẫu tổng`;

    if (samples.length === 0) {
      samplesListContainer.innerHTML = `<p class="text-slate-500 text-xs italic">Từ này chưa có mẫu cử chỉ nào được lưu.</p>`;
    } else {
      samplesListContainer.innerHTML = samples
        .map(
          (item, i) => `
      <div class="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl text-xs">
        <div>
          <span class="font-bold text-sky-400">Mẫu #${i + 1}</span>
          <span class="text-slate-500 font-mono text-[10px] ml-2">(${item.sequence.length} frames)</span>
        </div>
        <button onclick="deleteSample('${selectedId}', ${i})" class="text-rose-400 hover:text-rose-300 font-bold">Xóa</button>
      </div>
    `,
        )
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
    }
  };

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
        fetch("api/save_dataset.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_all", dataset: {} }),
        }).then(() => {
          dtwClassifier.loadTemplates([]);
          updateSamplesList();
          alert(
            "✅ Đã reset sạch sẽ bộ nhớ! Tất cả mẫu cũ đã được xóa. Bạn có thể bắt đầu quay mẫu mới từ đầu!",
          );
        });
      }
    });
  }

  if (signWordSelect) signWordSelect.addEventListener("change", () => updateSamplesList());

  const exportBtn = document.getElementById("exportDatasetBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
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
            wordSamples.forEach((s) => {
              if (Array.isArray(s.sequence) && s.sequence.length > 0) {
                customTemplates.push({
                  id: s.id || wordId,
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
      const res = await fetch("api/get_dataset.php");
      const data = await res.json();
      let defaultTemplates = [];
      if (data && typeof data === "object") {
        Object.keys(data).forEach((wordId) => {
          const wordSamples = data[wordId];
          if (wordSamples && wordSamples.length > 0) {
            wordSamples.forEach((s) => {
              defaultTemplates.push({
                id: s.id || wordId,
                word: s.word || wordId,
                sequence: s.sequence,
              });
            });
          }
        });
      }
      const combined = [...customTemplates, ...defaultTemplates];
      dtwClassifier.loadTemplates(combined);
      console.log(
        `[Collector Live Tester] Đã nạp thành công ${combined.length} mẫu VSL từ Redis/Disk Cache vào DTW Classifier!`,
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
          statusLabel.innerText =
            "⏳ Đang nạp toàn bộ dataset từ Redis/Server Cache...";
          statusLabel.className = "text-sky-400 font-bold animate-pulse";
        }

        const count = await reloadTestClassifierTemplates();
        if (count === 0) {
          alert(
            "Chưa có mẫu cử chỉ VSL nào được lưu! Vui lòng chọn từ ký hiệu và bấm '🔴 Bắt Đầu Thu Thập Mẫu Cử Chỉ' quay ít nhất 1 mẫu trước khi test.",
          );
        }

        toggleTestBtn.className =
          "w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl border border-rose-400 text-sm flex items-center justify-center gap-2 shadow-lg transition-all animate-pulse";
        toggleTestBtn.innerHTML =
          "<span>🛑</span> Tắt Chế Độ Test Ký Hiệu Trực Tiếp";
        if (testOverlay) testOverlay.classList.remove("hidden");
        if (testLogCard) testLogCard.classList.remove("hidden");
        if (statusLabel) {
          statusLabel.innerText = `🧪 CHẾ ĐỘ TEST ĐANG BẬT (${count} mẫu đã nạp sẵn): Hãy làm cử chỉ tay trước camera...`;
          statusLabel.className = "text-emerald-400 font-bold animate-pulse";
        }
      } else {
        toggleTestBtn.className =
          "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl border border-emerald-400 text-sm flex items-center justify-center gap-2 shadow-lg transition-all";
        toggleTestBtn.innerHTML =
          "<span>🧪</span> Bật Chế Độ Test Ký Hiệu Trực Tiếp";
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
