/**
 * Contacts Controller for Sign_Speak
 * Handles Global Search, Friends Tabs, Notification Bell Dropdown, Realtime Friend Requests & Live Toast Messages with XSS Protection.
 * 100% Dynamic Rendering - NO FAKE MOCK DATA.
 */

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const contactsGrid = document.getElementById('contactsGrid');
  const suggestedGrid = document.getElementById('suggestedGrid');
  const onlineStrip = document.getElementById('onlineStrip');
  const tabFriendsBtn = document.getElementById('tabFriendsBtn');
  const tabRequestsBtn = document.getElementById('tabRequestsBtn');
  const requestsCountBadge = document.getElementById('requestsCountBadge');
  const notifBellBtn = document.getElementById('notifBellBtn');
  const notifBadgeCount = document.getElementById('notifBadgeCount');
  const notifDropdown = document.getElementById('notifDropdown');
  const notifDropdownCount = document.getElementById('notifDropdownCount');
  const notifDropdownList = document.getElementById('notifDropdownList');
  const notifToast = document.getElementById('notifToast');

  const escape = window.securityGuard ? window.securityGuard.escapeHTML.bind(window.securityGuard) : (s => s);
  const sanitize = window.securityGuard ? window.securityGuard.sanitizeInput.bind(window.securityGuard) : (s => s);

  let currentTab = 'friends';

  async function updatePendingBadges() {
    const count = await window.supabaseService.getPendingRequestsCount();
    if (requestsCountBadge) {
      if (count > 0) {
        requestsCountBadge.classList.remove('hidden');
        requestsCountBadge.innerText = count;
      } else {
        requestsCountBadge.classList.add('hidden');
      }
    }
    if (notifBadgeCount) {
      if (count > 0) {
        notifBadgeCount.classList.remove('hidden');
        notifBadgeCount.innerText = count;
      } else {
        notifBadgeCount.classList.add('hidden');
      }
    }

    if (notifDropdownCount) {
      notifDropdownCount.innerText = `${count} lời mời mới`;
    }

    window.supabaseService.updateSidebarBadges();
    renderNotificationDropdown();
  }

  async function renderNotificationDropdown() {
    if (!notifDropdownList) return;
    const requests = await window.supabaseService.searchGlobalUsers('', 'requests');
    const incomingRequests = requests.filter(r => r.friendStatus === 'pending_received');

    if (!incomingRequests || incomingRequests.length === 0) {
      notifDropdownList.innerHTML = `
        <div class="py-6 text-center text-slate-400 text-xs font-medium">
          Không có lời mời kết bạn mới nào.
        </div>
      `;
      return;
    }

    notifDropdownList.innerHTML = incomingRequests.map(r => `
      <div class="p-3 bg-slate-50 rounded-2xl border border-slate-200/60 flex items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-slate-900 truncate">${escape(r.display_name)}</p>
          <p class="text-[11px] font-mono font-bold text-primary truncate">${escape(r.username)}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button data-notif-action="accept" data-id="${escape(r.id)}" class="px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm">
            Chấp nhận
          </button>
          <button data-notif-action="unfriend" data-id="${escape(r.id)}" class="px-2 py-1 rounded-full bg-slate-200 hover:bg-rose-100 hover:text-rose-700 text-slate-600 font-bold text-[11px]">
            Hủy
          </button>
        </div>
      </div>
    `).join('');

    notifDropdownList.querySelectorAll('button[data-notif-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.getAttribute('data-notif-action');
        const targetId = e.currentTarget.getAttribute('data-id');

        if (action === 'accept') {
          const res = await window.supabaseService.acceptFriendRequest(targetId);
          showToast(res.message || "🎉 Đã chấp nhận lời mời kết bạn!");
        } else if (action === 'unfriend') {
          const res = await window.supabaseService.removeFriendship(targetId);
          showToast(res.message || "Đã hủy lời mời kết bạn.");
        }
        await loadContacts();
      });
    });
  }

  function showToast(message, type = 'success') {
    if (!notifToast) return;
    notifToast.classList.remove('hidden');
    notifToast.innerText = escape(message);
    if (type === 'success') {
      notifToast.className = "fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900 text-white font-bold text-xs shadow-2xl border border-slate-700 animate-bounce";
    } else {
      notifToast.className = "fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-rose-900 text-white font-bold text-xs shadow-2xl border border-rose-700";
    }
    setTimeout(() => {
      notifToast.classList.add('hidden');
    }, 3500);
  }

  async function loadContacts() {
    const query = searchInput ? sanitize(searchInput.value) : '';
    const filterToUse = query ? 'all' : currentTab;
    const contacts = await window.supabaseService.searchGlobalUsers(query, filterToUse);
    renderContactsList(contacts, query);

    const suggestions = await window.supabaseService.getSuggestedFriends();
    renderSuggestionsList(suggestions);
    renderOnlineStrip(contacts);

    await updatePendingBadges();
  }

  function renderOnlineStrip(allContacts) {
    if (!onlineStrip) return;
    const activeFriends = (allContacts || []).filter(c => c.friendStatus === 'accepted');

    if (!activeFriends || activeFriends.length === 0) {
      onlineStrip.innerHTML = `
        <div class="py-4 text-center text-slate-400 text-xs font-medium w-full">
          Chưa có bạn bè nào trực tuyến. Hãy kết bạn mới ở danh sách bên dưới!
        </div>
      `;
      return;
    }

    onlineStrip.innerHTML = activeFriends.map(c => `
      <a href="index.html?chat_with=${encodeURIComponent(c.id)}" class="flex flex-col items-center gap-2 flex-shrink-0 group cursor-pointer" title="Nhắn tin với ${escape(c.display_name)}">
        <div class="relative">
          <div class="w-14 h-14 rounded-full bg-primary text-white font-bold text-base flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-200 border-2 border-white">
            ${escape(c.avatar || 'US')}
          </div>
          <span class="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-sm"></span>
        </div>
        <span class="text-xs font-semibold text-slate-700 truncate w-20 text-center">${escape(c.display_name)}</span>
      </a>
    `).join('');
  }

  function renderContactsList(contacts, query = '') {
    if (!contactsGrid) return;

    if (!contacts || contacts.length === 0) {
      const isSearchActive = Boolean(query);
      let emptyTitle = 'Bạn chưa có người bạn nào trong danh sách';
      let emptySub = 'Hãy xem danh sách "Gợi ý kết bạn" bên dưới hoặc gõ tên / ID Name (@username) để kết bạn!';

      if (isSearchActive) {
        emptyTitle = `Không tìm thấy người dùng nào khớp với "${escape(query)}"`;
        emptySub = 'Hãy thử nhập chính xác Họ tên hoặc ID Name (ví dụ: user10293 hoặc @user10293).';
      } else if (currentTab === 'requests') {
        emptyTitle = 'Bạn không có lời mời kết bạn nào đang chờ';
        emptySub = 'Các lời mời kết bạn mới gửi tới bạn sẽ xuất hiện tại đây.';
      }

      contactsGrid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400 font-medium bg-white rounded-3xl border border-slate-200/80 p-8 shadow-sm">
          <span class="material-symbols-outlined text-5xl mb-2 text-slate-300 block font-light">
            ${currentTab === 'requests' ? 'mark_email_read' : 'group_off'}
          </span>
          <p class="text-sm font-bold text-slate-800 mb-1">${emptyTitle}</p>
          <p class="text-xs text-slate-500 max-w-md mx-auto">${emptySub}</p>
        </div>
      `;
      return;
    }

    contactsGrid.innerHTML = contacts.map(c => {
      let actionButtons = '';

      if (c.friendStatus === 'accepted') {
        actionButtons = `
          <div class="flex items-center gap-1.5 shrink-0">
            <a href="index.html?chat_with=${encodeURIComponent(c.id)}" class="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-primary hover:text-white dark:hover:bg-primary transition-all" title="Nhắn tin với ${escape(c.display_name)}">
              <span class="material-symbols-outlined text-[18px]">chat</span>
            </a>
            <a href="call.html?room=room_${encodeURIComponent(c.id)}" class="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-container transition-all shadow-md shadow-primary/20" title="Gọi Video VSL">
              <span class="material-symbols-outlined text-[18px]">videocam</span>
            </a>
            <div class="relative">
              <button data-action="toggle-more-menu" data-id="${escape(c.id)}" class="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all cursor-pointer" title="Tùy chọn">
                <span class="material-symbols-outlined text-[20px]">more_vert</span>
              </button>
              <div id="friendMenu_${escape(c.id)}" class="hidden absolute right-0 top-11 z-30 w-44 bg-white dark:bg-[#151e32] border border-slate-200/80 dark:border-slate-700 rounded-2xl p-1.5 shadow-2xl transition-all">
                <button data-action="unfriend" data-id="${escape(c.id)}" class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer">
                  <span class="material-symbols-outlined text-[16px]">person_remove</span>
                  <span>Hủy kết bạn</span>
                </button>
              </div>
            </div>
          </div>
        `;
      } else if (c.friendStatus === 'pending_sent') {
        actionButtons = `
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-bold text-[11px] flex items-center gap-1">
              <span>⏳ Đã gửi lời mời</span>
            </span>
            <button data-action="unfriend" data-id="${escape(c.id)}" class="px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer" title="Hủy lời mời kết bạn">
              <span>✕ Hủy lời mời</span>
            </button>
          </div>
        `;
      } else if (c.friendStatus === 'pending_received') {
        actionButtons = `
          <div class="flex items-center gap-1.5 shrink-0">
            <button data-action="accept" data-id="${escape(c.id)}" class="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-[15px]">check</span>
              <span>Chấp nhận</span>
            </button>
            <button data-action="unfriend" data-id="${escape(c.id)}" class="px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 text-slate-600 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer">
              Từ chối
            </button>
          </div>
        `;
      } else {
        actionButtons = `
          <button data-action="add" data-id="${escape(c.id)}" class="px-4 py-2 rounded-full bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 active:scale-95 transition-all flex items-center gap-1 cursor-pointer">
            <span class="material-symbols-outlined text-[16px]">person_add</span>
            <span>Kết bạn</span>
          </button>
        `;
      }

      return `
        <div class="bg-white dark:bg-[#151e32] p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-4 group hover:shadow-xl hover:border-primary/30 transition-all duration-300">
          <div class="flex items-center gap-3.5 min-w-0 flex-1">
            <div class="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-base flex items-center justify-center shadow-inner shrink-0 group-hover:scale-105 transition-transform border border-primary/20">
              ${escape(c.avatar || 'US')}
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white truncate">${escape(c.display_name)}</h3>
              <p class="text-xs font-mono font-bold text-primary truncate">${escape(c.username)}</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold truncate mt-0.5">${c.role === 'deaf' ? 'Người Khiếm Thính (VSL)' : 'Người Nghe Nói'}</p>
            </div>
          </div>
          ${actionButtons}
        </div>
      `;
    }).join('');

    bindActionButtons(contactsGrid);
  }

  function renderSuggestionsList(suggestions) {
    if (!suggestedGrid) return;
    if (!suggestions || suggestions.length === 0) {
      suggestedGrid.innerHTML = `
        <div class="col-span-full py-6 text-center text-slate-400 text-xs font-medium">
          Không có gợi ý kết bạn mới vào lúc này.
        </div>
      `;
      return;
    }

    suggestedGrid.innerHTML = suggestions.map(s => `
      <div class="bg-white dark:bg-[#151e32] p-4.5 rounded-3xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 hover:shadow-lg hover:border-primary/30 transition-all">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="w-11 h-11 rounded-full bg-secondary/10 text-secondary font-bold text-sm flex items-center justify-center shrink-0 border border-secondary/20">
            ${escape(s.avatar || 'US')}
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate">${escape(s.display_name)}</h4>
            <p class="text-[11px] font-mono font-bold text-primary truncate">${escape(s.username)}</p>
          </div>
        </div>
        ${s.friendStatus === 'pending_sent' ? `
          <div class="flex items-center gap-1.5">
            <span class="px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold text-[11px]">⏳ Đã gửi</span>
            <button data-action="unfriend" data-id="${escape(s.id)}" class="px-2 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer">✕ Hủy</button>
          </div>
        ` : s.friendStatus === 'pending_received' ? `
          <button data-action="accept" data-id="${escape(s.id)}" class="px-3 py-1.5 rounded-full bg-emerald-600 text-white font-bold text-xs shadow-sm cursor-pointer">Chấp nhận</button>
        ` : `
          <button data-action="add" data-id="${escape(s.id)}" class="px-3.5 py-1.5 rounded-full bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 active:scale-95 transition-all flex items-center gap-1 cursor-pointer">
            <span class="material-symbols-outlined text-[15px]">person_add</span>
            <span>Kết bạn</span>
          </button>
        `}
      </div>
    `).join('');

    bindActionButtons(suggestedGrid);
  }

  function bindActionButtons(container) {
    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = e.currentTarget.getAttribute('data-action');
        const targetId = e.currentTarget.getAttribute('data-id');

        if (action === 'toggle-more-menu') {
          const menu = document.getElementById(`friendMenu_${targetId}`);
          if (menu) {
            document.querySelectorAll('[id^="friendMenu_"]').forEach(m => {
              if (m !== menu) m.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
          }
          return;
        }

        if (action === 'add') {
          const res = await window.supabaseService.sendFriendRequest(targetId);
          showToast(res.message || "📩 Đã gửi lời mời kết bạn thành công!");
        } else if (action === 'accept') {
          const res = await window.supabaseService.acceptFriendRequest(targetId);
          showToast(res.message || "🎉 Đã chấp nhận lời mời kết bạn!");
        } else if (action === 'unfriend') {
          const res = await window.supabaseService.removeFriendship(targetId);
          showToast(res.message || "Đã hủy lời mời / kết bạn.");
        }
        await loadContacts();
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[id^="friendMenu_"]') && !e.target.closest('button[data-action="toggle-more-menu"]')) {
      document.querySelectorAll('[id^="friendMenu_"]').forEach(m => m.classList.add('hidden'));
    }
  });

  if (notifBellBtn && notifDropdown) {
    notifBellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!notifDropdown.contains(e.target) && !notifBellBtn.contains(e.target)) {
        notifDropdown.classList.add('hidden');
      }
    });
  }

  function updateTabStyle(activeTab) {
    currentTab = activeTab;
    const activeClass = "text-primary font-bold border-b-2 border-primary pb-1 text-xs cursor-pointer flex items-center gap-1";
    const inactiveClass = "text-slate-500 hover:text-primary transition-colors text-xs font-semibold cursor-pointer flex items-center gap-1";

    if (tabFriendsBtn) tabFriendsBtn.className = activeTab === 'friends' ? activeClass : inactiveClass;
    if (tabRequestsBtn) tabRequestsBtn.className = activeTab === 'requests' ? activeClass : inactiveClass;
  }

  if (tabFriendsBtn) {
    tabFriendsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      updateTabStyle('friends');
      loadContacts();
    });
  }

  if (tabRequestsBtn) {
    tabRequestsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      updateTabStyle('requests');
      loadContacts();
    });
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadContacts();
      }, 200);
    });
  }

  // Live Auto-Polling every 3 seconds for real-time friend requests sync across tabs
  setInterval(() => {
    loadContacts();
  }, 3000);

  loadContacts();
});
