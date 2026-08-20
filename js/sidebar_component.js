/**
 * Shared Sidebar Component for Sign_Speak
 * Dynamically renders the Desktop Left Sidebar and Mobile Bottom Navigation across all pages.
 * Handles Active State Navigation, Badges, and "Soạn tin mới" (New Chat Modal) feature.
 */

function renderAppSidebar() {
  const currentPath = window.location.pathname.toLowerCase();

  const isMessagesActive =
    currentPath.endsWith("index.html") ||
    currentPath.endsWith("/") ||
    currentPath.includes("chat");
  const isContactsActive = currentPath.includes("contacts.html");
  const isSettingsActive = currentPath.includes("settings.html");
  const isProfileActive = currentPath.includes("profile.html");
  const isMenuActive = currentPath.includes("menu.html");

  const navItems = [
    {
      name: "Tin nhắn",
      href: "index.html",
      icon: "chat",
      active: isMessagesActive,
      badgeId: "sidebarMessagesBadgeDesktop",
    },
    {
      name: "Danh bạ",
      href: "contacts.html",
      icon: "groups",
      active: isContactsActive,
      badgeId: "sidebarContactsBadgeDesktop",
    },
    {
      name: "Cài đặt",
      href: "settings.html",
      icon: "settings",
      active: isSettingsActive,
    },
    {
      name: "Tài khoản",
      href: "profile.html",
      icon: "account_circle",
      active: isProfileActive,
    },
  ];

  const mainLinksHtml = navItems
    .map((item) => {
      const activeClass = item.active
        ? "bg-primary/10 text-primary font-bold shadow-sm"
        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary transition-all font-semibold";
      const iconFillStyle = item.active
        ? 'style="font-variation-settings: \'FILL\' 1"'
        : "";

      return `
      <a href="${item.href}" class="flex items-center gap-3.5 px-4 py-3 rounded-2xl ${activeClass} transition-all duration-200 relative group">
        <span class="material-symbols-outlined text-[22px]" data-icon="${item.icon}" ${iconFillStyle}>${item.icon}</span>
        <span class="text-sm font-medium tracking-tight truncate">${item.name}</span>
        ${
          item.badgeId
            ? `<span id="${item.badgeId}" class="nav-badge hidden">0</span>`
            : ""
        }
      </a>
    `;
    })
    .join("");

  // Full Container Markup: Desktop Sidebar (#leftSidebarNav) + Mobile Bottom Bar (#mobileBottomNav) + New Chat Modal
  const fullNavigationHtml = `
    <!-- Desktop Left Navigation Sidebar (>= 768px) -->
    <nav class="hidden md:flex fixed left-0 top-0 bottom-0 flex-col z-40 h-screen w-64 flex-shrink-0 bg-white dark:bg-[#151e32] border-r border-slate-200/80 dark:border-slate-800 messenger-shadow" id="leftSidebarNav">
      <!-- Top Brand & Status -->
      <div class="p-6 flex items-center justify-between">
        <div class="sidebar-text-group flex flex-col gap-1">
          <a href="index.html" class="text-2xl font-bold text-primary tracking-tight">Sign Speak</a>
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2.5 h-2.5 rounded-full bg-[#31a24c]"></span>
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Đang hoạt động</p>
          </div>
        </div>
        <button id="toggleSidebarCollapseBtn" class="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center cursor-pointer shrink-0" title="Thu gọn / Mở rộng Sidebar">
          <span class="material-symbols-outlined text-[22px]" id="sidebarCollapseIcon">menu_open</span>
        </button>
      </div>

      <!-- Main Menu Links -->
      <div class="mt-2 px-4 flex flex-col gap-1.5 flex-grow">
        ${mainLinksHtml}

        <!-- Floating Action Button: Soạn tin mới (Mở Modal chọn bạn) -->
        <button id="sidebarNewChatBtn" type="button" class="mt-6 mx-1 flex items-center justify-center gap-2 bg-primary text-white rounded-full py-3.5 px-4 shadow-lg shadow-primary/25 active:scale-95 duration-200 hover:brightness-110 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">edit_square</span>
          <span class="text-sm font-bold tracking-wide">Soạn tin mới</span>
        </button>
      </div>

      <!-- Bottom Fixed Section -->
      <div class="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
        <a href="gesture_collector.html" class="flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary transition-all text-xs font-semibold">
          <span class="material-symbols-outlined text-[20px]" data-icon="help_outline">help_outline</span>
          <span>Trợ giúp & Thu thập</span>
        </a>

        <!-- User Profile Link at Bottom -->
        <a id="sidebarProfileLink" href="profile.html" class="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
          <div id="sidebarUserAvatar" class="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 border border-primary/20 text-sm">
            --
          </div>
          <div class="flex flex-col min-w-0">
            <span id="sidebarUserName" class="text-xs font-bold text-slate-900 dark:text-white truncate">Đang tải...</span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 truncate">Tài khoản cá nhân</span>
          </div>
        </a>
      </div>
    </nav>

    <!-- Stitch Mobile 3-Item Bottom Navigation Bar (<= 768px) -->
    <nav id="mobileBottomNav" class="md:hidden fixed bottom-0 left-0 right-0 w-full z-50 bg-white/95 dark:bg-[#151e32]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 flex justify-around items-center h-16 px-3 shadow-lg">
      <!-- 1. Tin nhắn (Messages) -->
      <a href="index.html" class="flex flex-col items-center justify-center px-4 py-1 rounded-xl transition-all relative ${isMessagesActive ? 'text-primary font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-primary'}">
        <span class="material-symbols-outlined text-[24px]" ${isMessagesActive ? 'style="font-variation-settings: \'FILL\' 1"' : ''}>chat</span>
        <span class="text-[10px] mt-0.5 ${isMessagesActive ? 'font-bold' : 'font-medium'}">Tin nhắn</span>
        <span id="sidebarMessagesBadge" class="nav-badge hidden">0</span>
      </a>

      <!-- 2. Danh bạ (Contacts) -->
      <a href="contacts.html" class="flex flex-col items-center justify-center px-4 py-1 rounded-xl transition-all relative ${isContactsActive ? 'text-primary font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-primary'}">
        <span class="material-symbols-outlined text-[24px]" ${isContactsActive ? 'style="font-variation-settings: \'FILL\' 1"' : ''}>groups</span>
        <span class="text-[10px] mt-0.5 ${isContactsActive ? 'font-bold' : 'font-medium'}">Danh bạ</span>
        <span id="sidebarContactsBadge" class="nav-badge hidden">0</span>
      </a>

      <!-- 3. Menu (Merged Profile & Settings on Mobile) -->
      <a href="menu.html" class="flex flex-col items-center justify-center px-4 py-1 rounded-xl transition-all relative ${isMenuActive ? 'text-primary font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-primary'}">
        <span class="material-symbols-outlined text-[24px]" ${isMenuActive ? 'style="font-variation-settings: \'FILL\' 1"' : ''}>menu</span>
        <span class="text-[10px] mt-0.5 ${isMenuActive ? 'font-bold' : 'font-medium'}">Menu</span>
      </a>
    </nav>

    <!-- Modal Soạn tin nhắn mới (New Chat Modal) -->
    <div id="sidebarNewChatModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div class="bg-white dark:bg-[#151e32] w-full max-w-md rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transform transition-all duration-200">
        <!-- Modal Header -->
        <div class="p-4 px-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <span class="material-symbols-outlined text-[18px]">edit_square</span>
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">Soạn tin nhắn mới</h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Chọn bạn bè để bắt đầu trò chuyện</p>
            </div>
          </div>
          <button id="closeNewChatModalBtn" type="button" class="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Search Input -->
        <div class="p-3 px-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div class="relative flex items-center">
            <span class="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">search</span>
            <input id="newChatSearchInput" type="text" placeholder="Tìm bạn bè theo tên hoặc @username..." class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#151e32] border border-slate-200 dark:border-slate-700 rounded-full text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all" />
          </div>
        </div>

        <!-- Friends List Container -->
        <div id="newChatFriendsList" class="flex-1 overflow-y-auto p-3 px-4 space-y-1.5 min-h-[220px]">
          <div class="py-10 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-2xl animate-spin text-primary">progress_activity</span>
            <span>Đang tải danh sách bạn bè...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Replace existing navigation containers
  const container = document.getElementById("sidebarContainer");
  if (container) {
    container.innerHTML = fullNavigationHtml;
  } else {
    const existingNav = document.getElementById("leftSidebarNav") || document.getElementById("mobileBottomNav");
    if (existingNav) {
      existingNav.outerHTML = fullNavigationHtml;
    } else if (document.body) {
      document.body.insertAdjacentHTML("afterbegin", fullNavigationHtml);
    }
  }

  // Setup New Chat Modal Event Listeners
  setupNewChatModalListeners();

  // Re-initialize sidebar features if securityGuard is available
  if (window.securityGuard) {
    if (typeof window.securityGuard.loadSidebarUserProfile === "function") {
      window.securityGuard.loadSidebarUserProfile();
    }
    if (typeof window.securityGuard.initSidebarCollapse === "function") {
      window.securityGuard.initSidebarCollapse();
    }
  }

  // Update badges if supabaseService is available
  if (
    window.supabaseService &&
    typeof window.supabaseService.updateSidebarBadges === "function"
  ) {
    window.supabaseService.updateSidebarBadges();
  }
}

/**
 * Initializes the New Chat Modal interaction logic
 */
function setupNewChatModalListeners() {
  const newChatBtn = document.getElementById("sidebarNewChatBtn");
  const modal = document.getElementById("sidebarNewChatModal");
  const closeBtn = document.getElementById("closeNewChatModalBtn");
  const searchInput = document.getElementById("newChatSearchInput");
  const friendsList = document.getElementById("newChatFriendsList");

  if (!newChatBtn || !modal) return;

  let cachedFriends = [];

  const escape = window.securityGuard
    ? window.securityGuard.escapeHTML.bind(window.securityGuard)
    : (s) => s;

  const openModal = async () => {
    modal.classList.remove("hidden");
    if (searchInput) {
      searchInput.value = "";
      setTimeout(() => searchInput.focus(), 100);
    }
    await loadFriendsForNewChat();
  };

  const closeModal = () => {
    modal.classList.add("hidden");
  };

  newChatBtn.addEventListener("click", openModal);

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  const loadFriendsForNewChat = async () => {
    if (!friendsList) return;
    if (!window.supabaseService) {
      friendsList.innerHTML = `<div class="py-8 text-center text-slate-400 text-xs">Không thể kết nối máy chủ.</div>`;
      return;
    }

    try {
      const allContacts = await window.supabaseService.searchGlobalUsers("", "friends");
      cachedFriends = (allContacts || []).filter(c => c.friendStatus === "accepted");
      renderFriendsInNewChat(cachedFriends);
    } catch (err) {
      console.warn("[NewChatModal] Lỗi nạp bạn bè:", err);
      friendsList.innerHTML = `<div class="py-8 text-center text-slate-400 text-xs">Lỗi tải danh sách bạn bè.</div>`;
    }
  };

  const renderFriendsInNewChat = (friends) => {
    if (!friendsList) return;

    if (!friends || friends.length === 0) {
      friendsList.innerHTML = `
        <div class="py-10 text-center space-y-2">
          <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <span class="material-symbols-outlined text-[24px]">group_off</span>
          </div>
          <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Không tìm thấy bạn bè</p>
          <p class="text-[11px] text-slate-400">Hãy vào mục "Danh bạ" để kết bạn thêm nhé!</p>
        </div>
      `;
      return;
    }

    friendsList.innerHTML = friends
      .map((f) => {
        const isOnline = window.supabaseService ? window.supabaseService.isUserOnline(f.id) : false;
        const avatarStr = f.avatar_url
          ? `<img src="${escape(f.avatar_url)}" class="w-full h-full object-cover rounded-full" />`
          : escape(f.avatar || (f.display_name ? f.display_name.substring(0, 2).toUpperCase() : "US"));

        return `
        <div data-friend-id="${escape(f.id)}" class="p-2.5 px-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-3 cursor-pointer transition-colors group">
          <div class="flex items-center gap-3 min-w-0">
            <div class="relative">
              <div class="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                ${avatarStr}
              </div>
              <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-[#151e32] ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
            </div>
            <div class="min-w-0">
              <p class="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">${escape(f.display_name)}</p>
              <p class="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">${escape(f.username || '@user')}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <span class="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold group-hover:bg-primary group-hover:text-white transition-all flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">chat</span>
              <span>Nhắn tin</span>
            </span>
          </div>
        </div>
      `;
      })
      .join("");

    friendsList.querySelectorAll("[data-friend-id]").forEach((item) => {
      item.addEventListener("click", () => {
        const friendId = item.getAttribute("data-friend-id");
        closeModal();

        if (typeof window.openChatWithUser === "function") {
          window.openChatWithUser(friendId);
        } else {
          window.location.href = `index.html?chat_with=${encodeURIComponent(friendId)}`;
        }
      });
    });
  };

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderFriendsInNewChat(cachedFriends);
        return;
      }
      const filtered = cachedFriends.filter(
        (f) =>
          (f.display_name && f.display_name.toLowerCase().includes(q)) ||
          (f.username && f.username.toLowerCase().includes(q))
      );
      renderFriendsInNewChat(filtered);
    });
  }
}

// Auto-run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderAppSidebar);
} else {
  renderAppSidebar();
}
