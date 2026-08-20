/**
 * Call Controller for Sign_Speak Realtime WebRTC Video & Gesture MediaPipe AI Pipeline
 * Optimized 30 FPS Native Performance with Inline Chat, Dynamic Partner Name & Sidebar Toggle Controls.
 */

let currentSubtitleMode = localStorage.getItem('subtitle_mode') || 'overlay';
let isCamOn = true;
let isMicOn = true;
let isSttOn = false;
let isTtsMuted = false;

// Unique per-tab instance ID in memory to distinguish tabs/devices cleanly
const runtimeTabInstanceId = 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();

let globalCurrentUserId = '';
let globalCurrentUserName = 'Tôi';
let globalRoomId = '';
let globalPartnerParam = '';
let globalTargetPartnerId = '';
let globalIsCaller = false;
let callSecondsElapsed = 0;
let callTimerInterval = null;

function formatCallDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0 giây';
  if (totalSeconds < 60) {
    return `${totalSeconds} giây`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} giờ ${minutes} phút ${seconds > 0 ? seconds + ' giây' : ''}`.trim();
  } else {
    return `${minutes} phút ${seconds > 0 ? seconds + ' giây' : ''}`.trim();
  }
}

function startCallTimer() {
  if (callTimerInterval) return;
  callSecondsElapsed = 0;
  const timerBadge = document.getElementById('callTimerBadge');
  const timerLabel = document.getElementById('callTimerLabel');
  if (timerBadge) {
    timerBadge.classList.remove('hidden');
    timerBadge.style.display = 'inline-flex';
  }
  if (timerLabel) {
    timerLabel.innerText = `00:00`;
  }
  callTimerInterval = setInterval(() => {
    callSecondsElapsed++;
    if (timerLabel) {
      const m = Math.floor((callSecondsElapsed % 3600) / 60).toString().padStart(2, '0');
      const s = (callSecondsElapsed % 60).toString().padStart(2, '0');
      const h = Math.floor(callSecondsElapsed / 3600);
      if (h > 0) {
        const hStr = h.toString().padStart(2, '0');
        timerLabel.innerText = `${hStr}:${m}:${s}`;
      } else {
        timerLabel.innerText = `${m}:${s}`;
      }
    }
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
}

let featureExtractor = new FeatureExtractor();
let dtwClassifier = new DTWClassifier({ maxDistanceThreshold: 0.16 });
let lastInferenceTime = 0;
const INFERENCE_INTERVAL_MS = 35;

// Cooldown to prevent duplicate rapid triggering of the same gesture while holding hand still
let lastRecognizedWord = '';
let lastRecognizedWordTime = 0;
const WORD_RECOGNITION_COOLDOWN_MS = 1400;

// Diagnostic Profiler Variables
let camFrameCount = 0;
let lastCamFpsTime = performance.now();
let currentCamFps = 60;
let aiProcessingTimeMs = 0;

// Session Accuracy Tracking
let sessionWordCount = 0;
let sessionAttemptCount = 0;

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

async function loadClassifierTemplates() {
  const templatesToLoad = [];
  const savedCustomDataset = localStorage.getItem('vsl_custom_dataset');
  if (savedCustomDataset) {
    try {
      const customData = JSON.parse(savedCustomDataset);
      Object.keys(customData).forEach(wordId => {
        const wordSamples = customData[wordId];
        if (wordSamples && wordSamples.length > 0) {
          wordSamples.forEach((s, idx) => {
            if (Array.isArray(s.sequence) && s.sequence.length > 0) {
              templatesToLoad.push({
                id: s.id || `${wordId}_custom_${idx + 1}`,
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

  try {
    const res = await fetch(`assets/data/vsl_dataset.json?v=${Date.now()}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const masterData = await res.json();
    let masterTemplates = [];
    if (masterData && typeof masterData === 'object') {
      Object.keys(masterData).forEach(wordId => {
        const wordSamples = masterData[wordId];
        if (wordSamples && wordSamples.length > 0) {
          wordSamples.forEach((s, idx) => {
            if (Array.isArray(s.sequence) && s.sequence.length > 0) {
              masterTemplates.push({
                id: s.id || `${wordId}_master_${idx + 1}`,
                word: s.word || wordId,
                sequence: s.sequence
              });
            }
          });
        }
      });
    }
    // Deduplicate templates by ID (custom user recorded templates override master templates)
    const templateMap = new Map();
    masterTemplates.forEach(t => templateMap.set(t.id, t));
    templatesToLoad.forEach(t => templateMap.set(t.id, t));
    const combined = Array.from(templateMap.values());
    dtwClassifier.loadTemplates(combined);
    console.log(`[Sign Speak Call] Đã nạp thành công ${combined.length} mẫu cử chỉ ký hiệu (toàn bộ 35 từ & bảng chữ cái) vào DTW Classifier!`);
  } catch (err) {
    console.warn("Lỗi nạp assets/data/vsl_dataset.json:", err);
    if (templatesToLoad.length > 0) {
      dtwClassifier.loadTemplates(templatesToLoad);
    }
  }
}

// Cross-tab dataset auto-sync listeners
if (typeof BroadcastChannel !== 'undefined') {
  const datasetSyncChannel = new BroadcastChannel('vsl_dataset_sync');
  datasetSyncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'DATASET_UPDATED') {
      console.log('[Sign Speak Call] Nhận được tín hiệu cập nhật dataset từ Collector, tự động nạp lại mẫu cử chỉ...');
      loadClassifierTemplates();
    }
  };
}

