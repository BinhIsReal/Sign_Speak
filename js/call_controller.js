/**
 * Call Controller for Sign_Speak Realtime WebRTC Video & VSL MediaPipe AI Pipeline
 * Optimized 30 FPS Native Performance with Inline Chat, Dynamic Partner Name & Sidebar Toggle Controls.
 */

let currentSubtitleMode = localStorage.getItem('subtitle_mode') || 'overlay';
let isCamOn = true;
let isMicOn = true;
let isSttOn = false;
let isTtsMuted = false;

let globalCurrentUserId = '';
let globalCurrentUserName = 'Tôi';

let featureExtractor = new FeatureExtractor();
let dtwClassifier = new DTWClassifier({ maxDistanceThreshold: 0.16 });
let lastInferenceTime = 0;
const INFERENCE_INTERVAL_MS = 35;

// Diagnostic Profiler Variables
let camFrameCount = 0;
let lastCamFpsTime = performance.now();
let currentCamFps = 60;
let aiProcessingTimeMs = 0;

let webcamVideo = null;
let remoteVideo = null;
let localCanvas = null;
let canvasCtx = null;
let subtitleOverlay = null;
let fixedSubtitleBar = null;
let subtitleText = null;
let subtitleConfidence = null;
let fixedSubtitleText = null;
let transcriptList = null;

let latestLandmarks = null;

// 1. Direct Hardware Video Rendering Monitor Loop (60 FPS Preview)
function renderCamLoop() {
  camFrameCount++;
  const now = performance.now();
  if (now - lastCamFpsTime >= 1000) {
    currentCamFps = Math.round((camFrameCount * 1000) / (now - lastCamFpsTime));
    camFrameCount = 0;
    lastCamFpsTime = now;

    const fpsElem = document.getElementById('hudCamFps');
    if (fpsElem) fpsElem.innerText = `${currentCamFps} FPS`;
  }

  if (canvasCtx && localCanvas) {
    // Clear transparent overlay & render skeleton landmarks
    canvasCtx.clearRect(0, 0, localCanvas.width, localCanvas.height);

    if (latestLandmarks && isCamOn) {
      canvasCtx.save();
      if (latestLandmarks.leftHandLandmarks) {
        drawConnectors(canvasCtx, latestLandmarks.leftHandLandmarks, HAND_CONNECTIONS, { color: '#0084FF', lineWidth: 2 });
      }
      if (latestLandmarks.rightHandLandmarks) {
        drawConnectors(canvasCtx, latestLandmarks.rightHandLandmarks, HAND_CONNECTIONS, { color: '#8300de', lineWidth: 2 });
      }
      canvasCtx.restore();
    }
  }

  requestAnimationFrame(renderCamLoop);
}

function loadClassifierTemplates() {
  const templatesToLoad = [];
  const savedCustomDataset = localStorage.getItem('vsl_custom_dataset');
  if (savedCustomDataset) {
    try {
      const customData = JSON.parse(savedCustomDataset);
      Object.keys(customData).forEach(wordId => {
        const wordSamples = customData[wordId];
        if (wordSamples && wordSamples.length > 0) {
          wordSamples.forEach(s => {
            if (Array.isArray(s.sequence) && s.sequence.length > 0) {
              templatesToLoad.push({
                id: s.id || wordId,
                word: s.word || wordId,
                sequence: s.sequence
              });
            }
          });
        }
      });
    } catch (e) {
      console.warn("Lỗi nạp vsl_custom_dataset:", e);
    }
  }

  fetch("assets/data/vsl_dataset_starter.json")
    .then(res => res.json())
    .then(starterData => {
      let defaultTemplates = [];
      if (starterData && typeof starterData === 'object') {
        Object.keys(starterData).forEach(wordId => {
          const wordSamples = starterData[wordId];
          if (wordSamples && wordSamples.length > 0) {
            wordSamples.forEach(s => {
              defaultTemplates.push({
                id: s.id || wordId,
                word: s.word || wordId,
                sequence: s.sequence
              });
            });
          }
        });
      }
      const combined = [...templatesToLoad, ...defaultTemplates];
      dtwClassifier.loadTemplates(combined);
      console.log(`[Sign Speak Call] Đã nạp ${combined.length} mẫu cử chỉ VSL vào DTW Classifier!`);
    })
    .catch(err => {
      if (templatesToLoad.length > 0) {
        dtwClassifier.loadTemplates(templatesToLoad);
      }
    });
}

