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

  function setPartnerDetails(partner) {
    if (!partner) return;
    activePartner = partner;
    activeRoomId = window.supabaseService.getCanonicalRoomId(
      currentUserId,
      partner.id,
    );

    window.supabaseService.markMessagesAsRead(activeRoomId, currentUserId);

    if (activeChatAvatar)
      activeChatAvatar.innerText = escape(partner.avatar || "US");
    if (activeChatName)
      activeChatName.innerText = escape(
        partner.display_name || "Người dùng VSL",
      );
    if (activeChatSub) {
      activeChatSub.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>${escape(partner.username || "@user")} • ${partner.role === "deaf" ? "Người Khiếm Thính (VSL)" : "🗣️ Người Nghe Nói"}</span>
      `;
    }

    if (activeVideoCallLink) {
      activeVideoCallLink.href = `call.html?room=${encodeURIComponent(activeRoomId)}&partner=${encodeURIComponent(partner.display_name)}`;
    }

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

  // Subscribe to user's personal message channel for background notifications
  if (currentUserId && currentUserId !== "usr_anon") {
    window.supabaseService.subscribeUserMessageNotifications(currentUserId, (incomingMsg) => {
      if (incomingMsg.sender_id !== currentUserId) {
        if (activePartner && incomingMsg.sender_id === activePartner.id) {
          window.supabaseService.markMessagesAsRead(activeRoomId, currentUserId);
          appendMessageToUI(incomingMsg);
        }
      }
      loadConversationsList(conversationsSearchInput ? conversationsSearchInput.value : "");
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
      return `
        <div data-msg-id="${safeId}" class="flex items-start gap-2.5 mb-3">
          <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
            ${escape(activePartner ? activePartner.avatar : "US")}
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
    window.supabaseService.seedDefaultUnreadMessages(currentUserId, friends);

    // Auto select partner from URL or first friend
    if (!activePartner) {
      if (chatWithTarget) {
        const target = friends.find(
          (u) => u.id === chatWithTarget || u.username === chatWithTarget,
        );
        if (target) {
          setPartnerDetails(target);
        } else {
          setPartnerDetails(friends[0]);
        }
      } else {
        setPartnerDetails(friends[0]);
      }
    }

    conversationsList.innerHTML = friends
      .map((f) => {
        const isActive = activePartner && activePartner.id === f.id;
        const canonicalRoomId = window.supabaseService.getCanonicalRoomId(
          currentUserId,
          f.id,
        );
        const unreadCount = window.supabaseService.getUnreadMessagesCountForRoom(
          canonicalRoomId,
          currentUserId,
        );
        const history = window.supabaseService.getChatHistory(canonicalRoomId);
        const lastMsg = history.length > 0 ? history[history.length - 1] : null;

        const rawLastText = lastMsg
          ? lastMsg.text
          : f.role === "deaf"
            ? "Sẵn sàng trò chuyện VSL"
            : "Sẵn sàng trò chuyện STT";
        const safeLastText = escape(
          rawLastText.length > 25
            ? rawLastText.substring(0, 25) + "..."
            : rawLastText,
        );
        const safeTime = escape(
          lastMsg ? lastMsg.timestamp || "Mới" : "Trực tuyến",
        );

        const unreadBadgeHTML = unreadCount > 0
          ? `<span class="nav-badge ml-2 shrink-0">${unreadCount > 99 ? '99+' : unreadCount}</span>`
          : ``;

        return `
        <div data-partner-id="${escape(f.id)}" class="flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all ${
          isActive
            ? "bg-primary/10 border-l-4 border-primary shadow-sm font-bold"
            : "hover:bg-slate-100/70 border-l-4 border-transparent"
        }">
          <div class="flex items-center gap-3.5 min-w-0 flex-1">
            <div class="relative shrink-0">
              <div class="w-11 h-11 rounded-full ${isActive ? "bg-primary text-white" : "bg-slate-200 text-slate-700"} font-bold text-sm flex items-center justify-center shadow-sm">
                ${escape(f.avatar || "US")}
              </div>
              <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"></span>
            </div>
            <div class="flex-grow min-w-0 pr-1">
              <div class="flex justify-between items-baseline mb-0.5">
                <span class="text-xs font-bold ${isActive ? "text-primary" : "text-slate-900"} truncate">${escape(f.display_name)}</span>
                <span class="text-[10px] text-slate-400 font-normal ml-1 shrink-0">${safeTime}</span>
              </div>
              <p class="text-[11px] ${isActive ? "text-primary font-semibold" : "text-slate-500"} truncate">${safeLastText}</p>
            </div>
          </div>
          ${unreadBadgeHTML}
        </div>
      `;
      })
      .join("");

    window.supabaseService.updateSidebarBadges();

    conversationsList.querySelectorAll("[data-partner-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const partnerId = card.getAttribute("data-partner-id");
        const targetPartner = friends.find((f) => f.id === partnerId);
        if (targetPartner) {
          setPartnerDetails(targetPartner);
          loadConversationsList(
            conversationsSearchInput ? conversationsSearchInput.value : "",
          );
        }
      });
    });
  }

  // 2. Send Message Handler
  if (chatForm && chatMessageInput) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawText = chatMessageInput.value;
      const cleanText = sanitize(rawText);

      if (!cleanText || !activePartner) return;

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const msgId = window.supabaseService.generateUUID();

      const msgObj = {
        id: msgId,
        room_id: activeRoomId,
        sender_id: currentUserId,
        recipient_id: activePartner.id,
        sender_name: currentUserName,
        text: cleanText,
        timestamp: timeStr,
        read: true
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

  await loadConversationsList();
});
