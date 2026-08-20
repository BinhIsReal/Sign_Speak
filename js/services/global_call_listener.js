/**
 * Global Call Listener Service for Sign_Speak
 * Listens for Realtime Incoming Video Calls across all pages.
 * Features persistent Ringing Heartbeat reception, deduplication, and immediate Cancel/Dismiss handling.
 */

let activeIncomingCallSession = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Delay slightly to ensure Supabase Service initializes
  setTimeout(async () => {
    if (!window.supabaseService) return;

    const currentUser = await window.supabaseService.getCurrentUser();
    if (!currentUser) return;

    // 1. Initial Cloud Message Sync & Sidebar Badges on ALL pages!
    await window.supabaseService.syncUnreadCloudMessagesToLocal(currentUser.id);
    window.supabaseService.updateSidebarBadges();

    // Request push notification permission after login (first call listener init)
    if (window.pushNotificationService) {
      window.pushNotificationService.requestPermission();
    }

    // 2. Global Incoming Video Call Notifications with Heartbeat Deduplication
    window.supabaseService.subscribeGlobalCallNotifications(currentUser.id, (callPayload) => {
      handleIncomingCallSignal(callPayload);
    });

    // 3. Global Incoming Realtime Message Notifications across ALL pages!
    window.supabaseService.subscribeUserMessageNotifications(currentUser.id, (incomingMsg) => {
      if (incomingMsg && incomingMsg.sender_id !== currentUser.id) {
        const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
        if (!all.some(m => m.id === incomingMsg.id)) {
          incomingMsg.read = false; // Mark unread for badge
          all.push(incomingMsg);
          localStorage.setItem('chat_messages_db', JSON.stringify(all));
        }
        window.supabaseService.updateSidebarBadges();

        if (typeof window.loadConversationsListGlobal === 'function') {
          window.loadConversationsListGlobal();
        }
      }
    });

    // 4. Background Sync Poller (Paused during active video call or hidden tab to prioritize WebRTC bandwidth)
    setInterval(async () => {
      if (document.visibilityState === 'visible' && !window.location.pathname.includes('call.html')) {
        await window.supabaseService.syncUnreadCloudMessagesToLocal(currentUser.id);
        window.supabaseService.updateSidebarBadges();
      }
    }, 5000);
  }, 500);
});

/**
 * Handles incoming call payloads from realtime broadcast channels.
 * Supports Heartbeat deduplication and immediate dismissal on call cancellation.
 */
function handleIncomingCallSignal(callPayload) {
  if (!callPayload) return;

  const type = callPayload.type || 'incoming_call';
  const roomId = callPayload.roomId || '';

  // 1. If caller cancelled or call ended/declined, dismiss ringing modal immediately
  if (type === 'call_cancelled' || type === 'call-cancelled' || type === 'call-ended' || type === 'call_declined' || type === 'call-declined') {
    if (activeIncomingCallSession && (activeIncomingCallSession.roomId === roomId || !roomId)) {
      console.log('[Global Call Listener] Call cancelled/ended by caller. Dismissing ringing modal.');
      dismissActiveCallSession();
    }
    return;
  }

  // 2. If user is currently in active call.html with this room, ignore
  if (window.location.pathname.includes('call.html')) {
    return;
  }

  // 3. Heartbeat Deduplication: If already ringing for this roomId, update timestamp without rebuilding modal
  if (activeIncomingCallSession && activeIncomingCallSession.roomId === roomId) {
    activeIncomingCallSession.lastHeartbeat = Date.now();
    return;
  }

  // 4. New incoming call -> render interactive modal
  showIncomingCallModal(callPayload);
}

function dismissActiveCallSession() {
  if (!activeIncomingCallSession) return;

  if (activeIncomingCallSession.missedCallTimeout) {
    clearTimeout(activeIncomingCallSession.missedCallTimeout);
  }
  if (activeIncomingCallSession.systemNotification) {
    try {
      activeIncomingCallSession.systemNotification.close();
    } catch (_e) {}
  }
  if (window.pushNotificationService) {
    window.pushNotificationService.stopRingtone();
  }

  const existingModal = document.getElementById('globalIncomingCallModal');
  if (existingModal) {
    existingModal.remove();
  }

  activeIncomingCallSession = null;
}