let isProcessingFrame = false;
let lastCallAiTime = 0;
const AI_THROTTLE_MS = 33; // 30 FPS Native Hardware Performance

let accumulatedSentenceWords = [];

async function initCall() {
  try {
    webcamVideo = document.getElementById('webcamVideo');
    remoteVideo = document.getElementById('remoteVideo');
    localCanvas = document.getElementById('localCanvas');
    if (localCanvas) canvasCtx = localCanvas.getContext('2d');
    subtitleOverlay = document.getElementById('subtitleOverlay');
    fixedSubtitleBar = document.getElementById('fixedSubtitleBar');
    subtitleText = document.getElementById('subtitleText');
    subtitleConfidence = document.getElementById('subtitleConfidence');
    fixedSubtitleText = document.getElementById('fixedSubtitleText');
    transcriptList = document.getElementById('transcriptList');

    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room') || 'room_demo_vsl';
    const partnerParam = urlParams.get('partner');
    const statusElem = document.getElementById('roomStatusLabel');
    if (statusElem) statusElem.innerText = `Phòng: ${roomId} | WebRTC P2P Realtime`;

    // Apply user settings from localStorage
    const showHud = localStorage.getItem('show_diagnostic_hud') !== 'false';
    const hudElem = document.getElementById('diagnosticHud');
    if (hudElem) {
      if (showHud) hudElem.classList.remove('hidden');
      else hudElem.classList.add('hidden');
    }

    const overlayOpacity = localStorage.getItem('overlay_opacity') || '80';
    const fixedBarOpacity = localStorage.getItem('fixed_bar_opacity') || '90';

    if (subtitleOverlay) {
      const glassCard = subtitleOverlay.querySelector('.glass-caption');
      if (glassCard) {
        glassCard.style.backgroundColor = `rgba(0, 0, 0, ${overlayOpacity / 100})`;
      }
    }
    if (fixedSubtitleBar) {
      fixedSubtitleBar.style.backgroundColor = `rgba(0, 0, 0, ${fixedBarOpacity / 100})`;
    }

    // Dynamic Partner Name Resolution
    const remoteUserNameElem = document.getElementById('remoteUserName');
    if (remoteUserNameElem) {
      if (partnerParam) {
        remoteUserNameElem.innerText = decodeURIComponent(partnerParam);
      } else {
        const currentUser = await window.supabaseService.getCurrentUser();
        const currentId = currentUser ? currentUser.id : '';
        const allUsers = await window.supabaseService.searchGlobalUsers('', 'all');
        const matchedPartner = allUsers.find(u => u.id !== currentId && (u.friendStatus === 'accepted' || u.friendStatus === 'none'));
        if (matchedPartner) {
          remoteUserNameElem.innerText = matchedPartner.display_name;
        } else {
          remoteUserNameElem.innerText = "Người Đối Diện";
        }
      }
    }

    // User Session Context for Call Signaling
    const currentUser = await window.supabaseService.getCurrentUser();
    const currentUserId = currentUser ? currentUser.id : 'usr_' + Date.now();
    const currentUserName = currentUser ? (currentUser.user_metadata.display_name || 'Tôi') : 'Tôi';
    const currentUserRole = currentUser ? (currentUser.user_metadata.role || 'deaf') : 'deaf';
    const currentUserAvatar = currentUser ? (currentUser.user_metadata.display_name ? currentUser.user_metadata.display_name.substring(0, 2).toUpperCase() : 'US') : 'US';
    const roleParam = urlParams.get('role') || 'caller';

    globalCurrentUserId = currentUserId;
    globalCurrentUserName = currentUserName;

    // Init MediaPipe Hands
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((rawResults) => {
      const results = {
        leftHandLandmarks: null,
        rightHandLandmarks: null
      };

      if (rawResults.multiHandLandmarks && rawResults.multiHandedness) {
        for (let i = 0; i < rawResults.multiHandLandmarks.length; i++) {
          const label = rawResults.multiHandedness[i].label;
          const landmarks = rawResults.multiHandLandmarks[i];
          if (label === 'Left') {
            results.leftHandLandmarks = landmarks;
          } else {
            results.rightHandLandmarks = landmarks;
          }
        }
      }

      onResults(results);
    });

    const localStream = await webRTCService.getLocalStream(null);
    if (webcamVideo) {
      webcamVideo.srcObject = localStream;
      webcamVideo.play().catch(e => {
        if (e.name !== 'AbortError') console.warn("play video warning:", e);
      });

      const camera = new Camera(webcamVideo, {
        onFrame: async () => {
          if (isProcessingFrame) return;

          const now = performance.now();
          if (now - lastCallAiTime < AI_THROTTLE_MS) return;
          lastCallAiTime = now;

          isProcessingFrame = true;
          const aiStart = performance.now();

          try {
            await hands.send({ image: webcamVideo });
          } catch (err) {
            // ignore
          } finally {
            aiProcessingTimeMs = Math.round(performance.now() - aiStart);
            isProcessingFrame = false;

            const aiElem = document.getElementById('hudAiMs');
            if (aiElem) aiElem.innerText = `${aiProcessingTimeMs}ms`;
          }
        },
        width: 640,
        height: 480
      });
      camera.start();
    }

    // WebRTC Peer Connection & Remote Video Stream Setup
    webRTCService.initPeerConnection(
      roomId,
      (remoteStream) => {
        // BUG #4 FIX: Properly handle remoteVideo srcObject assignment and play() errors.
        // Previously, play() was called with an empty catch that silently swallowed
        // NotAllowedError / NotSupportedError, leaving the remote video black.
        if (remoteVideo) {
          console.log('[WebRTC] Attaching remote stream to video element. Tracks:', remoteStream.getTracks().map(t => t.kind));
          remoteVideo.srcObject = remoteStream;
          const playPromise = remoteVideo.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              if (err.name === 'AbortError') return; // Browser interrupted play — safe to ignore
              console.error('[WebRTC] remoteVideo.play() failed:', err.name, err.message);
              // Retry once on NotAllowedError (browser autoplay policy) by muting then playing
              if (err.name === 'NotAllowedError') {
                remoteVideo.muted = true;
                remoteVideo.play().catch(e2 => console.error('[WebRTC] remoteVideo.play() retry failed:', e2));
              }
            });
          }
        }
      },
      (state) => {
        console.log("[WebRTC Connection State]:", state);
        const statusElem = document.getElementById('roomStatusLabel');
        if (statusElem) {
          if (state === 'connected') {
            statusElem.innerText = `Phòng: ${roomId} | Đã kết nối WebRTC P2P Trực tiếp 🟢`;
          } else if (state === 'connecting') {
            statusElem.innerText = `Phòng: ${roomId} | Đang thiết lập P2P... 🟡`;
          } else {
            statusElem.innerText = `Phòng: ${roomId} | WebRTC P2P Realtime`;
          }
        }
      },
      currentUserId,
      roleParam === 'caller'
    );

    // Subscribe to Signaling Room for WebRTC & Multimodal Subtitles
    window.supabaseService.subscribeSignalingRoom(roomId, async (signal) => {
      if (!signal) return;

      if (signal.type === 'call-ended') {
        if (signal.senderId !== currentUserId) {
          const senderLabel = signal.senderName || 'Đối Phương';
          updateSubtitleDisplay(`🔴 [Hệ thống]: ${senderLabel} đã kết thúc cuộc gọi. Đang chuyển về danh bạ...`, 'Cuộc gọi kết thúc');
          addTranscriptLog('Hệ thống', `${senderLabel} đã kết thúc cuộc gọi.`);

          setTimeout(() => {
            webRTCService.endCall();
            window.location.href = 'contacts.html';
          }, 1500);
        }
        return;
      }

      if (signal.type === 'multimodal-subtitle') {
        if (signal.senderId === currentUserId) return;

        const senderLabel = signal.senderName || 'Đối Phương';

        if (signal.kind === 'vsl') {
          updateSubtitleDisplay(`🤟 [${senderLabel} (VSL)]: ${signal.text}`, `VSL ${signal.confidence || 95}%`);
          addTranscriptLog(`${senderLabel} (VSL)`, signal.text);

          if (window.ttsService && !isTtsMuted) {
            window.ttsService.speak(signal.text);
          }
        } else if (signal.kind === 'stt') {
          const isFinal = signal.isFinal;
          updateSubtitleDisplay(`🎙️ [${senderLabel} (Giọng nói)]: ${signal.text}${isFinal ? '' : '...'}`, isFinal ? 'STT Hoàn thành' : 'STT Đang nói...');

          if (isFinal) {
            addTranscriptLog(`${senderLabel} (STT)`, signal.text);
          }
        }
      } else {
        webRTCService.handleIncomingSignal(signal, currentUserId);
      }
    });

    // Subscribe Realtime Broadcast Messages in Inline Chat
    window.supabaseService.subscribeChatRoom(roomId, (msg) => {
      if (msg && msg.sender_id !== currentUserId) {
        addTranscriptLog(msg.sender_name || 'BẠN BÈ', msg.text);
      }
    });

    // If caller, send call notification to partner & create WebRTC offer
    if (roleParam === 'caller') {
      const allUsers = await window.supabaseService.searchGlobalUsers('', 'all');
      const partnerUser = allUsers.find(u => u.id !== currentUserId && (partnerParam ? u.display_name === decodeURIComponent(partnerParam) : true));
      if (partnerUser) {
        await window.supabaseService.sendCallNotification(partnerUser.id, {
          type: 'incoming_call',
          roomId: roomId,
          callerId: currentUserId,
          callerName: currentUserName,
          callerAvatar: currentUserAvatar,
          callerRole: currentUserRole
        });
      }

      // Fallback offer creation: fires if callee joined BEFORE we subscribed
      // to the signaling channel (i.e., we missed the 'peer-joined' broadcast).
      // createCallOffer() has an internal `offerCreated` guard, so even if
      // 'peer-joined' already triggered an offer, this call is a no-op.
      setTimeout(() => {
        webRTCService.createCallOffer(currentUserId);
      }, 1500);
    }

  } catch (e) {
    console.error("Lỗi khởi tạo cuộc gọi:", e);
  }
}