window.addEventListener('storage', (e) => {
  if (e.key === 'vsl_custom_dataset' || e.key === 'vsl_custom_words') {
    console.log('[Sign Speak Call] Phát hiện dữ liệu dataset thay đổi trong localStorage, tự động nạp lại...');
    loadClassifierTemplates();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadClassifierTemplates();
  }
});

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
    subtitleOverlay = document.getElementById('floatingSubtitleOverlay') || document.getElementById('subtitleOverlay');
    fixedSubtitleBar = document.getElementById('fixedSubtitleBar');
    subtitleText = document.getElementById('subtitleText');
    subtitleConfidence = document.getElementById('subtitleConfidence');
    fixedSubtitleText = document.getElementById('fixedSubtitleText');
    transcriptList = document.getElementById('transcriptList');

    const urlParams = new URLSearchParams(window.location.search);
    globalRoomId = urlParams.get('room') || 'room_demo_vsl';
    const roomId = globalRoomId;
    globalPartnerParam = urlParams.get('partner') || '';
    const partnerParam = globalPartnerParam;
    const statusElem = document.getElementById('roomStatusLabel');
    if (statusElem) statusElem.innerText = `Phòng: ${roomId} | WebRTC P2P Realtime`;

    // Apply user settings from localStorage
    const showHud = localStorage.getItem('show_diagnostic_hud') === 'true';
    const hudElem = document.getElementById('diagnosticHud');
    if (hudElem) {
      if (showHud) {
        hudElem.style.display = 'block';
        hudElem.classList.remove('hidden');
      } else {
        hudElem.style.display = 'none';
        hudElem.classList.add('hidden');
      }
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

    // Dynamic Partner Name Resolution (Instant from URL)
    let resolvedPartnerName = partnerParam ? decodeURIComponent(partnerParam) : "Người Đối Diện";
    globalPartnerParam = resolvedPartnerName;

    const remotePeerLabel = document.getElementById('remotePeerLabel');
    if (remotePeerLabel) remotePeerLabel.innerText = resolvedPartnerName;
    const callRoomBadge = document.getElementById('callRoomBadge');
    if (callRoomBadge) callRoomBadge.innerText = `Phòng: ${roomId} • ${resolvedPartnerName}`;
    const miniPartnerName = document.getElementById('miniPartnerName');
    if (miniPartnerName) miniPartnerName.innerText = resolvedPartnerName;

    // User Session Context for Call Signaling
    const roleParam = urlParams.get('role');
    const currentUser = await window.supabaseService.getCurrentUser();
    let currentUserId = currentUser ? currentUser.id : (localStorage.getItem('user_id') || sessionStorage.getItem('call_user_id'));
    
    const userIds = roomId.replace('room_', '').split('_');
    if (!currentUserId) {
      currentUserId = (roleParam === 'callee') ? (userIds[1] || 'usr_b_' + Date.now()) : (userIds[0] || 'usr_a_' + Date.now());
    }
    sessionStorage.setItem('call_user_id', currentUserId);

    let targetPartnerId = '';
    if (Array.isArray(userIds) && userIds.length >= 2) {
      targetPartnerId = userIds.find(id => id && id !== currentUserId) || (currentUserId === userIds[0] ? userIds[1] : userIds[0]);
    }

    // Deterministic role determination:
    // If role parameter is in URL, respect it ('caller' vs 'callee').
    // If no role parameter, userIds[0] is caller, userIds[1] is callee.
    const isCaller = roleParam ? (roleParam === 'caller') : (currentUserId === userIds[0]);
    console.log(`[Call Init] Current User: ${currentUserId}, Partner: ${targetPartnerId}, isCaller: ${isCaller}`);

    let currentUserName = currentUser ? (currentUser.user_metadata?.display_name || 'Tôi') : (localStorage.getItem('user_full_name') || localStorage.getItem('user_display_name') || 'Tôi');
    let currentUserRole = currentUser ? (currentUser.user_metadata?.role || 'deaf') : (localStorage.getItem('user_role') || 'deaf');
    let currentUserAvatar = currentUserName ? currentUserName.substring(0, 2).toUpperCase() : 'US';

    globalCurrentUserId = currentUserId;
    globalCurrentUserName = currentUserName;
    globalTargetPartnerId = targetPartnerId;
    globalIsCaller = isCaller;

    // STEP 1: PARALLEL BACKGROUND DATASET LOAD
    loadClassifierTemplates().catch(e => console.warn("Background load templates warning:", e));

    // STEP 2: SETUP MEDIAPIPE HANDS
    let hands = null;
    try {
      hands = new Hands({
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
    } catch (e) {
      console.warn("MediaPipe Hands init warning:", e);
    }

    // STEP 3: GET LOCAL CAMERA STREAM IMMEDIATELY
    const localStream = await webRTCService.getLocalStream(webcamVideo);
    if (webcamVideo) {
      webcamVideo.srcObject = localStream;
      webcamVideo.play().catch(e => {
        if (e.name !== 'AbortError') console.warn("play video warning:", e);
      });

      async function processVideoFrame() {
        if (webcamVideo && !webcamVideo.paused && !webcamVideo.ended && webcamVideo.readyState >= 2 && hands) {
          if (!isProcessingFrame) {
            const now = performance.now();
            if (now - lastCallAiTime >= AI_THROTTLE_MS) {
              lastCallAiTime = now;
              isProcessingFrame = true;
              const aiStart = performance.now();
              try {
                await hands.send({ image: webcamVideo });
              } catch (err) {
              } finally {
                aiProcessingTimeMs = Math.round(performance.now() - aiStart);
                isProcessingFrame = false;
                const aiElem = document.getElementById('hudAiMs');
                if (aiElem) aiElem.innerText = `${aiProcessingTimeMs}ms`;
              }
            }
          }
        }
        requestAnimationFrame(processVideoFrame);
      }
      requestAnimationFrame(processVideoFrame);
    }

    // Subscribe to Signaling Room for WebRTC & Multimodal Subtitles FIRST
    // This is the ONLY subscription - webrtc_service.js does NOT subscribe independently
    window.supabaseService.subscribeSignalingRoom(roomId, async (signal) => {
      if (!signal) return;

      // Handle Call Declined by partner -> Exit caller immediately
      if (signal.type === 'call-declined' || signal.type === 'call_declined' || signal.type === 'call-rejected') {
        if (signal.senderId !== currentUserId) {
          stopCallTimer();
          if (window.supabaseService) window.supabaseService.stopCallRingingHeartbeat();
          webRTCService.endCall();
          updateSubtitleDisplay(`⚠️ Đối phương đã từ chối cuộc gọi. Đang quay lại...`, 'Từ chối');
          const statusText = document.getElementById('callStatusText');
          if (statusText) {
            statusText.className = "text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 shrink-0";
            statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> <span>Cuộc gọi bị từ chối</span>`;
          }
          setTimeout(() => {
            window.location.href = 'index.html';
          }, 1800);
        }
        return;
      }

      if (signal.type === 'call-ended') {
        if (signal.senderId !== currentUserId) {
          stopCallTimer();
          if (window.supabaseService) window.supabaseService.stopCallRingingHeartbeat();
          webRTCService.endCall();
          window.location.href = 'index.html';
        }
        return;
      }

      if (signal.type === 'peer-joined' || signal.type === 'answer') {
        if (window.supabaseService) window.supabaseService.stopCallRingingHeartbeat();
      }

      if (signal.type === 'multimodal-subtitle') {
        // Prevent echo loopback if message originated from this exact tab instance or local user ID
        if (signal.instanceId && signal.instanceId === runtimeTabInstanceId) return;
        if (signal.senderId && (signal.senderId === globalCurrentUserId || signal.senderId === currentUserId)) return;

        const senderLabel = signal.senderName || 'Đối Phương';

        if (signal.kind === 'vsl' || signal.kind === 'gesture') {
          updateSubtitleDisplay(`🤟 [${senderLabel}]: ${signal.text}`, `Độ khớp: ${signal.confidence || 95}%`);
          addTranscriptLog(`${senderLabel}`, signal.text, false);

          if (window.ttsService && !isTtsMuted) {
            // Speak ONLY the newly recognized gesture word/token, NOT the accumulated sentence from the beginning!
            const tokenToSpeak = signal.word || (signal.text ? signal.text.trim().split(/\s+/).pop() : '');
            if (tokenToSpeak) {
              window.ttsService.speak(tokenToSpeak);
            }
          }
        } else if (signal.kind === 'stt') {
          const isFinal = signal.isFinal;
          updateSubtitleDisplay(`🎙️ [${senderLabel} (Giọng nói)]: ${signal.text}${isFinal ? '' : '...'}`, isFinal ? 'STT Hoàn thành' : 'STT Đang nói...');

          if (isFinal) {
            addTranscriptLog(`${senderLabel} (STT)`, signal.text, false);
          }
        }
        return;
      }

      // Forward ALL WebRTC signals (peer-joined, offer, answer, ice-candidate) to webRTCService
      await webRTCService.handleIncomingSignal(signal, currentUserId);
    });

    // WebRTC Peer Connection & Remote Video Stream Setup
    await webRTCService.initPeerConnection(
      roomId,
      (remoteStream) => {
        console.log("[WebRTC] onRemoteStream event fired with tracks:", remoteStream ? remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`) : 'none');
        
        // 1. Update Main Desktop/Mobile Remote Video
        const mainRemote = document.getElementById('remoteVideo') || remoteVideo;
        if (mainRemote && remoteStream) {
          const safePlay = (videoEl) => {
            videoEl.pause();
            videoEl.muted = true; // start muted to guarantee autoplay
            videoEl.srcObject = remoteStream;
            videoEl.playsInline = true;
            videoEl.autoplay = true;
            const playAttempt = videoEl.play();
            if (playAttempt !== undefined) {
              playAttempt
                .then(() => {
                  // Un-mute after successful play start (speaker button controls muting separately)
                  setTimeout(() => {
                    if (videoEl.muted && !videoEl.dataset.manualMute) {
                      videoEl.muted = false;
                    }
                  }, 800);
                  console.log('[remoteVideo] Playing successfully');
                })
                .catch(e => {
                  if (e.name !== 'AbortError') {
                    console.warn('[remoteVideo] Play error:', e.name, e.message);
                  }
                });
            }
          };
          safePlay(mainRemote);
        }

        // 2. Update Floating Mini Widget Video
        const miniRemote = document.getElementById('miniRemoteVideo');
        if (miniRemote && remoteStream) {
          if (miniRemote.srcObject !== remoteStream) {
            miniRemote.srcObject = remoteStream;
          }
          miniRemote.muted = true;
          if (miniRemote.paused) miniRemote.play().catch(() => {});
        }

        // 3. Update Pop-out Window Remote Video & Hide Placeholder
        if (pipWindowRef && !pipWindowRef.closed) {
          try {
            const pipRemote = pipWindowRef.document.getElementById('pipRemoteVideo');
            const pipPlaceholder = pipWindowRef.document.getElementById('pipRemotePlaceholder');
            if (pipRemote && remoteStream) {
              if (pipRemote.srcObject !== remoteStream) {
                pipRemote.srcObject = remoteStream;
              }
              pipRemote.muted = true;
              if (pipRemote.paused) pipRemote.play().catch(() => {});
            }
            if (pipPlaceholder) {
              pipPlaceholder.style.display = 'none';
            }
          } catch (_e) {}
        }

        // Start call duration counter ONLY when peer stream is received and both are connected
        if (remoteStream && remoteStream.getTracks().length > 0) {
          if (window.supabaseService) window.supabaseService.stopCallRingingHeartbeat();
          const statusText = document.getElementById('callStatusText');
          if (statusText) {
            statusText.className = "text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 shrink-0";
            statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> <span>Đã kết nối</span>`;
          }
          startCallTimer();
        }
      },
      (state) => {
        console.log("[WebRTC Connection State]:", state);
        const statusText = document.getElementById('callStatusText');
        if (statusText) {
          if (state === 'connected') {
            if (window.supabaseService) window.supabaseService.stopCallRingingHeartbeat();
            statusText.className = "text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 shrink-0";
            statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> <span>Đã kết nối</span>`;
            startCallTimer();
          } else if (state === 'connecting') {
            statusText.className = "text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 shrink-0";
            statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> <span>Đang thiết lập P2P...</span>`;
          } else {
            statusText.className = "text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 shrink-0";
            statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> <span>Đang chờ đối phương...</span>`;
          }
        }
      },
      currentUserId,
      isCaller
    );


    // Subscribe Realtime Broadcast Messages in Inline Chat
    window.supabaseService.subscribeChatRoom(roomId, (msg) => {
      if (msg && msg.instance_id !== runtimeTabInstanceId) {
        addTranscriptLog(msg.sender_name || 'BẠN BÈ', msg.text, false);
      }
    });

    // Listen for direct call notifications (such as call_declined, call_accepted)
    window.supabaseService.subscribeCallNotifications(currentUserId, (notif) => {
      if (!notif) return;
      if (notif.type === 'call_accepted' || notif.type === 'call-accepted') {
        console.log('[Call Controller] Partner accepted call, stopping ringing heartbeat.');
        if (window.supabaseService) window.supabaseService.stopCallRingingHeartbeat();
        return;
      }
      if ((notif.type === 'call_declined' || notif.type === 'call-declined') && notif.roomId === roomId) {
        stopCallTimer();
        if (window.supabaseService) window.supabaseService.stopCallRingingHeartbeat();
        webRTCService.endCall();
        updateSubtitleDisplay(`⚠️ Đối phương đã từ chối cuộc gọi. Đang quay lại...`, 'Từ chối');
        const statusText = document.getElementById('callStatusText');
        if (statusText) {
          statusText.className = "text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 shrink-0";
          statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> <span>Cuộc gọi bị từ chối</span>`;
        }
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1800);
      }
    });

    // If caller, send persistent ringing heartbeat to partner & create WebRTC offer
    if (isCaller) {
      let targetPartnerId = globalTargetPartnerId;
      if (!targetPartnerId) {
        const userIds = roomId.replace('room_', '').split('_');
        if (userIds.length >= 2) {
          targetPartnerId = userIds.find(id => id && id !== currentUserId) || '';
        }
      }

      if (!targetPartnerId) {
        try {
          const allUsers = await window.supabaseService.searchGlobalUsers('', 'all');
          const partnerUser = allUsers.find(u => u.id !== currentUserId && (partnerParam ? u.display_name.trim().toLowerCase() === decodeURIComponent(partnerParam).trim().toLowerCase() : true));
          if (partnerUser) {
            targetPartnerId = partnerUser.id;
            globalTargetPartnerId = targetPartnerId;
          }
        } catch (_e) {}
      }

      if (targetPartnerId) {
        console.log("[Call Init] Starting persistent incoming_call ringing heartbeat to partner:", targetPartnerId);
        window.supabaseService.startCallRingingHeartbeat(targetPartnerId, {
          type: 'incoming_call',
          roomId: roomId,
          callerId: currentUserId,
          callerName: currentUserName,
          callerAvatar: currentUserAvatar,
          callerRole: currentUserRole
        });
      } else {
        console.warn("[Call Init] No targetPartnerId resolved for roomId:", roomId);
      }

      setTimeout(() => {
        webRTCService.createCallOffer(currentUserId);
      }, 1200);
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
        addTranscriptLog('TÔI', finalSentence, true);
        accumulatedSentenceWords = [];
      }
    }

    // Fast Response Gesture Processing (Trigger as soon as >= 4 frames confirmed)
    if (frameData.sequenceComplete && frameData.sequenceComplete.length >= 4) {
      // In-flight transit suppression: If hand is moving at high speed, wait for it to settle into shape
      if (frameData.velocity > 0.026) {
        return;
      }

      const prediction = dtwClassifier.predict(frameData.sequenceComplete);

      // Update HUD accuracy stats on every prediction attempt
      sessionAttemptCount++;
      const hudConf = document.getElementById('hudConfidence');
      const hudDtw = document.getElementById('hudDtwDist');
      const hudWords = document.getElementById('hudWordCount');
      const hudRate = document.getElementById('hudAccuracyRate');
      if (hudConf) {
        hudConf.innerText = `${prediction.confidence}%`;
        hudConf.style.color = prediction.confidence >= 80 ? '#34d399' : prediction.confidence >= 60 ? '#fbbf24' : '#f87171';
      }
      if (hudDtw) hudDtw.innerText = prediction.distance === Infinity ? '∞' : prediction.distance.toFixed(3);
      if (hudWords) hudWords.innerText = `${sessionWordCount} từ`;
      if (hudRate) {
        const rate = sessionAttemptCount > 0 ? Math.round((sessionWordCount / sessionAttemptCount) * 100) : 0;
        hudRate.innerText = `${rate}%`;
        hudRate.style.color = rate >= 70 ? '#34d399' : rate >= 40 ? '#fbbf24' : '#f87171';
      }

      if (!prediction.isRejected && prediction.word && prediction.confidence >= 80) {
        const currentTime = performance.now();
        // 1. Ignore rapid-fire duplicate triggering if user is simply holding the same hand sign in place
        if (prediction.word === lastRecognizedWord && (currentTime - lastRecognizedWordTime < WORD_RECOGNITION_COOLDOWN_MS)) {
          return;
        }

        // 2. Ultra-short 250ms transition grace period
        if (currentTime - lastRecognizedWordTime < 250 && prediction.confidence < 88) {
          return;
        }

        lastRecognizedWord = prediction.word;
        lastRecognizedWordTime = currentTime;

        sessionWordCount++;
        if (hudWords) hudWords.innerText = `${sessionWordCount} từ`;
        let resolvedWord = prediction.word;
        if (window.contextResolver) {
          const urlParams = new URLSearchParams(window.location.search);
          const currentRoomId = urlParams.get('room') || 'room_default';
          const resolvedObj = window.contextResolver.resolve(prediction.word, [], currentRoomId);
          resolvedWord = resolvedObj.primaryWord;
        }

        accumulatedSentenceWords.push(resolvedWord);
        const cumulativeText = accumulatedSentenceWords.join(' ');

        updateSubtitleDisplay(`🤟 [Bạn]: ${cumulativeText}`, `Độ khớp: ${prediction.confidence}%`);

        // Speak the recognized gesture word/token immediately on the local speaker!
        if (window.ttsService && !isTtsMuted) {
          window.ttsService.speak(resolvedWord);
        }

        // Broadcast gesture text to Partner Realtime over Supabase Realtime Signaling Channel!
        const currentUser = window.supabaseService ? window.supabaseService.cachedCurrentUser : null;
        const senderId = globalCurrentUserId || (currentUser ? currentUser.id : (sessionStorage.getItem('call_user_id') || 'usr_local'));
        const senderName = globalCurrentUserName || (currentUser ? (currentUser.user_metadata?.display_name || 'Tôi') : 'Tôi');

        window.supabaseService.sendSignalingMessage({
          type: 'multimodal-subtitle',
          kind: 'gesture',
          text: cumulativeText,
          word: resolvedWord,
          confidence: prediction.confidence,
          senderId: senderId,
          instanceId: runtimeTabInstanceId,
          senderName: senderName
        });
      }
    }
  }
}

function updateSubtitleDisplay(text, badgeInfo) {
  if (subtitleText) subtitleText.innerText = text;
  if (subtitleConfidence) subtitleConfidence.innerText = badgeInfo ? `(${badgeInfo})` : '';
  if (fixedSubtitleText) fixedSubtitleText.innerText = text;
  const miniSub = document.getElementById('miniSubtitleText');
  if (miniSub) miniSub.innerText = text;

  if (pipWindowRef && !pipWindowRef.closed) {
    try {
      const pipSub = pipWindowRef.document.getElementById('pipSubtitleText');
      if (pipSub) pipSub.innerText = text;
      const pipConf = pipWindowRef.document.getElementById('pipSubtitleConfidence');
      if (pipConf) pipConf.innerText = badgeInfo ? `(${badgeInfo})` : '';
    } catch (_e) {}
  }
}

function addTranscriptLog(sender, text, isFromMe = null) {
  if (!transcriptList || !text) return;
  const escape = window.securityGuard ? window.securityGuard.escapeHTML.bind(window.securityGuard) : (s => s);
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const currentUser = window.supabaseService ? window.supabaseService.cachedCurrentUser : null;
  const currentUserName = currentUser ? (currentUser.user_metadata?.display_name || 'Tôi') : (localStorage.getItem('user_display_name') || 'Tôi');

  const senderUpper = (sender || '').toUpperCase();
  const isSystem = senderUpper.includes('HỆ THỐNG');

  let isMe = isFromMe;
  if (isMe === null) {
    isMe = !isSystem && (
      senderUpper === 'TÔI' ||
      senderUpper.startsWith('TÔI ') ||
      senderUpper.includes('(TÔI)') ||
      senderUpper.includes('TÔI (STT)') ||
      senderUpper.startsWith(currentUserName.toUpperCase()) ||
      senderUpper === currentUserName.toUpperCase()
    );
  }

  let containerClass = 'flex flex-col gap-1 items-start mr-auto max-w-[85%]';
  let badgeClass = 'text-indigo-500 dark:text-indigo-400 font-bold';
  let bubbleClass = 'bg-white dark:bg-[#151e32] text-slate-900 dark:text-white border border-slate-200/80 dark:border-slate-700/80 rounded-2xl rounded-tl-sm shadow-sm';

  if (isSystem) {
    containerClass = 'flex flex-col gap-1 items-center mx-auto my-1 max-w-[95%]';
    badgeClass = 'text-slate-400 font-semibold';
    bubbleClass = 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-center text-[11px] py-1.5 px-3 border border-slate-200/50 dark:border-slate-700/50 rounded-xl';
  } else if (isMe) {
    containerClass = 'flex flex-col gap-1 items-end ml-auto max-w-[85%]';
    badgeClass = 'text-sky-500 font-bold';
    bubbleClass = 'bg-primary text-white shadow-md shadow-primary/25 rounded-2xl rounded-tr-sm';
  }

  const itemHtml = `
    <div class="${containerClass} transition-all">
      <div class="flex items-center gap-2 px-1">
        <span class="text-[10px] ${badgeClass} tracking-tight uppercase">${escape(sender)}</span>
        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">${timeStr}</span>
      </div>
      <div class="${bubbleClass} px-3.5 py-2">
        <p class="text-xs leading-relaxed font-medium break-words">${escape(text)}</p>
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

  // Sidebar Toggle with Smooth Animation (Desktop & Mobile)
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const mobileToggleTranscriptBtn = document.getElementById('mobileToggleTranscriptBtn');
  const videoSection = document.getElementById('videoSection');
  const transcriptSidebar = document.getElementById('transcriptSidebar');
  const toggleSidebarLabel = document.getElementById('toggleSidebarLabel');
  const closeTranscriptMobileBtn = document.getElementById('closeTranscriptMobileBtn');

  if (videoSection && transcriptSidebar) {
    const isMobileDevice = window.innerWidth < 768;
    let isCollapsed = isMobileDevice;

    const updateSidebarUI = () => {
      if (isCollapsed) {
        transcriptSidebar.classList.add('is-collapsed');
        if (isMobileDevice) {
          setTimeout(() => {
            if (isCollapsed) transcriptSidebar.style.setProperty('display', 'none', 'important');
          }, 350);
        }
        videoSection.classList.remove('md:w-[75%]');
        videoSection.classList.add('w-full');
        if (toggleSidebarLabel) toggleSidebarLabel.innerText = "Hiện Nhật Ký & Chat";
      } else {
        transcriptSidebar.style.removeProperty('display');
        transcriptSidebar.style.display = 'flex';
        // Force reflow for smooth animation
        void transcriptSidebar.offsetWidth;
        transcriptSidebar.classList.remove('is-collapsed');
        videoSection.classList.remove('w-full');
        videoSection.classList.add('md:w-[75%]');
        if (toggleSidebarLabel) toggleSidebarLabel.innerText = "Đóng Nhật Ký & Chat";
      }
    };

    // Apply initial state
    if (isMobileDevice) {
      updateSidebarUI();
    }

    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        updateSidebarUI();
      });
    }

    if (mobileToggleTranscriptBtn) {
      mobileToggleTranscriptBtn.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        updateSidebarUI();
      });
    }

    if (closeTranscriptMobileBtn) {
      closeTranscriptMobileBtn.addEventListener('click', () => {
        isCollapsed = true;
        updateSidebarUI();
      });
    }
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

      addTranscriptLog(senderName, cleanText, true);

      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get('room') || 'room_demo_vsl';

      await window.supabaseService.saveChatMessage(roomId, {
        id: 'msg_' + Date.now(),
        room_id: roomId,
        sender_id: globalCurrentUserId || (currentUser ? currentUser.id : 'user_local'),
        instance_id: runtimeTabInstanceId,
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
            placeholder.style.transform = 'scaleX(-1)';
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
        camBtn.className = 'w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer';
        if (icon) icon.innerText = 'videocam';
        camBtn.title = "Tắt Camera";
      } else {
        camBtn.className = 'w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/40 border-2 border-rose-500 flex items-center justify-center transition-all active:scale-95 cursor-pointer';
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
        micBtn.className = 'w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer';
        if (icon) icon.innerText = 'mic';
        micBtn.title = "Tắt Micro";
      } else {
        micBtn.className = 'w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/40 border-2 border-rose-500 flex items-center justify-center transition-all active:scale-95 cursor-pointer';
        if (icon) icon.innerText = 'mic_off';
        micBtn.title = "Bật Micro";
      }
    });
  }

  // Switch Camera (Front ↔ Back) — Mobile only
  let currentFacingMode = 'user'; // default: front camera (selfie)

  const switchCamBtn = document.getElementById('toggleMirrorBtn');
  if (switchCamBtn) {
    switchCamBtn.addEventListener('click', async () => {
      // Toggle facing mode
      const nextFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      try {
        // Stop current video tracks only
        if (webRTCService.localStream) {
          webRTCService.localStream.getVideoTracks().forEach(track => track.stop());
        }

        // Request new video-only stream with opposite facing mode
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: nextFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        const newVideoTrack = newStream.getVideoTracks()[0];

        // Replace track in RTCPeerConnection (live call)
        if (webRTCService.peerConnection) {
          const senders = webRTCService.peerConnection.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) await videoSender.replaceTrack(newVideoTrack);
        }

        // Swap video track in localStream
        if (webRTCService.localStream) {
          webRTCService.localStream.getVideoTracks().forEach(t => webRTCService.localStream.removeTrack(t));
          webRTCService.localStream.addTrack(newVideoTrack);
        }

        // Update video preview
        if (webcamVideo) webcamVideo.srcObject = webRTCService.localStream;

        // Mirror only front camera (selfie); back camera shows real-world — no mirror
        const wrapper = document.getElementById('localCanvasWrapper');
        if (wrapper) {
          if (nextFacingMode === 'user') {
            wrapper.classList.add('mirror-mode');
          } else {
            wrapper.classList.remove('mirror-mode');
          }
        }

        // Sync camOffPlaceholder counter-flip with facing mode
        const camPlaceholder = document.getElementById('camOffPlaceholder');
        if (camPlaceholder) {
          camPlaceholder.style.transform = nextFacingMode === 'user' ? 'scaleX(-1)' : '';
        }

        currentFacingMode = nextFacingMode;

      } catch (err) {
        // facingMode 'exact' fails on devices with 1 camera → fall back silently
        console.warn('[Camera Switch] Không thể chuyển camera:', err.name, err.message);
      }

      // Close the more options modal after switching
      const moreModal = document.getElementById('moreCallOptionsModal');
      if (moreModal) moreModal.classList.add('hidden');
    });
  }

  // Toggle AI Skeleton Vector Overlay visibility
  let isSkeletonVisible = true;
  const skeletonBtn = document.getElementById('toggleSkeletonBtn');
  if (skeletonBtn) {
    skeletonBtn.addEventListener('click', () => {
      isSkeletonVisible = !isSkeletonVisible;

      const canvas = document.getElementById('localCanvas');
      if (canvas) canvas.style.opacity = isSkeletonVisible ? '1' : '0';

      const iconWrapper = document.getElementById('skeletonBtnIcon');
      const label = document.getElementById('skeletonBtnLabel');
      const icon = skeletonBtn.querySelector('.material-symbols-outlined');

      if (isSkeletonVisible) {
        if (icon) icon.innerText = 'polyline';
        if (label) label.innerText = 'Ẩn Vector AI';
        if (iconWrapper) {
          iconWrapper.className = 'w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0';
        }
      } else {
        if (icon) icon.innerText = 'polyline';
        if (label) label.innerText = 'Hiện Vector AI';
        if (iconWrapper) {
          iconWrapper.className = 'w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-400 flex items-center justify-center shrink-0';
        }
      }
    });
  }

  const sttBtn = document.getElementById('toggleSTTBtn');
  if (sttBtn) {
    const activateSttUI = () => {
      sttBtn.className = 'w-12 h-12 rounded-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/40 ring-4 ring-primary/30 animate-pulse border-2 border-primary flex items-center justify-center transition-all active:scale-95 cursor-pointer';
      sttBtn.title = "Đang lắng nghe giọng nói ➔ Chuyển thành Phụ đề (Click để tắt)";
    };

    const deactivateSttUI = () => {
      isSttOn = false;
      sttBtn.className = 'w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer';
      sttBtn.title = "Chuyển giọng nói thành văn bản (Speech-to-Text)";
    };

    sttBtn.addEventListener('click', () => {
      isSttOn = !isSttOn;
      if (isSttOn) {
        const existingStream = window.webRTCService ? window.webRTCService.localStream : null;

        window.sttService.startListening(
          (transcriptData) => {
            if (transcriptData.interim) {
              updateSubtitleDisplay(`🎙️ ${transcriptData.interim}...`, 'STT Đang nói');
            }
            if (transcriptData.final) {
              updateSubtitleDisplay(`🎙️ ${transcriptData.final}`, 'Giọng nói STT');
              addTranscriptLog('TÔI (STT)', transcriptData.final, true);

              // Broadcast STT result to partner via signaling
              if (globalCurrentUserId) {
                window.supabaseService.sendSignalingMessage({
                  type: 'multimodal-subtitle',
                  kind: 'stt',
                  text: transcriptData.final,
                  isFinal: true,
                  senderId: globalCurrentUserId,
                  instanceId: runtimeTabInstanceId,
                  senderName: globalCurrentUserName
                }).catch(() => {});
              }
            }
          },
          (err) => {
            if (err === 'unsupported_browser') {
              deactivateSttUI();
              window.sttService.stopListening();
              updateSubtitleDisplay('Đang lắng nghe cử chỉ và giọng nói...', 'Hệ thống');
              alert("Trình duyệt không hỗ trợ Web Speech API. Vui lòng dùng Google Chrome hoặc Microsoft Edge.");
              return;
            }
            if (err === 'network_persistent') {
              deactivateSttUI();
              window.sttService.stopListening();
              updateSubtitleDisplay('STT lỗi mạng liên tục - đã tắt. Hãy dùng Chrome hoặc Edge.', 'Lỗi STT');
              return;
            }
            if (err === 'not-allowed') {
              deactivateSttUI();
              window.sttService.stopListening();
              updateSubtitleDisplay('Cần cấp quyền Microphone để dùng STT.', 'STT Bị từ chối');
            }
          },
          existingStream
        );
        activateSttUI();
      } else {
        window.sttService.stopListening();
        updateSubtitleDisplay('Đang lắng nghe cử chỉ và giọng nói...', 'Hệ thống');
        deactivateSttUI();
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
        ttsBtn.title = "Đã tắt tiếng AI đọc dịch (Click để Bật lại)";
      } else {
        ttsBtn.classList.remove('bg-rose-600', 'text-white');
        ttsBtn.classList.add('bg-surface', 'text-primary');
        if (icon) icon.innerText = 'volume_up';
        ttsBtn.title = "Đang bật tiếng AI đọc dịch (Click để Tắt)";
      }
    });
  }

  // Speaker (Remote Audio) Mute / Unmute
  let isSpeakerMuted = false;
  const speakerBtn = document.getElementById('toggleSpeakerBtn');
  if (speakerBtn) {
    speakerBtn.addEventListener('click', () => {
      isSpeakerMuted = !isSpeakerMuted;
      const icon = speakerBtn.querySelector('.material-symbols-outlined');

      if (remoteVideo) {
        remoteVideo.muted = isSpeakerMuted;
        remoteVideo.dataset.manualMute = isSpeakerMuted ? 'true' : '';
      }

      if (isSpeakerMuted) {
        speakerBtn.classList.add('bg-rose-600', 'text-white');
        speakerBtn.classList.remove('bg-surface', 'text-on-surface-variant');
        if (icon) icon.innerText = 'volume_off';
        speakerBtn.title = "Loa đang TẮT - không nghe giọng đầu dây bên kia (Click để Bật lại)";
      } else {
        speakerBtn.classList.remove('bg-rose-600', 'text-white');
        speakerBtn.classList.add('bg-surface', 'text-on-surface-variant');
        if (icon) icon.innerText = 'volume_up';
        speakerBtn.title = "Loa đang BẬT - đang nghe giọng đầu dây bên kia (Click để Tắt)";
      }
    });
  }


  if (endCallBtn) {
    endCallBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      stopCallTimer();
      const finalDuration = formatCallDuration(callSecondsElapsed);

      if (window.supabaseService) {
        window.supabaseService.stopCallRingingHeartbeat();
        if (globalIsCaller && callSecondsElapsed === 0 && globalTargetPartnerId) {
          window.supabaseService.sendCallCancelled(globalTargetPartnerId, {
            roomId: globalRoomId,
            callerId: globalCurrentUserId
          });
        }
      }

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      const targetRoomId = globalRoomId || 'room_default';

      const callLogObj = {
        id: window.supabaseService.generateUUID(),
        room_id: targetRoomId,
        sender_id: globalCurrentUserId,
        recipient_id: globalPartnerParam || '',
        sender_name: globalCurrentUserName,
        msg_type: 'call_log',
        call_status: 'completed',
        duration: finalDuration,
        seconds: callSecondsElapsed,
        text: `📞 Cuộc gọi video ${callSecondsElapsed > 0 ? '• ' + finalDuration : ''}`,
        timestamp: timeStr,
        read: false
      };

      try {
        await window.supabaseService.saveChatMessage(targetRoomId, callLogObj);
      } catch (err) {}

      window.supabaseService.sendSignalingMessage({
        type: 'call-ended',
        senderId: globalCurrentUserId,
        senderName: globalCurrentUserName,
        duration: finalDuration,
        seconds: callSecondsElapsed
      });

      webRTCService.endCall();
      window.location.href = 'index.html';
    });
  }

  window.addEventListener('beforeunload', () => {
    stopCallTimer();
    if (window.supabaseService) {
      window.supabaseService.stopCallRingingHeartbeat();
      if (globalIsCaller && callSecondsElapsed === 0 && globalTargetPartnerId) {
        window.supabaseService.sendCallCancelled(globalTargetPartnerId, {
          roomId: globalRoomId,
          callerId: globalCurrentUserId
        });
      }
      if (callSecondsElapsed > 0) {
        window.supabaseService.sendSignalingMessage({
          type: 'call-ended',
          senderId: globalCurrentUserId,
          senderName: globalCurrentUserName
        });
      }
    }
    webRTCService.endCall();
  });

  // More Options Action Sheet Modal Toggle
  const openMoreBtn = document.getElementById('openMoreCallOptionsBtn');
  const toggleMoreSheetBtn = document.getElementById('toggleMoreSheetBtn');
  const closeMoreBtn = document.getElementById('closeMoreOptionsBtn');
  const moreModal = document.getElementById('moreCallOptionsModal');

  const toggleMoreModal = (show) => {
    if (!moreModal) return;
    const isCurrentlyHidden = moreModal.classList.contains('hidden');
    const willShow = show !== undefined ? show : isCurrentlyHidden;

    if (willShow) {
      moreModal.classList.remove('hidden');
      if (toggleMoreSheetBtn) {
        toggleMoreSheetBtn.className = 'w-12 h-12 rounded-full bg-primary text-white shadow-lg shadow-primary/30 border-2 border-primary flex items-center justify-center transition-all active:scale-95 cursor-pointer';
      }
    } else {
      moreModal.classList.add('hidden');
      if (toggleMoreSheetBtn) {
        toggleMoreSheetBtn.className = 'w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer';
      }
    }
  };

  if (openMoreBtn) openMoreBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMoreModal(true); });
  if (toggleMoreSheetBtn) toggleMoreSheetBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMoreModal(); });
  if (closeMoreBtn) closeMoreBtn.addEventListener('click', () => toggleMoreModal(false));

  if (moreModal) {
    moreModal.addEventListener('click', (e) => {
      if (e.target === moreModal) toggleMoreModal(false);
    });
  }



  const modeBtn = document.getElementById('switchSubtitleModeBtn');
  
  const applySubtitleMode = (mode) => {
    currentSubtitleMode = mode;
    const floatingOverlay = document.getElementById('floatingSubtitleOverlay') || subtitleOverlay;
    const fixedBar = document.getElementById('fixedSubtitleBar') || fixedSubtitleBar;

    if (currentSubtitleMode === 'fixed') {
      if (floatingOverlay) floatingOverlay.classList.add('hidden');
      if (fixedBar) fixedBar.classList.remove('hidden');
    } else {
      if (floatingOverlay) floatingOverlay.classList.remove('hidden');
      if (fixedBar) fixedBar.classList.add('hidden');
    }

    const modeTitle = document.getElementById('subtitleModeTitle');
    const modeDesc = document.getElementById('subtitleModeDesc');
    const modeIcon = document.getElementById('subtitleModeIcon');
    const modeIconWrapper = document.getElementById('subtitleModeIconWrapper');

    if (modeIcon) modeIcon.innerText = 'subtitles';
    if (modeTitle) {
      modeTitle.innerText = currentSubtitleMode === 'fixed' ? 'Chế độ: Băng chuyền (Cố định)' : 'Chế độ: Kính mờ (Nổi)';
    }
    if (modeDesc) {
      modeDesc.innerText = currentSubtitleMode === 'fixed' ? 'Đang cố định ở đáy màn hình (Click để đổi sang Kính mờ)' : 'Đang nổi trên màn hình video (Click để đổi sang Cố định)';
    }
    if (modeIconWrapper) {
      modeIconWrapper.className = currentSubtitleMode === 'fixed' 
        ? 'w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0'
        : 'w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0';
    }
  };

  // Initial subtitle mode check
  const savedMode = localStorage.getItem('subtitle_mode') || 'overlay';
  applySubtitleMode(savedMode);

  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      const nextMode = currentSubtitleMode === 'overlay' ? 'fixed' : 'overlay';
      applySubtitleMode(nextMode);
      localStorage.setItem('subtitle_mode', nextMode);
      toggleMoreModal(false);
    });
  }

  // Initialize Call Minimize & PiP Manager
  initCallMinimizeManager();
});