function showIncomingCallModal(callData) {
  dismissActiveCallSession();

  const callerName = callData.callerName || 'Người dùng Sign Speak';
  const callerAvatar = callData.callerAvatar || 'NA';
  const callerId = callData.callerId || '';
  const roomId = callData.roomId || 'room_default';

  const modalHtml = `
    <div id="globalIncomingCallModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
      <div class="bg-white dark:bg-[#151e32] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full text-center space-y-5 transform transition-all duration-300">
        <div class="relative w-20 h-20 mx-auto mt-2">
          <div class="w-20 h-20 rounded-full bg-primary text-white font-bold text-2xl flex items-center justify-center shadow-xl border-4 border-white dark:border-slate-700 animate-pulse">
            ${callerAvatar}
          </div>
          <span class="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-700 shadow-md"></span>
        </div>

        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white">${callerName}</h3>
          <p class="text-xs text-primary font-bold mt-1.5 flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[16px] animate-bounce">videocam</span>
            <span>Cuộc gọi Video VSL Realtime...</span>
          </p>
        </div>

        <div class="flex items-center justify-center gap-3 pt-2">
          <button id="globalDeclineCallBtn" class="px-5 py-2.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-200 transition-all cursor-pointer">
            Từ chối
          </button>
          <button id="globalAcceptCallBtn" class="px-6 py-2.5 rounded-full bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer">
            Chấp nhận
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Play ringtone
  if (window.pushNotificationService) {
    window.pushNotificationService.playRingtone();
  }

  // Show system push notification only when user is in another tab
  let systemNotification = null;
  if (document.visibilityState === 'hidden' && window.pushNotificationService) {
    systemNotification = window.pushNotificationService.showCallNotification(
      callerName,
      roomId,
      () => {
        const acceptBtnFromNotif = document.getElementById('globalAcceptCallBtn');
        if (acceptBtnFromNotif) acceptBtnFromNotif.click();
      }
    );
  }

  const modal = document.getElementById('globalIncomingCallModal');
  const acceptBtn = document.getElementById('globalAcceptCallBtn');
  const declineBtn = document.getElementById('globalDeclineCallBtn');

  // 60-second unanswered timeout (Missed call)
  const missedCallTimeout = setTimeout(async () => {
    dismissActiveCallSession();

    const currentUser = await window.supabaseService.getCurrentUser();
    const myUserId = currentUser ? currentUser.id : '';
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const missedLog = {
      id: window.supabaseService.generateUUID(),
      room_id: roomId,
      sender_id: callerId,
      recipient_id: myUserId,
      sender_name: callerName,
      msg_type: 'call_log',
      call_status: 'missed',
      duration: '',
      text: '📞 Cuộc gọi nhỡ',
      timestamp: timeStr,
      read: false
    };

    window.supabaseService.saveChatMessage(roomId, missedLog);
  }, 60000);

  activeIncomingCallSession = {
    roomId,
    callerId,
    callerName,
    missedCallTimeout,
    systemNotification,
    lastHeartbeat: Date.now()
  };

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      dismissActiveCallSession();
      window.location.href = `call.html?room=${encodeURIComponent(roomId)}&partner=${encodeURIComponent(callerName)}&role=callee`;
    });
  }

  if (declineBtn) {
    declineBtn.addEventListener('click', async () => {
      dismissActiveCallSession();

      const currentUser = await window.supabaseService.getCurrentUser();
      const myUserId = currentUser ? currentUser.id : '';
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      // 1. Broadcast call-declined signal to the room so caller exits immediately
      try {
        await window.supabaseService.sendSignalingMessage({
          type: 'call-declined',
          roomId: roomId,
          senderId: myUserId,
          callerId: callerId,
          reason: 'declined'
        });
      } catch (_e) {}

      // 2. Also send direct notification to caller user ID
      if (callerId) {
        try {
          await window.supabaseService.sendCallNotification(callerId, {
            type: 'call_declined',
            roomId: roomId,
            senderId: myUserId
          });
        } catch (_e) {}
      }

      // 3. Save declined log to chat
      const declinedLog = {
        id: window.supabaseService.generateUUID(),
        room_id: roomId,
        sender_id: callerId,
        recipient_id: myUserId,
        sender_name: callerName,
        msg_type: 'call_log',
        call_status: 'declined',
        duration: '',
        text: '📞 Cuộc gọi bị từ chối',
        timestamp: timeStr,
        read: false
      };

      window.supabaseService.saveChatMessage(roomId, declinedLog);
    });
  }
}