function onResults(results) {
  latestLandmarks = results;

  let handCount = 0;
  if (results.leftHandLandmarks) handCount++;
  if (results.rightHandLandmarks) handCount++;

  const handElem = document.getElementById('hudHandCount');
  if (handElem) {
    handElem.innerText = handCount === 0 ? "0 tay" : (handCount === 1 ? "1 tay" : "2 tay");
  }

  const now = performance.now();
  if (now - lastInferenceTime >= INFERENCE_INTERVAL_MS) {
    lastInferenceTime = now;

    const frameData = featureExtractor.processFrame(results);

    if (frameData.sentenceEnded) {
      if (accumulatedSentenceWords.length > 0) {
        const finalSentence = accumulatedSentenceWords.join(' ');
        console.log(`[Sentence Finalized]: "${finalSentence}"`);
        addTranscriptLog('TÔI (VSL)', finalSentence);
        accumulatedSentenceWords = [];
      }
    }

    if (frameData.sequenceComplete && frameData.sequenceComplete.length >= 4) {
      const prediction = dtwClassifier.predict(frameData.sequenceComplete);

      if (!prediction.isRejected && prediction.word && prediction.confidence >= 80) {
        let resolvedWord = prediction.word;
        if (window.contextResolver) {
          const urlParams = new URLSearchParams(window.location.search);
          const currentRoomId = urlParams.get('room') || 'room_demo_vsl';
          const resolvedObj = window.contextResolver.resolve(prediction.word, [], currentRoomId);
          resolvedWord = resolvedObj.primaryWord;
        }

        accumulatedSentenceWords.push(resolvedWord);
        const cumulativeText = accumulatedSentenceWords.join(' ');

        updateSubtitleDisplay(`🤟 [Bạn (VSL)]: ${cumulativeText}`, `VSL ${prediction.confidence}%`);

        // Broadcast VSL gesture text to Partner Realtime over Supabase Realtime Signaling Channel!
        const currentUser = window.supabaseService ? window.supabaseService.cachedCurrentUser : null;
        const currentUserId = currentUser ? currentUser.id : 'usr_local';
        const currentUserName = currentUser ? (currentUser.user_metadata.display_name || 'Tôi') : 'Tôi';

        window.supabaseService.sendSignalingMessage({
          type: 'multimodal-subtitle',
          kind: 'vsl',
          text: cumulativeText,
          confidence: prediction.confidence,
          senderId: currentUserId,
          senderName: currentUserName
        });
      }
    }
  }
}

