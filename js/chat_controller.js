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
      const isActive = cardPartnerId === partnerId;
      const canonicalRoomId = window.supabaseService.getCanonicalRoomId(currentUserId, cardPartnerId);
      const unreadCount = isActive ? 0 : (typeof window.supabaseService.getUnreadMessagesCountForUser === "function" ? window.supabaseService.getUnreadMessagesCountForUser(canonicalRoomId, currentUserId, cardPartnerId) : 0);
      const isUnread = unreadCount > 0;

      card.className = `conversation-item group relative flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer transition-all duration-200 ${
        isActive
          ? "bg-primary/[0.08] dark:bg-primary/[0.18] shadow-xs border border-primary/25 text-primary"
          : isUnread
            ? "bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200/80 dark:border-rose-900/40 shadow-xs"
            : "hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200/60 dark:hover:border-slate-700/60"
      }`;

      // Update active indicator pill
      let pillEl = card.querySelector(".active-pill");
      if (isActive) {
        if (!pillEl) {
          pillEl = document.createElement("span");
          pillEl.className = "active-pill absolute left-1 top-3 bottom-3 w-1 bg-primary rounded-full shadow-sm";
          card.prepend(pillEl);
        } else {
          pillEl.className = "active-pill absolute left-1 top-3 bottom-3 w-1 bg-primary rounded-full shadow-sm";
        }
      } else if (isUnread) {
        if (!pillEl) {
          pillEl = document.createElement("span");
          pillEl.className = "active-pill absolute left-1 top-3.5 bottom-3.5 w-1 bg-rose-500 rounded-full";
          card.prepend(pillEl);
        } else {
          pillEl.className = "active-pill absolute left-1 top-3.5 bottom-3.5 w-1 bg-rose-500 rounded-full";
        }
      } else if (pillEl) {
        pillEl.remove();
      }

      // Update avatar box styling
      const avatarBox = card.querySelector(".avatar-box");
      if (avatarBox) {
        avatarBox.className = `avatar-box w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shadow-xs overflow-hidden transition-transform duration-200 group-hover:scale-105 ${
          isActive
            ? "bg-gradient-to-tr from-primary to-primary-container text-white ring-2 ring-primary/30"
            : isUnread
              ? "bg-gradient-to-tr from-rose-500 to-rose-400 text-white ring-2 ring-rose-300 dark:ring-rose-900/50"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700"
        }`;
      }

      // Update name text
      const nameEl = card.querySelector(".partner-name");
      if (nameEl) {
        nameEl.className = `partner-name text-[13px] font-bold tracking-tight truncate transition-colors ${
          isActive
            ? "text-primary dark:text-primary-fixed"
            : isUnread
              ? "text-slate-900 dark:text-white font-extrabold"
              : "text-slate-900 dark:text-slate-100 group-hover:text-primary"
        }`;
      }

      // Update last message text
      const textEl = card.querySelector(".last-msg-text");
      if (textEl) {
        textEl.className = `last-msg-text text-[12px] truncate leading-tight transition-colors ${
          isActive
            ? "text-primary/80 dark:text-primary-fixed/80 font-medium"
            : isUnread
              ? "text-rose-600 dark:text-rose-400 font-semibold"
              : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300"
        }`;
      }

      // Remove unread badge if active
      const badgeEl = card.querySelector(".unread-badge");
      if (isActive && badgeEl) {
        badgeEl.remove();
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
        <div class="py-16 text-center text-slate-400 text-xs font-medium flex flex-col items-center justify-center h-full">
          <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400 dark:text-slate-500">
            <span class="material-symbols-outlined text-[24px]">chat_bubble_outline</span>
          </div>
          <p class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Chưa có tin nhắn nào</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Bắt đầu cuộc trò chuyện với <span class="font-bold text-slate-900 dark:text-white">${escape(activePartner ? activePartner.display_name : "bạn bè")}</span></p>
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

    // Compact Single-Line Video Call Bubble Rendering
    if (msg.msg_type === 'call_log' || msg.call_status || (msg.text && msg.text.includes('📞'))) {
      const status = msg.call_status || (msg.text.includes('nhỡ') ? 'missed' : msg.text.includes('từ chối') ? 'declined' : 'completed');
      let icon = 'videocam';
      let iconBg = 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400';
      let statusLabel = 'Cuộc gọi video';

      if (status === 'missed') {
        icon = 'phone_missed';
        iconBg = 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400';
        statusLabel = 'Cuộc gọi nhỡ';
      } else if (status === 'declined') {
        icon = 'phone_disabled';
        iconBg = 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400';
        statusLabel = 'Cuộc gọi bị từ chối';
      } else {
        icon = isMe ? 'call_made' : 'call_received';
        iconBg = 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400';
        statusLabel = msg.duration ? `Cuộc gọi video (${escape(msg.duration)})` : 'Cuộc gọi video';
      }

      const callBackUrl = activePartner 
        ? `call.html?room=${encodeURIComponent(activeRoomId)}&partner=${encodeURIComponent(activePartner.display_name)}&role=caller`
        : `call.html?room=${encodeURIComponent(activeRoomId)}&role=caller`;

      if (isMe) {
        return `
          <div data-msg-id="${safeId}" class="flex flex-col items-end mb-2.5">
            <div class="inline-flex items-center gap-3 py-3 px-4 rounded-2xl rounded-tr-xs bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs shadow-2xs max-w-[85%] md:max-w-[70%]">
              <div class="w-7 h-7 rounded-full ${iconBg} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[16px]">${icon}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-bold truncate text-[13px]">${statusLabel}</span>
                <span class="text-[10px] text-slate-400 font-medium whitespace-nowrap">${safeTime}</span>
              </div>
              <a href="${callBackUrl}" class="ml-1 px-3 py-1.5 rounded-full bg-blue-600 dark:bg-primary text-white text-[11px] font-bold hover:brightness-110 flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-2xs cursor-pointer" title="Gọi lại">
                <span class="material-symbols-outlined text-[14px]">videocam</span>
                <span>Gọi lại</span>
              </a>
            </div>
          </div>
        `;
      } else {
        const pAvt = activePartner ? (activePartner.avatar_url || activePartner.avatar) : '';
        const isImgAvt = pAvt && (pAvt.startsWith('http') || pAvt.startsWith('data:image') || pAvt.includes('/'));
        return `
          <div data-msg-id="${safeId}" class="flex items-start gap-2.5 mb-2.5">
            <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center shrink-0 mt-1 overflow-hidden">
              ${isImgAvt 
                ? `<img src="${escape(pAvt)}" class="w-full h-full object-cover rounded-full" alt="Avatar" />`
                : escape(activePartner ? activePartner.avatar : "US")}
            </div>
            <div class="inline-flex items-center gap-3 py-3 px-4 rounded-2xl rounded-tl-xs bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs shadow-2xs max-w-[85%] md:max-w-[70%]">
              <div class="w-7 h-7 rounded-full ${iconBg} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[16px]">${icon}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-bold truncate text-[13px] ${status === 'missed' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}">${statusLabel}</span>
                <span class="text-[10px] text-slate-400 font-medium whitespace-nowrap">${safeTime}</span>
              </div>
              <a href="${callBackUrl}" class="ml-1 px-3 py-1.5 rounded-full bg-blue-600 dark:bg-primary text-white text-[11px] font-bold hover:brightness-110 flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-2xs cursor-pointer" title="Gọi lại">
                <span class="material-symbols-outlined text-[14px]">videocam</span>
                <span>Gọi lại</span>
              </a>
            </div>
          </div>
        `;
      }
    }

    // Standard Message Bubbles
    if (isMe) {
      return `
        <div data-msg-id="${safeId}" class="flex flex-col items-end gap-1 mb-2.5">
          <div class="max-w-[70%] md:max-w-[65%] bg-blue-600 dark:bg-primary text-white py-2.5 px-4 rounded-2xl rounded-tr-xs text-sm font-normal leading-relaxed break-words shadow-2xs">
            ${safeText}
          </div>
          <span class="text-[10px] text-slate-400 font-medium pr-1">${safeTime}</span>
        </div>
      `;
    } else {
      const pAvt = activePartner ? (activePartner.avatar_url || activePartner.avatar) : '';
      const isImgAvt = pAvt && (pAvt.startsWith('http') || pAvt.startsWith('data:image') || pAvt.includes('/'));
      return `
        <div data-msg-id="${safeId}" class="flex items-start gap-2.5 mb-2.5">
          <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
            ${isImgAvt 
              ? `<img src="${escape(pAvt)}" class="w-full h-full object-cover rounded-full" alt="Avatar" />`
              : escape(activePartner ? activePartner.avatar : "US")}
          </div>
          <div class="flex flex-col gap-1 max-w-[70%] md:max-w-[65%]">
            <div class="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60 py-2.5 px-4 rounded-2xl rounded-tl-xs text-sm font-normal leading-relaxed break-words shadow-2xs">
              ${safeText}
            </div>
            <span class="text-[10px] text-slate-400 font-medium pl-1">${safeTime}</span>
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

  let currentConversationFilter = "all";

  const filterTabsContainer = document.getElementById("conversationFilterTabs");
  if (filterTabsContainer) {
    filterTabsContainer.querySelectorAll(".conversation-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const filterType = btn.getAttribute("data-filter") || "all";
        currentConversationFilter = filterType;

        filterTabsContainer.querySelectorAll(".conversation-filter-btn").forEach((b) => {
          if (b === btn) {
            b.className = "conversation-filter-btn px-3 py-1 rounded-lg text-xs font-bold transition-all bg-primary text-white shadow-xs cursor-pointer";
          } else {
            b.className = "conversation-filter-btn px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer";
          }
        });

        loadConversationsList(conversationsSearchInput ? conversationsSearchInput.value : "");
      });
    });
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
          <span class="material-symbols-outlined text-4xl mb-2 text-slate-300 dark:text-slate-600 block">chat_bubble_outline</span>
          <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Chưa có bạn bè nào</p>
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

    // Filter list by active tab
    let displayFriends = friendsWithMeta;
    if (currentConversationFilter === "unread") {
      displayFriends = friendsWithMeta.filter(item => item.unreadCount > 0);
    } else if (currentConversationFilter === "online") {
      displayFriends = friendsWithMeta.filter(item => item.friend.online);
    }

    if (displayFriends.length === 0) {
      conversationsList.innerHTML = `
        <div class="py-12 text-center text-slate-400 p-4">
          <span class="material-symbols-outlined text-3xl mb-1.5 text-slate-300 dark:text-slate-600 block">filter_list_off</span>
          <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Không tìm thấy hội thoại phù hợp</p>
          <p class="text-[11px] text-slate-500 mt-1">Thử chọn bộ lọc khác hoặc tìm kiếm lại</p>
        </div>
      `;
      return;
    }

    conversationsList.innerHTML = displayFriends
      .map(({ friend: f, unreadCount, lastMsg, lastTimeMs }) => {
        const isActive = activePartner && activePartner.id === f.id;
        const rawLastText = lastMsg
          ? lastMsg.text
          : "Sẵn sàng trò chuyện STT";
        const safeLastText = escape(
          rawLastText.length > 30
            ? rawLastText.substring(0, 30) + "..."
            : rawLastText,
        );

        let safeTime = "Mới";
        if (lastMsg && lastMsg.timestamp) {
          safeTime = lastMsg.timestamp;
        } else if (lastTimeMs > 0) {
          const d = new Date(lastTimeMs);
          const now = new Date();
          if (d.toDateString() === now.toDateString()) {
            safeTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else {
            safeTime = `${d.getDate()}/${d.getMonth() + 1}`;
          }
        }

        const isUnread = unreadCount > 0;
        const unreadBadgeHTML = isUnread
          ? `<span class="unread-badge min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs shadow-rose-500/30 shrink-0 animate-pulse">${unreadCount > 99 ? '99+' : unreadCount}</span>`
          : ``;

        const isOnline = f.online;
        const pAvt = f.avatar_url || f.avatar;
        const hasAvatar = pAvt && (pAvt.startsWith('http') || pAvt.startsWith('data:image') || pAvt.includes('/'));
        const initials = f.avatar || (f.display_name ? f.display_name.trim().split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase() : "US");

        return `
        <div data-partner-id="${escape(f.id)}" class="conversation-item group relative flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer transition-all duration-200 ${
          isActive
            ? "bg-primary/[0.08] dark:bg-primary/[0.18] shadow-xs border border-primary/25 text-primary"
            : isUnread
              ? "bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200/80 dark:border-rose-900/40 shadow-xs"
              : "hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200/60 dark:hover:border-slate-700/60"
        }">
          <!-- Active Pill indicator -->
          ${isActive ? `<span class="active-pill absolute left-1 top-3 bottom-3 w-1 bg-primary rounded-full shadow-sm"></span>` : isUnread ? `<span class="active-pill absolute left-1 top-3.5 bottom-3.5 w-1 bg-rose-500 rounded-full"></span>` : ''}

          <!-- Avatar with Online Dot -->
          <div class="relative shrink-0 ml-1">
            <div class="avatar-box w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shadow-xs overflow-hidden transition-transform duration-200 group-hover:scale-105 ${
              isActive
                ? "bg-gradient-to-tr from-primary to-primary-container text-white ring-2 ring-primary/30"
                : isUnread
                  ? "bg-gradient-to-tr from-rose-500 to-rose-400 text-white ring-2 ring-rose-300 dark:ring-rose-900/50"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700"
            }">
              ${hasAvatar
                ? `<img src="${escape(pAvt)}" class="w-full h-full object-cover rounded-full" alt="${escape(f.display_name)}" />`
                : `<span class="font-extrabold tracking-wide">${escape(initials)}</span>`}
            </div>
            <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 shadow-xs ${
              isOnline
                ? "bg-emerald-500 ring-1 ring-emerald-500/20"
                : "bg-slate-400 dark:bg-slate-500"
            }" title="${isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}"></span>
          </div>

          <!-- Main Text Info -->
          <div class="flex flex-col min-w-0 flex-1 py-0.5">
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="partner-name text-[13px] font-bold tracking-tight truncate transition-colors ${
                isActive
                  ? "text-primary dark:text-primary-fixed"
                  : isUnread
                    ? "text-slate-900 dark:text-white font-extrabold"
                    : "text-slate-900 dark:text-slate-100 group-hover:text-primary"
              }">
                ${escape(f.display_name)}
              </span>
              <span class="text-[10px] font-medium font-mono shrink-0 ${
                isUnread ? "text-rose-500 font-bold" : "text-slate-400 dark:text-slate-500"
              }">
                ${escape(safeTime)}
              </span>
            </div>

            <div class="flex items-center justify-between gap-2">
              <p class="last-msg-text text-[12px] truncate leading-tight transition-colors ${
                isActive
                  ? "text-primary/80 dark:text-primary-fixed/80 font-medium"
                  : isUnread
                    ? "text-rose-600 dark:text-rose-400 font-semibold"
                    : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300"
              }">
                ${safeLastText}
              </p>
              ${unreadBadgeHTML}
            </div>
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
