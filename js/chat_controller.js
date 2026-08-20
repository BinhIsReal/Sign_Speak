/**
 * Realtime Chat Controller for Sign_Speak
 * Dynamically loads conversation list, active partner details, Symmetrical Canonical Room IDs,
 * XSS Security Sanitization, URL ?chat_with= parameter handling, and Realtime Supabase Broadcast Messaging.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const conversationsList = document.getElementById("conversationsList");
  const conversationsSearchInput = document.getElementById(
    "conversationsSearchInput",
  );
  const conversationsCountBadge = document.getElementById(
    "conversationsCountBadge",
  );
  const activeChatAvatar = document.getElementById("activeChatAvatar");
  const activeChatStatusDot = document.getElementById("activeChatStatusDot");
  const activeChatName = document.getElementById("activeChatName");
  const activeChatSub = document.getElementById("activeChatSub");
  const activeVideoCallLink = document.getElementById("activeVideoCallLink");
  const chatStream = document.getElementById("chatStream");
  const chatMessageInput = document.getElementById("chatMessageInput");
  const chatForm = document.getElementById("chatForm");

  const escape = window.securityGuard
    ? window.securityGuard.escapeHTML.bind(window.securityGuard)
    : (s) => s;
  const sanitize = window.securityGuard
    ? window.securityGuard.sanitizeInput.bind(window.securityGuard)
    : (s) => s;

  const currentUser = await window.supabaseService.getCurrentUser();
  const currentUserId = currentUser ? currentUser.id : "usr_anon";
  const currentUserName = currentUser
    ? currentUser.user_metadata.display_name || "Tôi"
    : "Tôi";

  let activePartner = null;
  let activeRoomId = "room_default";

  // Check URL query parameter ?chat_with=...
  const urlParams = new URLSearchParams(window.location.search);
  const chatWithTarget = urlParams.get("chat_with");

  function updateActiveCardUI(partnerId) {
    if (!conversationsList || !partnerId) return;
    conversationsList.querySelectorAll("[data-partner-id]").forEach((card) => {
      const cardPartnerId = card.getAttribute("data-partner-id");
      const avatarEl = card.querySelector(".w-11.h-11");
      const nameEl = card.querySelector(".text-xs.font-bold");
      const lastTextEl = card.querySelector("p");

      if (cardPartnerId === partnerId) {
        card.className = "flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all bg-primary/10 border-l-4 border-primary shadow-sm font-bold";
        if (avatarEl) {
          avatarEl.className = "w-11 h-11 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center shadow-sm";
        }
        if (nameEl) {
          nameEl.className = "text-xs font-bold text-primary truncate";
        }
        if (lastTextEl) {
          lastTextEl.className = "text-[11px] text-primary font-semibold truncate";
        }
        const badgeEl = card.querySelector(".nav-badge");
        if (badgeEl) badgeEl.remove();
      } else {
        const canonicalRoomId = window.supabaseService.getCanonicalRoomId(currentUserId, cardPartnerId);
        const unreadCount = window.supabaseService.getUnreadMessagesCountForUser(canonicalRoomId, currentUserId, cardPartnerId);
        const isUnread = unreadCount > 0;

        card.className = `flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all ${
          isUnread ? "bg-rose-50/50 border-l-4 border-rose-500 shadow-sm" : "hover:bg-slate-100/70 border-l-4 border-transparent"
        }`;

        if (avatarEl) {
          avatarEl.className = `w-11 h-11 rounded-full ${isUnread ? "bg-rose-500 text-white" : "bg-slate-200 text-slate-700"} font-bold text-sm flex items-center justify-center shadow-sm`;
        }
        if (nameEl) {
          nameEl.className = `text-xs font-bold ${isUnread ? "text-rose-600 font-extrabold" : "text-slate-900"} truncate`;
        }
        if (lastTextEl) {
          lastTextEl.className = `text-[11px] ${isUnread ? "text-rose-600 font-bold" : "text-slate-500"} truncate`;
        }
      }
    });
  }

  const mobileBackBtn = document.getElementById("mobileBackToConversationsBtn");
  if (mobileBackBtn) {
    mobileBackBtn.addEventListener("click", () => {
      document.body.classList.remove("mobile-chat-open");
    });
  }

  function setPartnerDetails(partner, shouldMarkRead = false, openMobileChat = false) {
    if (!partner) return;
    activePartner = partner;
    activeRoomId = window.supabaseService.getCanonicalRoomId(
      currentUserId,
      partner.id,
    );

    // Switch to active chat window on mobile screen ONLY when user initiates it
    if (openMobileChat) {
      document.body.classList.add("mobile-chat-open");
    }

    if (shouldMarkRead) {
      window.supabaseService.markMessagesAsRead(activeRoomId, currentUserId, partner.id);
    }

    if (activeChatAvatar) {
      const pAvt = partner.avatar_url || partner.avatar;
      if (pAvt && (pAvt.startsWith('http') || pAvt.startsWith('data:image') || pAvt.includes('/'))) {
        activeChatAvatar.innerHTML = `<img src="${escape(pAvt)}" class="w-full h-full object-cover rounded-full" alt="${escape(partner.display_name)}" />`;
        activeChatAvatar.classList.add('overflow-hidden');
      } else {
        activeChatAvatar.innerText = escape(partner.avatar || "US");
      }
    }
    if (activeChatName)
      activeChatName.innerText = escape(
        partner.display_name || "Người dùng",
      );
    const isPartnerOnline = window.supabaseService.isUserOnline(partner.id);
    if (activeChatStatusDot) {
      activeChatStatusDot.className = `absolute bottom-0 right-0 w-3 h-3 rounded-full ${isPartnerOnline ? "bg-emerald-500" : "bg-slate-400"} border-2 border-white dark:border-[#151e32] shadow-sm`;
    }
    if (activeChatSub) {
      activeChatSub.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full ${isPartnerOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}"></span>
        <span>${escape(partner.username || "@user")} • ${isPartnerOnline ? '<span class="text-emerald-600 font-semibold">Đang hoạt động</span>' : '<span class="text-slate-400">Ngoại tuyến</span>'}</span>
      `;
    }

    if (activeVideoCallLink) {
      activeVideoCallLink.href = `call.html?room=${encodeURIComponent(activeRoomId)}&partner=${encodeURIComponent(partner.display_name)}&role=caller`;
    }

    // Synchronous 0ms active card UI update
    updateActiveCardUI(partner.id);

    loadChatMessages();
    window.supabaseService.subscribeChatRoom(activeRoomId, (newMsg) => {
      if (newMsg.sender_id !== currentUserId) {
        if (activePartner && activePartner.id === newMsg.sender_id) {
          window.supabaseService.markMessagesAsRead(activeRoomId, currentUserId);
        }
        appendMessageToUI(newMsg);
      }
      loadConversationsList(conversationsSearchInput ? conversationsSearchInput.value : "");
    });
  }

  // Subscribe to user's personal message channel for global real-time notifications
  if (currentUserId && currentUserId !== "usr_anon") {
    window.supabaseService.subscribeGlobalUserMessages(currentUserId, (incomingMsg) => {
      if (incomingMsg.sender_id !== currentUserId) {
        if (activePartner && (incomingMsg.sender_id === activePartner.id || incomingMsg.sender_id === activePartner.username)) {
          window.supabaseService.markMessagesAsRead(activeRoomId, currentUserId, activePartner.id);
          appendMessageToUI(incomingMsg);
        } else {
          window.supabaseService.showGlobalMessageToast(incomingMsg);
        }
      }
      loadConversationsList(conversationsSearchInput ? conversationsSearchInput.value : "");
      window.supabaseService.updateSidebarBadges();
    });
  }

  async function loadChatMessages() {
    if (!chatStream) return;
    
    // 1. Immediate local history render
    const localHistory = window.supabaseService.getChatHistory(activeRoomId);
    renderHistoryUI(localHistory);

    // 2. Async Cloud Database history sync
    const cloudHistory = await window.supabaseService.getChatHistoryAsync(activeRoomId);
    renderHistoryUI(cloudHistory);
  }

  function renderHistoryUI(history) {
    if (!chatStream) return;
    if (!history || history.length === 0) {
      chatStream.innerHTML = `
        <div class="py-12 text-center text-slate-400 text-xs font-medium">
          <span class="material-symbols-outlined text-4xl mb-2 text-slate-300 block">chat</span>
          Chưa có tin nhắn nào với <span class="font-bold text-slate-700">${escape(activePartner ? activePartner.display_name : "bạn bè")}</span>.<br/>Hãy gửi tin nhắn đầu tiên bên dưới!
        </div>
      `;
      return;
    }

    chatStream.innerHTML = history.map((m) => renderMessageBubble(m)).join("");
    scrollChatToBottom();
  }

  function renderMessageBubble(msg) {
    const isMe = msg.sender_id === currentUserId || (currentUser && currentUser.email && msg.sender_id === currentUser.email);
    const rawId = msg.id || ("msg_" + Math.random().toString(36).substr(2, 9));
    const safeId = escape(rawId);
    const safeText = escape(msg.text);
    const safeTime = escape(msg.timestamp || "Mới");

    // Call Log Message Bubble Rendering
    if (msg.msg_type === 'call_log' || msg.call_status || (msg.text && msg.text.includes('📞'))) {
      const status = msg.call_status || (msg.text.includes('nhỡ') ? 'missed' : msg.text.includes('từ chối') ? 'declined' : 'completed');
      let icon = 'videocam';
      let iconBg = 'bg-primary/10 text-primary';
      let statusLabel = 'Cuộc gọi video';

      if (status === 'missed') {
        icon = 'phone_missed';
        iconBg = 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400';
        statusLabel = 'Cuộc gọi nhỡ';
      } else if (status === 'declined') {
        icon = 'phone_disabled';
        iconBg = 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400';
        statusLabel = 'Cuộc gọi bị từ chối';
      } else {
        icon = isMe ? 'call_made' : 'call_received';
        iconBg = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400';
        statusLabel = `Cuộc gọi video${msg.duration ? ' • ' + escape(msg.duration) : ''}`;
      }

      const callBackUrl = activePartner 
        ? `call.html?room=${encodeURIComponent(activeRoomId)}&partner=${encodeURIComponent(activePartner.display_name)}&role=caller`
        : `call.html?room=${encodeURIComponent(activeRoomId)}&role=caller`;

      return `
        <div data-msg-id="${safeId}" class="flex flex-col items-center my-3 w-full">
          <div class="flex items-center gap-3 p-3 px-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm max-w-[85%]">
            <div class="w-9 h-9 rounded-full ${iconBg} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">${icon}</span>
            </div>
            <div class="flex flex-col min-w-0 pr-2">
              <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${statusLabel}</span>
              <span class="text-[10px] text-slate-400 font-semibold">${safeTime}</span>
            </div>
            <a href="${callBackUrl}" class="ml-auto px-3 py-1.5 rounded-full bg-primary text-white text-xs font-bold hover:brightness-110 flex items-center gap-1 shadow-sm shrink-0 active:scale-95 transition-all" title="Gọi lại">
              <span class="material-symbols-outlined text-[15px]">videocam</span>
              <span>Gọi lại</span>
            </a>
          </div>
        </div>
      `;
    }

    if (isMe) {
      return `
        <div data-msg-id="${safeId}" class="flex flex-col items-end gap-1 mb-3">
          <div class="max-w-[70%] bg-primary text-white p-3.5 rounded-3xl rounded-tr-sm text-sm font-medium shadow-md shadow-primary/10">
            ${safeText}
          </div>
          <span class="text-[10px] text-slate-400 font-semibold pr-1">${safeTime}</span>
        </div>
      `;
    } else {
      const pAvt = activePartner ? (activePartner.avatar_url || activePartner.avatar) : '';
      const isImgAvt = pAvt && (pAvt.startsWith('http') || pAvt.startsWith('data:image') || pAvt.includes('/'));
      return `
        <div data-msg-id="${safeId}" class="flex items-start gap-2.5 mb-3">
          <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
            ${isImgAvt 
              ? `<img src="${escape(pAvt)}" class="w-full h-full object-cover rounded-full" alt="Avatar" />`
              : escape(activePartner ? activePartner.avatar : "US")}
          </div>
          <div class="flex flex-col gap-1 max-w-[70%]">
            <div class="bg-white text-slate-900 border border-slate-200/80 p-3.5 rounded-3xl rounded-tl-sm text-sm font-medium shadow-sm">
              ${safeText}
            </div>
            <span class="text-[10px] text-slate-400 font-semibold pl-1">${safeTime}</span>
          </div>
        </div>
      `;
    }
  }

  function appendMessageToUI(msg) {
    if (!chatStream || !msg) return;
    const safeId = msg.id;

    // Deduplication guard
    if (safeId && chatStream.querySelector(`[data-msg-id="${safeId}"]`)) {
      return;
    }

    const emptyState = chatStream.querySelector(".text-center");
    if (emptyState) chatStream.innerHTML = "";

    chatStream.insertAdjacentHTML("beforeend", renderMessageBubble(msg));
    scrollChatToBottom();
  }

  function scrollChatToBottom() {
    if (chatStream) {
      chatStream.scrollTop = chatStream.scrollHeight;
    }
  }

  // 1. Load Conversations List
  async function loadConversationsList(filterQuery = "") {
    const cleanQuery = sanitize(filterQuery);
    const friends = await window.supabaseService.searchGlobalUsers(
      cleanQuery,
      "friends",
    );

    if (conversationsCountBadge) {
      conversationsCountBadge.innerText = `${friends.length} hội thoại`;
    }

    if (!conversationsList) return;

    if (!friends || friends.length === 0) {
      conversationsList.innerHTML = `
        <div class="py-12 text-center text-slate-400 p-4">
          <span class="material-symbols-outlined text-4xl mb-2 text-slate-300 block">chat_bubble_outline</span>
          <p class="text-xs font-bold text-slate-700">Chưa có bạn bè nào</p>
          <p class="text-[11px] text-slate-500 mt-1">Hãy kết bạn ở trang <a href="contacts.html" class="text-primary underline font-bold">Danh Bạ</a> để nhắn tin!</p>
        </div>
      `;

      if (chatWithTarget) {
        const globalUsers = await window.supabaseService.searchGlobalUsers(
          "",
          "all",
        );
        const target = globalUsers.find(
          (u) => u.id === chatWithTarget || u.username === chatWithTarget,
        );
        if (target) setPartnerDetails(target);
      }
      return;
    }

    // Seed sample unread messages for initial experience
    if (typeof window.supabaseService.seedDefaultUnreadMessages === "function") {
      window.supabaseService.seedDefaultUnreadMessages(currentUserId, friends);
    }

    // Calculate last interaction timestamp and metadata for each friend
    const friendsWithMeta = friends.map((f) => {
      const canonicalRoomId = window.supabaseService.getCanonicalRoomId(
        currentUserId,
        f.id,
      );
      const unreadCount = typeof window.supabaseService.getUnreadMessagesCountForUser === "function"
        ? window.supabaseService.getUnreadMessagesCountForUser(canonicalRoomId, currentUserId, f.id)
        : (typeof window.supabaseService.getUnreadMessagesCountForRoom === "function"
          ? window.supabaseService.getUnreadMessagesCountForRoom(canonicalRoomId, currentUserId)
          : 0);
      const history = window.supabaseService.getChatHistory(canonicalRoomId);
      const lastMsg = history.length > 0 ? history[history.length - 1] : null;

      let lastTimeMs = 0;
      if (lastMsg) {
        if (lastMsg.created_at) {
          lastTimeMs = new Date(lastMsg.created_at).getTime();
        } else if (lastMsg.id && lastMsg.id.includes('_')) {
          const parts = lastMsg.id.split('_');
          const lastNum = Number(parts[parts.length - 1]);
          if (!isNaN(lastNum) && lastNum > 1000000000) lastTimeMs = lastNum;
        } else if (lastMsg.timestamp) {
          const [h, m] = lastMsg.timestamp.split(':');
          if (h !== undefined && m !== undefined) {
            const d = new Date();
            d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
            lastTimeMs = d.getTime();
          }
        }
      }

      const isOnline = window.supabaseService.isUserOnline(f);
      f.online = isOnline;

      return {
        friend: f,
        canonicalRoomId,
        unreadCount,
        history,
        lastMsg,
        lastTimeMs
      };
    });

    // SORT BY LATEST INTERACTION TIMESTAMP DESCENDING
    friendsWithMeta.sort((a, b) => b.lastTimeMs - a.lastTimeMs);

    const sortedFriends = friendsWithMeta.map(item => item.friend);

    // Auto select partner from URL or top sorted friend
    if (!activePartner) {
      if (chatWithTarget) {
        const target = sortedFriends.find(
          (u) => u.id === chatWithTarget || u.username === chatWithTarget,
        );
        if (target) {
          setPartnerDetails(target, true, true); // User specified target in URL -> open mobile chat view
        } else {
          setPartnerDetails(sortedFriends[0], true, false); // Default desktop select, stay on list view on mobile
        }
      } else {
        setPartnerDetails(sortedFriends[0], true, false); // Default desktop select, stay on list view on mobile
      }
    }

    conversationsList.innerHTML = friendsWithMeta
      .map(({ friend: f, unreadCount, lastMsg }) => {
        const isActive = activePartner && activePartner.id === f.id;
        const rawLastText = lastMsg
          ? lastMsg.text
          : "Sẵn sàng trò chuyện STT";
        const safeLastText = escape(
          rawLastText.length > 25
            ? rawLastText.substring(0, 25) + "..."
            : rawLastText,
        );
        const safeTime = escape(
          lastMsg ? lastMsg.timestamp || "Mới" : "Trực tuyến",
        );

        const isUnread = unreadCount > 0;
        const unreadBadgeHTML = isUnread
          ? `<span class="nav-badge ml-2 shrink-0">${unreadCount > 99 ? '99+' : unreadCount}</span>`
          : ``;

        const isOnline = f.online;

        return `
        <div data-partner-id="${escape(f.id)}" class="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all ${
          isActive
            ? "bg-primary/10 border-l-4 border-primary shadow-sm font-bold"
            : isUnread
              ? "bg-rose-50/50 border-l-4 border-rose-500 shadow-sm"
              : "hover:bg-slate-100/70 border-l-4 border-transparent"
        }">
          <div class="flex items-center gap-3.5 min-w-0 flex-1">
            <div class="relative shrink-0">
              <div class="w-11 h-11 rounded-full ${isActive ? "bg-primary text-white" : isUnread ? "bg-rose-500 text-white" : "bg-slate-200 text-slate-700"} font-bold text-sm flex items-center justify-center shadow-sm overflow-hidden">
                ${(f.avatar_url || f.avatar) && ((f.avatar_url || f.avatar).startsWith('http') || (f.avatar_url || f.avatar).startsWith('data:image') || (f.avatar_url || f.avatar).includes('/'))
                  ? `<img src="${escape(f.avatar_url || f.avatar)}" class="w-full h-full object-cover rounded-full" alt="${escape(f.display_name)}" />`
                  : escape(f.avatar || (f.display_name ? f.display_name.substring(0, 2).toUpperCase() : "US"))}
              </div>
              <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${isOnline ? "bg-emerald-500" : "bg-slate-400"}"></span>
            </div>
            <div class="flex flex-col min-w-0 pr-2">
              <span class="text-xs font-bold ${isUnread ? "text-rose-600 font-extrabold" : "text-slate-900"} truncate">${escape(f.display_name)}</span>
              <p class="text-[11px] ${isUnread ? "text-rose-600 font-bold" : "text-slate-500"} truncate">${safeLastText}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-slate-400 font-semibold shrink-0">${safeTime}</span>
            ${unreadBadgeHTML}
          </div>
        </div>
      `;
      })
      .join("");

    window.supabaseService.updateSidebarBadges();

    conversationsList.querySelectorAll("[data-partner-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const partnerId = card.getAttribute("data-partner-id");
        const selectedPartner = sortedFriends.find((f) => f.id === partnerId);
        if (selectedPartner) {
          setPartnerDetails(selectedPartner, true, true);
        }
      });
    });
  }

  function markCurrentChatAsRead() {
    if (activeRoomId && activePartner && currentUserId) {
      window.supabaseService.markMessagesAsRead(activeRoomId, currentUserId, activePartner.id);
      updateActiveCardUI(activePartner.id);
    }
  }

  // 2. Send Message Handler
  if (chatForm && chatMessageInput) {
    chatMessageInput.addEventListener("focus", markCurrentChatAsRead);
    chatMessageInput.addEventListener("click", markCurrentChatAsRead);

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawText = chatMessageInput.value;
      const cleanText = sanitize(rawText).trim();

      if (!cleanText || !activePartner) return;

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      const msgObj = {
        id: "msg_" + Math.random().toString(36).substr(2, 9),
        room_id: activeRoomId,
        sender_id: currentUserId,
        recipient_id: activePartner.id,
        sender_name: currentUserName,
        text: cleanText,
        timestamp: timeStr,
        read: false
      };

      chatMessageInput.value = "";
      appendMessageToUI(msgObj);
      await window.supabaseService.saveChatMessage(activeRoomId, msgObj);
      loadConversationsList(conversationsSearchInput ? conversationsSearchInput.value : "");
    });
  }

  if (conversationsSearchInput) {
    conversationsSearchInput.addEventListener("input", () => {
      loadConversationsList(conversationsSearchInput.value);
    });
  }

  // 3-second background sync for Messenger-like real-time responsiveness
  setInterval(async () => {
    if (activeRoomId && activePartner) {
      const cloudHistory = await window.supabaseService.getChatHistoryAsync(activeRoomId);
      if (cloudHistory && cloudHistory.length > 0) {
        cloudHistory.forEach(m => appendMessageToUI(m));
      }
      if (activeChatStatusDot && window.supabaseService) {
        const isOnline = window.supabaseService.isUserOnline(activePartner.id);
        activeChatStatusDot.className = `absolute bottom-0 right-0 w-3 h-3 rounded-full ${isOnline ? "bg-emerald-500" : "bg-slate-400"} border-2 border-white dark:border-[#151e32] shadow-sm`;
      }
    }
  }, 3000);

  window.loadConversationsListGlobal = () => {
    loadConversationsList(conversationsSearchInput ? conversationsSearchInput.value : "");
  };

  window.openChatWithUser = async (partnerId) => {
    if (!partnerId) return;
    try {
      const allUsers = await window.supabaseService.searchGlobalUsers("", "all");
      const target = allUsers.find(u => u.id === partnerId);
      if (target) {
        setPartnerDetails(target, true, true);
        if (chatMessageInput) {
          setTimeout(() => chatMessageInput.focus(), 150);
        }
      }
    } catch (e) {
      console.warn("[openChatWithUser error]:", e);
    }
  };

  await loadConversationsList();
});