function updateSubtitleDisplay(text, badgeInfo) {
  if (subtitleText) subtitleText.innerText = text;
  if (subtitleConfidence) subtitleConfidence.innerText = badgeInfo ? `(${badgeInfo})` : '';
  if (fixedSubtitleText) fixedSubtitleText.innerText = text;
}

function addTranscriptLog(sender, text) {
  if (!transcriptList) return;
  const escape = window.securityGuard ? window.securityGuard.escapeHTML.bind(window.securityGuard) : (s => s);
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isMe = sender === 'Tôi' || sender === (localStorage.getItem('user_full_name') || localStorage.getItem('user_display_name') || '');

  const itemHtml = `
    <div class="flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}">
      <div class="flex items-center gap-2 px-1">
        <span class="text-[10px] font-bold ${isMe ? 'text-sky-500' : 'text-primary'} tracking-tight uppercase">${escape(sender)}</span>
        <span class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">${timeStr}</span>
      </div>
      <div class="${isMe ? 'bg-primary text-white' : 'bg-white dark:bg-[#151e32] text-slate-900 dark:text-white border border-slate-200/80 dark:border-slate-700/80'} rounded-2xl px-3.5 py-2 max-w-[95%] messenger-shadow">
        <p class="text-xs leading-relaxed">${escape(text)}</p>
      </div>
    </div>
  `;
  transcriptList.insertAdjacentHTML('beforeend', itemHtml);
  transcriptList.scrollTop = transcriptList.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
  loadClassifierTemplates();
  requestAnimationFrame(renderCamLoop);
  initCall();

  // Sidebar Toggle (75% / 25% <-> 100% / 0%)
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const videoSection = document.getElementById('videoSection');
  const transcriptSidebar = document.getElementById('transcriptSidebar');
  const toggleSidebarLabel = document.getElementById('toggleSidebarLabel');

  if (toggleSidebarBtn && videoSection && transcriptSidebar) {
    let isCollapsed = false;
    toggleSidebarBtn.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        transcriptSidebar.classList.add('hidden');
        videoSection.classList.remove('w-[75%]');
        videoSection.classList.add('w-full');
        if (toggleSidebarLabel) toggleSidebarLabel.innerText = "Hiện Nhật Ký & Chat";
      } else {
        transcriptSidebar.classList.remove('hidden');
        videoSection.classList.remove('w-full');
        videoSection.classList.add('w-[75%]');
        if (toggleSidebarLabel) toggleSidebarLabel.innerText = "Nhật ký & Chat";
      }
    });
  }

  // Inline Realtime Chat Form Handler
  const callChatForm = document.getElementById('callChatForm');
  const callChatInput = document.getElementById('callChatInput');

  if (callChatForm && callChatInput) {
    callChatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawText = callChatInput.value.trim();
      const sanitize = window.securityGuard ? window.securityGuard.sanitizeInput.bind(window.securityGuard) : (s => s);
      const cleanText = sanitize(rawText);

      if (!cleanText) return;

      callChatInput.value = '';
      const currentUser = await window.supabaseService.getCurrentUser();
      const senderName = currentUser ? (currentUser.user_metadata.display_name || 'Tôi') : 'Tôi';

      addTranscriptLog(senderName, cleanText);

      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get('room') || 'room_demo_vsl';

      await window.supabaseService.saveChatMessage(roomId, {
        id: 'msg_' + Date.now(),
        room_id: roomId,
        sender_id: currentUser ? currentUser.id : 'user_local',
        sender_name: senderName,
        text: cleanText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    });
  }

  const camBtn = document.getElementById('toggleCamBtn');
  if (camBtn) {
    camBtn.addEventListener('click', () => {
      isCamOn = !isCamOn;
      webRTCService.toggleVideo(isCamOn);

      const localWrapper = document.getElementById('localCanvasWrapper');
      const localVideo = document.getElementById('webcamVideo');

      if (!isCamOn) {
        if (localVideo) localVideo.style.opacity = '0';
        if (localWrapper) {
          let placeholder = document.getElementById('camOffPlaceholder');
          if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.id = 'camOffPlaceholder';
            placeholder.className = 'absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white z-20 rounded-2xl';
            placeholder.innerHTML = `<span class="material-symbols-outlined text-4xl text-slate-400">videocam_off</span><p class="text-xs text-slate-400 mt-2 font-medium">Camera đã tắt</p>`;
            localWrapper.appendChild(placeholder);
          }
          placeholder.style.display = 'flex';
        }
      } else {
        if (localVideo) localVideo.style.opacity = '1';
        const placeholder = document.getElementById('camOffPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
      }

      const icon = camBtn.querySelector('.material-symbols-outlined');
      if (isCamOn) {
        camBtn.classList.remove('bg-rose-600', 'text-white');
        camBtn.classList.add('bg-surface', 'text-on-surface-variant');
        if (icon) icon.innerText = 'videocam';
        camBtn.title = "Tắt Camera";
      } else {
        camBtn.classList.add('bg-rose-600', 'text-white');
        camBtn.classList.remove('bg-surface', 'text-on-surface-variant');
        if (icon) icon.innerText = 'videocam_off';
        camBtn.title = "Bật Camera";
      }
    });
  }

  const micBtn = document.getElementById('toggleMicBtn');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      isMicOn = !isMicOn;
      webRTCService.toggleAudio(isMicOn);
      const icon = micBtn.querySelector('.material-symbols-outlined');
      if (isMicOn) {
        micBtn.classList.remove('bg-rose-600', 'text-white');
        micBtn.classList.add('bg-surface', 'text-on-surface-variant');
        if (icon) icon.innerText = 'mic';
        micBtn.title = "Tắt Micro";
      } else {
        micBtn.classList.add('bg-rose-600', 'text-white');
        micBtn.classList.remove('bg-surface', 'text-on-surface-variant');
        if (icon) icon.innerText = 'mic_off';
        micBtn.title = "Bật Micro";
      }
    });
  }

  const mirrorBtn = document.getElementById('toggleMirrorBtn');
  if (mirrorBtn) {
    mirrorBtn.addEventListener('click', () => {
      const wrapper = document.getElementById('localCanvasWrapper');
      if (wrapper) wrapper.classList.toggle('mirror-mode');
    });
  }

  const sttBtn = document.getElementById('toggleSTTBtn');
  if (sttBtn) {
    sttBtn.addEventListener('click', () => {
      isSttOn = !isSttOn;
      if (isSttOn) {
        window.sttService.startListening(
          (transcriptData) => {
            if (transcriptData.interim) {
              updateSubtitleDisplay(`🎙️ ${transcriptData.interim}...`, 'STT Đang nói');
            }
            if (transcriptData.final) {
              updateSubtitleDisplay(`🎙️ ${transcriptData.final}`, 'Giọng nói STT');
              addTranscriptLog('NGƯỜI NÓI (STT)', transcriptData.final);
            }
          },
          (err) => {
            console.warn("Lỗi Speech Recognition:", err);
            if (err === 'unsupported_browser') {
              alert("Trình duyệt hiện tại không hỗ trợ Web Speech Recognition API. Vui lòng sử dụng Google Chrome hoặc Microsoft Edge.");
            }
          }
        );
        sttBtn.classList.add('bg-primary', 'text-white', 'shadow-lg', 'shadow-primary/30', 'animate-pulse');
        sttBtn.classList.remove('bg-surface', 'text-on-surface-variant', 'bg-primary/10', 'text-primary');
        sttBtn.title = "Đang lắng nghe giọng nói ➔ Chuyển thành Phụ đề (Click để tắt)";
      } else {
        window.sttService.stopListening();
        updateSubtitleDisplay('Đang lắng nghe cử chỉ VSL và giọng nói...', 'VSL System');
        sttBtn.classList.remove('bg-primary', 'text-white', 'shadow-lg', 'shadow-primary/30', 'animate-pulse');
        sttBtn.classList.add('bg-primary/10', 'text-primary');
        sttBtn.title = "Chuyển giọng nói thành văn bản (Speech-to-Text)";
      }
    });
  }

  const ttsBtn = document.getElementById('toggleTTSBtn');
  if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      isTtsMuted = !isTtsMuted;
      const icon = ttsBtn.querySelector('.material-symbols-outlined');
      if (isTtsMuted) {
        ttsBtn.classList.add('bg-rose-600', 'text-white');
        ttsBtn.classList.remove('bg-surface', 'text-primary');
        if (icon) icon.innerText = 'volume_off';
        ttsBtn.title = "Đã tắt tiếng AI đọc dịch VSL (Click để Bật lại)";
      } else {
        ttsBtn.classList.remove('bg-rose-600', 'text-white');
        ttsBtn.classList.add('bg-surface', 'text-primary');
        if (icon) icon.innerText = 'volume_up';
        ttsBtn.title = "Đang bật tiếng AI đọc dịch VSL (Click để Tắt)";
      }
    });
  }

  const endCallBtn = document.getElementById('endCallBtn');
  if (endCallBtn) {
    endCallBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.supabaseService.sendSignalingMessage({
        type: 'call-ended',
        senderId: globalCurrentUserId,
        senderName: globalCurrentUserName
      });
      webRTCService.endCall();
      window.location.href = 'contacts.html';
    });
  }

  window.addEventListener('beforeunload', () => {
    window.supabaseService.sendSignalingMessage({
      type: 'call-ended',
      senderId: globalCurrentUserId,
      senderName: globalCurrentUserName
    });
    webRTCService.endCall();
  });

  const modeBtn = document.getElementById('switchSubtitleModeBtn');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      if (currentSubtitleMode === 'overlay') {
        currentSubtitleMode = 'fixed';
        if (subtitleOverlay) subtitleOverlay.classList.add('hidden');
        if (fixedSubtitleBar) fixedSubtitleBar.classList.remove('hidden');
        modeBtn.innerText = 'Fixed Subtitle Bar 🔄';
      } else {
        currentSubtitleMode = 'overlay';
        if (subtitleOverlay) subtitleOverlay.classList.remove('hidden');
        if (fixedSubtitleBar) fixedSubtitleBar.classList.add('hidden');
        modeBtn.innerText = 'Glassmorphism Overlay 🔄';
      }
      localStorage.setItem('subtitle_mode', currentSubtitleMode);
    });
  }
});