// ============================================================================
// CALL MINIMIZE & PIP MANAGER (MODE 1: POP-OUT WINDOW & MODE 2: FLOATING WIDGET)
// ============================================================================

let isCallMinimized = false;
let currentCallMode = 'fullscreen'; // 'fullscreen' | 'floating' | 'popout'
let pipWindowRef = null;

function initCallMinimizeManager() {
  const minimizeBtn = document.getElementById('minimizeCallBtn');
  const floatingWidget = document.getElementById('floatingMiniCallWidget');
  const embeddedAppContainer = document.getElementById('embeddedAppFrameContainer');
  const embeddedAppFrame = document.getElementById('embeddedAppFrame');
  const fullScreenCallWrapper = document.getElementById('fullScreenCallWrapper');

  const mainRemoteVideo = document.getElementById('remoteVideo');
  const mainWebcamVideo = document.getElementById('webcamVideo');

  const miniRemoteVideo = document.getElementById('miniRemoteVideo');
  const miniLocalVideo = document.getElementById('miniLocalVideo');
  const miniPartnerName = document.getElementById('miniPartnerName');
  const miniMaximizeHeaderBtn = document.getElementById('miniMaximizeHeaderBtn');
  const miniMaximizeBtn = document.getElementById('miniMaximizeBtn');
  const miniMoreBtn = document.getElementById('miniMoreBtn');
  const miniOptionsMenu = document.getElementById('miniOptionsMenu');

  const miniToggleMicBtn = document.getElementById('miniToggleMicBtn');
  const miniToggleCamBtn = document.getElementById('miniToggleCamBtn');
  const miniEndCallBtn = document.getElementById('miniEndCallBtn');

  const miniModePopoutBtn = document.getElementById('miniModePopoutBtn');
  const miniModeFloatingBtn = document.getElementById('miniModeFloatingBtn');
  const miniModeFullscreenBtn = document.getElementById('miniModeFullscreenBtn');

  const urlParams = new URLSearchParams(window.location.search);
  const partnerName = urlParams.get('partner') || 'Người Đối Diện';
  const roomName = urlParams.get('room') || 'Phòng Gọi';

  const closeMoreModalSafe = () => {
    const moreModal = document.getElementById('moreCallOptionsModal');
    if (moreModal) moreModal.classList.add('hidden');
  };

  // 1. Minimize to Floating Widget (Mode 2 - Default)
  function minimizeToFloatingWidget() {
    try {
      isCallMinimized = true;
      currentCallMode = 'floating';

      if (fullScreenCallWrapper) {
        fullScreenCallWrapper.style.display = 'none';
      }
      closeMoreModalSafe();

      // Show Embedded App Frame loading messages screen
      if (embeddedAppContainer && embeddedAppFrame) {
        embeddedAppContainer.classList.remove('hidden');
        embeddedAppContainer.style.display = 'block';
        if (embeddedAppFrame.src === 'about:blank' || !embeddedAppFrame.src || embeddedAppFrame.src.endsWith('call.html')) {
          embeddedAppFrame.src = 'index.html';
        }
      }

      // Show Floating Mini Widget
      if (floatingWidget) {
        floatingWidget.classList.remove('hidden');
        floatingWidget.classList.add('is-visible');
        floatingWidget.style.display = 'flex';
        if (miniPartnerName) miniPartnerName.innerText = partnerName;

        // Bind Video Streams
        if (miniRemoteVideo && mainRemoteVideo && mainRemoteVideo.srcObject) {
          miniRemoteVideo.srcObject = mainRemoteVideo.srcObject;
          miniRemoteVideo.play().catch(() => {});
        }
        if (miniLocalVideo && mainWebcamVideo && mainWebcamVideo.srcObject) {
          miniLocalVideo.srcObject = mainWebcamVideo.srcObject;
          miniLocalVideo.play().catch(() => {});
        }

        syncMiniButtonStates();
        showMiniControls();
      }
    } catch (err) {
      console.error('[Call Minimize] Error minimizing call:', err);
    }
  }

  // 2. Restore to Full Screen
  function restoreToFullScreen() {
    try {
      isCallMinimized = false;
      currentCallMode = 'fullscreen';

      if (pipWindowRef && !pipWindowRef.closed) {
        try { pipWindowRef.close(); } catch (_e) {}
        pipWindowRef = null;
      }

      if (embeddedAppContainer) {
        embeddedAppContainer.classList.add('hidden');
        embeddedAppContainer.style.display = 'none';
      }
      if (floatingWidget) {
        floatingWidget.classList.add('hidden');
        floatingWidget.classList.remove('is-visible');
        floatingWidget.style.display = 'none';
        if (miniOptionsMenu) miniOptionsMenu.classList.add('hidden');
      }

      if (fullScreenCallWrapper) {
        fullScreenCallWrapper.style.display = 'flex';
        fullScreenCallWrapper.classList.remove('hidden');
      }

      // Ensure main videos continue playing
      if (mainRemoteVideo && mainRemoteVideo.srcObject) mainRemoteVideo.play().catch(() => {});
      if (mainWebcamVideo && mainWebcamVideo.srcObject) mainWebcamVideo.play().catch(() => {});
    } catch (err) {
      console.error('[Call Minimize] Error restoring full screen:', err);
    }
  }

  // 3. Switch to Pop-out Window (Mode 1 - Rectangular Pop-out Window with Cloned Streams & Muted Autoplay)
  async function openPopoutWindow() {
    try {
      if (miniOptionsMenu) miniOptionsMenu.classList.add('hidden');

      // Try modern Document Picture-in-Picture API first (Desktop Chrome/Edge/Brave 116+)
      if ('documentPictureInPicture' in window) {
        try {
          // Open Rectangular Landscape 16:10 / 16:9 window (640x420)
          const pipWin = await window.documentPictureInPicture.requestWindow({
            width: 640,
            height: 420,
          });
          pipWindowRef = pipWin;

          // Hide in-app floating widget while pop-out window is active
          if (floatingWidget) {
            floatingWidget.classList.add('hidden');
            floatingWidget.classList.remove('is-visible');
            floatingWidget.style.display = 'none';
          }

          // Inject Google Fonts and Material Symbols
          const fontOutfit = pipWin.document.createElement('link');
          fontOutfit.rel = 'stylesheet';
          fontOutfit.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap';
          pipWin.document.head.appendChild(fontOutfit);

          const fontIcons = pipWin.document.createElement('link');
          fontIcons.rel = 'stylesheet';
          fontIcons.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block';
          pipWin.document.head.appendChild(fontIcons);

          // Inject Standalone Custom CSS for guaranteed rendering without external dependencies
          const customStyle = pipWin.document.createElement('style');
          customStyle.textContent = `
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
            body { background-color: #020617; color: white; height: 100vh; overflow: hidden; display: flex; flex-direction: column; user-select: none; }
            
            /* Header */
            .pip-header { height: 36px; padding: 0 12px; background: #0f172a; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
            .pip-title-group { display: flex; align-items: center; gap: 8px; min-width: 0; }
            .pip-live-dot { width: 8px; height: 8px; border-radius: 9999px; background: #34d399; flex-shrink: 0; box-shadow: 0 0 8px #34d399; }
            .pip-partner-name { font-size: 12px; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .pip-room-name { font-size: 10px; font-family: monospace; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .pip-window-controls { display: flex; align-items: center; gap: 4px; }
            .pip-ctrl-btn { width: 28px; height: 26px; border-radius: 4px; background: transparent; border: none; color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s, color 0.2s; }
            .pip-ctrl-btn:hover { background: #1e293b; color: white; }
            .pip-ctrl-btn.btn-close:hover { background: #e11d48; color: white; }

            /* Video Area */
            .pip-main-view { position: relative; flex: 1; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            .pip-remote-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; z-index: 10; }
            .pip-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f172a; color: white; text-align: center; z-index: 5; }
            .pip-avatar-circle { width: 56px; height: 56px; border-radius: 9999px; background: rgba(2, 132, 199, 0.2); color: #38bdf8; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }

            /* Self Video PiP */
            .pip-self-box { position: absolute; top: 10px; right: 10px; width: 110px; height: 140px; border-radius: 12px; overflow: hidden; border: 2px solid rgba(255, 255, 255, 0.7); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7); z-index: 25; background: #000; }
            .pip-self-video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); display: block; }
            .pip-self-badge { position: absolute; top: 4px; left: 4px; background: rgba(0, 0, 0, 0.65); padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; color: white; z-index: 2; }

            /* Subtitle Overlay (Right above toolbar) */
            .pip-sub-box { position: absolute; bottom: 8px; left: 12px; right: 12px; z-index: 20; pointer-events: none; }
            .pip-sub-content { background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(4px); padding: 6px 12px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.15); text-align: center; font-size: 12px; font-weight: 700; color: white; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }

            /* Bottom Toolbar */
            .pip-bottom-bar { height: 56px; padding: 0 16px; background: #0f172a; border-top: 1px solid #1e293b; display: flex; align-items: center; justify-content: center; gap: 12px; flex-shrink: 0; position: relative; z-index: 30; }
            .pip-btn { width: 38px; height: 38px; border-radius: 9999px; background: #1e293b; color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
            .pip-btn:hover { opacity: 0.9; transform: scale(1.05); }
            .pip-btn:active { transform: scale(0.95); }
            .pip-btn.btn-muted { background: #e11d48; }
            .pip-btn.btn-active { background: #0284c7; box-shadow: 0 0 12px rgba(2, 132, 199, 0.6); }
            .pip-btn.btn-end { background: #e11d48; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4); }

            /* More Modal */
            .pip-more-menu { position: absolute; bottom: 8px; left: 12px; right: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 16px; padding: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.9); z-index: 40; display: flex; flex-direction: column; gap: 6px; }
            .pip-more-menu.hidden { display: none; }
            .pip-menu-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 1px solid #1e293b; }
            .pip-menu-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            .pip-menu-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: #1e293b; color: white; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; text-align: left; }
            .pip-menu-item:hover { background: #334155; }
            .pip-menu-item span.icon { color: #38bdf8; font-size: 18px; }
          `;
          pipWin.document.head.appendChild(customStyle);

          // Build Rectangular Landscape Call UI inside PiP window (With muted attribute for guaranteed autoplay)
          pipWin.document.body.innerHTML = `
            <!-- PiP Header (Browser / OS Style Title Bar with Minimize, Maximize, Close) -->
            <div class="pip-header">
              <div class="pip-title-group">
                <span class="pip-live-dot"></span>
                <span class="pip-partner-name">${partnerName}</span>
                <span class="pip-room-name">(${roomName})</span>
              </div>

              <!-- Window Controls: Minimize (-) | Maximize (❐) | Close (✕) -->
              <div class="pip-window-controls">
                <button id="pipWindowMinimizeBtn" class="pip-ctrl-btn" title="Thu nhỏ về website (—)">
                  <span class="material-symbols-outlined" style="font-size: 16px;">remove</span>
                </button>
                <button id="pipWindowMaximizeBtn" class="pip-ctrl-btn" title="Phóng to toàn màn hình">
                  <span class="material-symbols-outlined" style="font-size: 15px;">crop_square</span>
                </button>
                <button id="pipWindowCloseBtn" class="pip-ctrl-btn btn-close" title="Đóng cửa sổ (✕)">
                  <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                </button>
              </div>
            </div>

            <!-- PiP Main Video Area (Rectangular Viewport) -->
            <div class="pip-main-view">
              <!-- 1. Remote Video (Full-screen background of Pop-out - muted for instant autoplay) -->
              <video id="pipRemoteVideo" autoplay playsinline muted class="pip-remote-video"></video>

              <!-- Waiting Placeholder if no remote stream yet -->
              <div id="pipRemotePlaceholder" class="pip-placeholder">
                <div class="pip-avatar-circle">
                  <span class="material-symbols-outlined" style="font-size: 32px;">account_circle</span>
                </div>
                <p style="font-size: 13px; font-weight: bold; color: white;">${partnerName}</p>
                <p style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Đang chờ đối phương kết nối video...</p>
              </div>

              <!-- 2. Self Video PiP Top-Right (Khung camera của Bạn) -->
              <div class="pip-self-box">
                <span class="pip-self-badge">Bạn</span>
                <video id="pipLocalVideo" autoplay playsinline muted class="pip-self-video"></video>
              </div>

              <!-- 3. Live Subtitle Overlay inside PiP (NẰM SÁT NGAY TRÊN THANH CÔNG CỤ) -->
              <div class="pip-sub-box">
                <div class="pip-sub-content">
                  <span id="pipSubtitleText">Đang lắng nghe cử chỉ...</span>
                  <span id="pipSubtitleConfidence" style="font-size: 10px; color: #7dd3fc; margin-left: 4px; font-family: monospace;"></span>
                </div>
              </div>

              <!-- 4. More Options Dropup inside PiP Window (NỀN TỐI ĐẶC & SÁT THANH CÔNG CỤ) -->
              <div id="pipMoreModal" class="pip-more-menu hidden">
                <div class="pip-menu-header">
                  <span class="pip-menu-title">Tùy chọn mở rộng</span>
                  <button id="pipCloseMoreModalBtn" class="pip-ctrl-btn" style="width: 22px; height: 22px;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                  </button>
                </div>
                <button id="pipModalSpeakerBtn" class="pip-menu-item">
                  <span class="material-symbols-outlined icon">volume_up</span>
                  <span>Loa cuộc gọi (Tắt/Bật tiếng)</span>
                </button>
                <button id="pipModalTTSBtn" class="pip-menu-item">
                  <span class="material-symbols-outlined icon">record_voice_over</span>
                  <span>Giọng đọc AI (TTS)</span>
                </button>
                <button id="pipModalSubtitleModeBtn" class="pip-menu-item">
                  <span class="material-symbols-outlined icon">subtitles</span>
                  <span>Chế độ hiển thị phụ đề</span>
                </button>
                <button id="pipModalSkeletonBtn" class="pip-menu-item">
                  <span class="material-symbols-outlined icon" style="color: #818cf8;">polyline</span>
                  <span>Ẩn / Hiện Vector AI</span>
                </button>
              </div>
            </div>

            <!-- PiP Bottom Full Controls Bar -->
            <div class="pip-bottom-bar">
              <!-- 1. Mic -->
              <button id="pipToggleMicBtn" class="pip-btn ${isMicOn ? '' : 'btn-muted'}" title="Micro">
                <span class="material-symbols-outlined" style="font-size: 19px;">${isMicOn ? 'mic' : 'mic_off'}</span>
              </button>
              <!-- 2. Cam -->
              <button id="pipToggleCamBtn" class="pip-btn ${isCamOn ? '' : 'btn-muted'}" title="Camera">
                <span class="material-symbols-outlined" style="font-size: 19px;">${isCamOn ? 'videocam' : 'videocam_off'}</span>
              </button>
              <!-- 3. STT Speech to Text (Đổi màu khi bật) -->
              <button id="pipToggleSTTBtn" class="pip-btn ${isSttOn ? 'btn-active' : ''}" title="Dịch cử chỉ & Giọng nói (STT)">
                <span class="material-symbols-outlined" style="font-size: 19px;">speech_to_text</span>
              </button>
              <!-- 4. More Options (•••) -->
              <button id="pipMoreOptionsBtn" class="pip-btn" title="Tùy chọn mở rộng (•••)">
                <span class="material-symbols-outlined" style="font-size: 19px;">more_horiz</span>
              </button>
              <!-- 5. End Call -->
              <button id="pipEndCallBtn" class="pip-btn btn-end" title="Kết thúc cuộc gọi">
                <span class="material-symbols-outlined" style="font-size: 19px;">call_end</span>
              </button>
            </div>
          `;

          // Connect and start video playback with fallback stream checking
          const pipRemote = pipWin.document.getElementById('pipRemoteVideo');
          const pipLocal = pipWin.document.getElementById('pipLocalVideo');
          const pipRemotePlaceholder = pipWin.document.getElementById('pipRemotePlaceholder');

          const mainRemote = document.getElementById('remoteVideo') || remoteVideo;
          const mainWebcam = document.getElementById('webcamVideo') || webcamVideo;

          const activeRemoteStream = (mainRemote && mainRemote.srcObject) || (window.webRTCService && window.webRTCService.remoteStream);
          const activeLocalStream = (mainWebcam && mainWebcam.srcObject) || (window.webRTCService && window.webRTCService.localStream);

          if (pipRemote && activeRemoteStream && activeRemoteStream.getTracks().length > 0) {
            try {
              pipRemote.srcObject = new MediaStream(activeRemoteStream.getTracks());
            } catch (_e) {
              pipRemote.srcObject = activeRemoteStream;
            }
            pipRemote.muted = true;
            pipRemote.play().catch(e => console.warn("[PiP Remote Play Error]:", e));
            if (pipRemotePlaceholder) pipRemotePlaceholder.style.display = 'none';
          }
          if (pipLocal && activeLocalStream && activeLocalStream.getTracks().length > 0) {
            try {
              pipLocal.srcObject = new MediaStream(activeLocalStream.getTracks());
            } catch (_e) {
              pipLocal.srcObject = activeLocalStream;
            }
            pipLocal.muted = true;
            pipLocal.play().catch(e => console.warn("[PiP Local Play Error]:", e));
          }

          // Browser Window Controls (—, ❐, ✕)
          pipWin.document.getElementById('pipWindowMinimizeBtn').addEventListener('click', () => {
            pipWin.close();
            minimizeToFloatingWidget();
          });

          pipWin.document.getElementById('pipWindowMaximizeBtn').addEventListener('click', () => {
            pipWin.close();
            restoreToFullScreen();
          });

          pipWin.document.getElementById('pipWindowCloseBtn').addEventListener('click', () => {
            pipWin.close();
            minimizeToFloatingWidget();
          });

          // Mic Toggle
          pipWin.document.getElementById('pipToggleMicBtn').addEventListener('click', () => {
            const micBtn = document.getElementById('toggleMicBtn');
            if (micBtn) micBtn.click();
            syncMiniButtonStates();
            const btn = pipWin.document.getElementById('pipToggleMicBtn');
            const icon = btn ? btn.querySelector('.material-symbols-outlined') : null;
            if (btn && icon) {
              if (isMicOn) {
                btn.className = 'pip-btn';
                icon.innerText = 'mic';
              } else {
                btn.className = 'pip-btn btn-muted';
                icon.innerText = 'mic_off';
              }
            }
          });

          // Cam Toggle
          pipWin.document.getElementById('pipToggleCamBtn').addEventListener('click', () => {
            const camBtn = document.getElementById('toggleCamBtn');
            if (camBtn) camBtn.click();
            syncMiniButtonStates();
            const btn = pipWin.document.getElementById('pipToggleCamBtn');
            const icon = btn ? btn.querySelector('.material-symbols-outlined') : null;
            if (btn && icon) {
              if (isCamOn) {
                btn.className = 'pip-btn';
                icon.innerText = 'videocam';
              } else {
                btn.className = 'pip-btn btn-muted';
                icon.innerText = 'videocam_off';
              }
            }
          });

          // STT Toggle (Speech-to-Text with active colored feedback)
          pipWin.document.getElementById('pipToggleSTTBtn').addEventListener('click', () => {
            const sttBtn = document.getElementById('toggleSTTBtn');
            if (sttBtn) sttBtn.click();
            const btn = pipWin.document.getElementById('pipToggleSTTBtn');
            if (btn) {
              if (isSttOn) {
                btn.className = 'pip-btn btn-active';
              } else {
                btn.className = 'pip-btn';
              }
            }
          });

          // More Options Modal Toggle
          const pipMoreModal = pipWin.document.getElementById('pipMoreModal');
          pipWin.document.getElementById('pipMoreOptionsBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (pipMoreModal) pipMoreModal.classList.toggle('hidden');
          });

          pipWin.document.getElementById('pipCloseMoreModalBtn').addEventListener('click', () => {
            if (pipMoreModal) pipMoreModal.classList.add('hidden');
          });

          // Modal actions inside PiP
          pipWin.document.getElementById('pipModalSpeakerBtn').addEventListener('click', () => {
            const speakerBtn = document.getElementById('toggleSpeakerBtn');
            if (speakerBtn) speakerBtn.click();
            if (pipMoreModal) pipMoreModal.classList.add('hidden');
          });

          pipWin.document.getElementById('pipModalTTSBtn').addEventListener('click', () => {
            const ttsBtn = document.getElementById('toggleTTSBtn');
            if (ttsBtn) ttsBtn.click();
            if (pipMoreModal) pipMoreModal.classList.add('hidden');
          });

          pipWin.document.getElementById('pipModalSubtitleModeBtn').addEventListener('click', () => {
            const modeBtn = document.getElementById('switchSubtitleModeBtn');
            if (modeBtn) modeBtn.click();
            if (pipMoreModal) pipMoreModal.classList.add('hidden');
          });

          pipWin.document.getElementById('pipModalSkeletonBtn').addEventListener('click', () => {
            const skeletonBtn = document.getElementById('toggleSkeletonBtn');
            if (skeletonBtn) skeletonBtn.click();
            if (pipMoreModal) pipMoreModal.classList.add('hidden');
          });

          // End Call
          pipWin.document.getElementById('pipEndCallBtn').addEventListener('click', () => {
            pipWin.close();
            const endBtn = document.getElementById('endCallBtn');
            if (endBtn) endBtn.click();
          });

          pipWin.addEventListener('pagehide', () => {
            pipWindowRef = null;
            if (isCallMinimized) {
              minimizeToFloatingWidget();
            } else {
              restoreToFullScreen();
            }
          });

          if (fullScreenCallWrapper) fullScreenCallWrapper.style.display = 'none';
          if (embeddedAppContainer && embeddedAppFrame) {
            embeddedAppContainer.classList.remove('hidden');
            embeddedAppContainer.style.display = 'block';
            if (embeddedAppFrame.src === 'about:blank' || !embeddedAppFrame.src) {
              embeddedAppFrame.src = 'index.html';
            }
          }
          return;
        } catch (err) {
          console.warn('[PiP] Document PiP API error, falling back to in-app floating widget:', err);
        }
      }

      // On Mobile / Unsupported browsers: Use standard HTML5 Video PiP or keep in-app floating widget
      if (mainRemoteVideo && document.pictureInPictureEnabled && mainRemoteVideo.requestPictureInPicture) {
        try {
          await mainRemoteVideo.requestPictureInPicture();
          return;
        } catch (pipErr) {
          console.warn('[PiP] Standard video PiP failed:', pipErr);
        }
      }

      // Keep in-app floating widget active safely without disconnecting WebRTC!
      minimizeToFloatingWidget();
    } catch (err) {
      console.error('[Call Minimize] Error opening popout mode:', err);
    }
  }
  function syncMiniButtonStates() {
    try {
      if (miniToggleMicBtn) {
        const icon = miniToggleMicBtn.querySelector('.material-symbols-outlined');
        if (isMicOn) {
          miniToggleMicBtn.classList.remove('bg-rose-600');
          miniToggleMicBtn.classList.add('bg-slate-800/90');
          if (icon) icon.innerText = 'mic';
        } else {
          miniToggleMicBtn.classList.add('bg-rose-600');
          miniToggleMicBtn.classList.remove('bg-slate-800/90');
          if (icon) icon.innerText = 'mic_off';
        }
      }
      if (miniToggleCamBtn) {
        const icon = miniToggleCamBtn.querySelector('.material-symbols-outlined');
        if (isCamOn) {
          miniToggleCamBtn.classList.remove('bg-rose-600');
          miniToggleCamBtn.classList.add('bg-slate-800/90');
          if (icon) icon.innerText = 'videocam';
        } else {
          miniToggleCamBtn.classList.add('bg-rose-600');
          miniToggleCamBtn.classList.remove('bg-slate-800/90');
          if (icon) icon.innerText = 'videocam_off';
        }
      }
    } catch (err) {
      console.error('[Call Minimize] Error syncing button states:', err);
    }
  }

  // 4. Auto-Hide Controls & Interaction Logic
  let controlsHideTimeout = null;

  const showMiniControls = () => {
    if (!floatingWidget) return;
    floatingWidget.classList.add('show-controls');
    if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
    controlsHideTimeout = setTimeout(() => {
      if (miniOptionsMenu && !miniOptionsMenu.classList.contains('hidden')) return;
      floatingWidget.classList.remove('show-controls');
    }, 2500);
  };

  const hideMiniControlsImmediately = () => {
    if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
    if (miniOptionsMenu && !miniOptionsMenu.classList.contains('hidden')) return;
    if (floatingWidget) floatingWidget.classList.remove('show-controls');
  };

  // 5. Draggable Physics for #floatingMiniCallWidget
  if (floatingWidget) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const onDragStart = (e) => {
      showMiniControls();
      if (e.target.closest('button') || e.target.closest('#miniOptionsMenu')) return;
      isDragging = true;
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      startX = clientX;
      startY = clientY;
      const rect = floatingWidget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      floatingWidget.classList.add('is-dragging');
      floatingWidget.style.bottom = 'auto';
      floatingWidget.style.right = 'auto';
      floatingWidget.style.left = `${initialLeft}px`;
      floatingWidget.style.top = `${initialTop}px`;
    };

    const onDragMove = (e) => {
      if (!isDragging) return;
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      const maxLeft = window.innerWidth - floatingWidget.offsetWidth - 8;
      const maxTop = window.innerHeight - floatingWidget.offsetHeight - 8;

      newLeft = Math.max(8, Math.min(newLeft, maxLeft));
      newTop = Math.max(8, Math.min(newTop, maxTop));

      floatingWidget.style.left = `${newLeft}px`;
      floatingWidget.style.top = `${newTop}px`;
    };

    const onDragEnd = () => {
      if (isDragging) {
        isDragging = false;
        floatingWidget.classList.remove('is-dragging');
      }
    };

    floatingWidget.addEventListener('pointerdown', onDragStart);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
    floatingWidget.addEventListener('touchstart', onDragStart, { passive: true });
    window.addEventListener('touchmove', onDragMove, { passive: true });
    window.addEventListener('touchend', onDragEnd);

    // Hover / mousemove interaction
    floatingWidget.addEventListener('mouseenter', showMiniControls);
    floatingWidget.addEventListener('mousemove', showMiniControls);
    floatingWidget.addEventListener('mouseleave', () => {
      if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
      controlsHideTimeout = setTimeout(hideMiniControlsImmediately, 600);
    });

    // Touch / click toggle
    floatingWidget.addEventListener('click', (e) => {
      if (!e.target.closest('button') && !e.target.closest('#miniOptionsMenu')) {
        showMiniControls();
      }
    });
  }

  // 6. Wire up Event Listeners
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', minimizeToFloatingWidget);
  }

  if (miniMaximizeHeaderBtn) {
    miniMaximizeHeaderBtn.addEventListener('click', restoreToFullScreen);
  }
  if (miniMaximizeBtn) {
    miniMaximizeBtn.addEventListener('click', restoreToFullScreen);
  }

  if (miniMoreBtn) {
    miniMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showMiniControls();
      if (miniOptionsMenu) miniOptionsMenu.classList.toggle('hidden');
    });
  }

  // Close options menu when clicking outside
  document.addEventListener('click', (e) => {
    if (miniOptionsMenu && !miniOptionsMenu.contains(e.target) && e.target !== miniMoreBtn) {
      miniOptionsMenu.classList.add('hidden');
    }
  });

  if (miniToggleMicBtn) {
    miniToggleMicBtn.addEventListener('click', () => {
      const micBtn = document.getElementById('toggleMicBtn');
      if (micBtn) micBtn.click();
      syncMiniButtonStates();
      showMiniControls();
    });
  }

  if (miniToggleCamBtn) {
    miniToggleCamBtn.addEventListener('click', () => {
      const camBtn = document.getElementById('toggleCamBtn');
      if (camBtn) camBtn.click();
      syncMiniButtonStates();
      showMiniControls();
    });
  }

  if (miniEndCallBtn) {
    miniEndCallBtn.addEventListener('click', () => {
      const endBtn = document.getElementById('endCallBtn');
      if (endBtn) endBtn.click();
    });
  }

  if (miniModePopoutBtn) {
    miniModePopoutBtn.addEventListener('click', openPopoutWindow);
  }
  if (miniModeFloatingBtn) {
    miniModeFloatingBtn.addEventListener('click', () => {
      if (miniOptionsMenu) miniOptionsMenu.classList.add('hidden');
      minimizeToFloatingWidget();
    });
  }
  if (miniModeFullscreenBtn) {
    miniModeFullscreenBtn.addEventListener('click', restoreToFullScreen);
  }
}