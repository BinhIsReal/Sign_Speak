/**
 * Profile Controller for Sign_Speak User Profile, User ID Name (@username) & Account Management
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profileForm = document.getElementById('profileForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const userAvatarInitial = document.getElementById('userAvatarInitial');
  const profileDisplayName = document.getElementById('profileDisplayName');
  const profileUsernameDisplay = document.getElementById('profileUsernameDisplay');
  const profileEmailDisplay = document.getElementById('profileEmailDisplay');
  const profileRoleBadge = document.getElementById('profileRoleBadge');
  const fullNameInput = document.getElementById('fullNameInput');
  const usernameInput = document.getElementById('usernameInput');
  const usernameFormattedPreview = document.getElementById('usernameFormattedPreview');
  const usernameCooldownNotice = document.getElementById('usernameCooldownNotice');
  const emailInput = document.getElementById('emailInput');
  const phoneInput = document.getElementById('phoneInput');
  const roleSelect = document.getElementById('roleSelect');
  const saveMsg = document.getElementById('saveMsg');

  // Load saved user info
  let currentUser = null;
  if (window.supabaseService) {
    currentUser = await window.supabaseService.getCurrentUser();
  }

  let userEmail = (currentUser && currentUser.email) || localStorage.getItem('user_email') || 'nguyen.an@signspeak.com';
  let userName = (currentUser && currentUser.user_metadata && currentUser.user_metadata.display_name) || localStorage.getItem('user_full_name') || 'Nguyễn Văn An';
  let userRole = (currentUser && currentUser.user_metadata && currentUser.user_metadata.role) || localStorage.getItem('user_role') || 'deaf';
  let userIdName = (currentUser && currentUser.user_metadata && currentUser.user_metadata.username) || localStorage.getItem('user_id_name') || window.supabaseService.generateRandomIdName();
  let userPhone = (currentUser && (currentUser.phone || (currentUser.user_metadata && currentUser.user_metadata.phone))) || localStorage.getItem('user_phone') || '';

  // Save ID Name if not present
  localStorage.setItem('user_id_name', userIdName);

  // Pre-fill user data
  if (fullNameInput) fullNameInput.value = userName;
  if (emailInput) emailInput.value = userEmail;
  if (phoneInput) phoneInput.value = userPhone;
  if (roleSelect) roleSelect.value = userRole;

  // Pre-fill username input & Live Badge Preview
  if (usernameInput) {
    const cleanUsername = userIdName.startsWith('@') ? userIdName.substring(1) : userIdName;
    usernameInput.value = cleanUsername;
    if (usernameFormattedPreview) {
      usernameFormattedPreview.innerText = `@${cleanUsername}`;
    }
  }

  updateProfileBadgeUI(userName, userEmail, userRole, userIdName);
  checkCooldownStatus();

  function updateProfileBadgeUI(name, email, role, idName) {
    const formattedId = idName.startsWith('@') ? idName : `@${idName}`;
    if (profileDisplayName) profileDisplayName.innerText = name;
    if (profileEmailDisplay) profileEmailDisplay.innerText = email;
    if (profileUsernameDisplay) profileUsernameDisplay.innerText = formattedId;
    if (usernameFormattedPreview) usernameFormattedPreview.innerText = formattedId;

    const nameParts = name.trim().split(' ');
    const initials = nameParts.length >= 2 
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();

    if (userAvatarInitial) userAvatarInitial.innerText = initials || 'NA';

    if (profileRoleBadge) {
      if (role === 'deaf') {
        profileRoleBadge.innerHTML = `<span class="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold text-xs">Người Khiếm Thính (VSL)</span>`;
      } else {
        profileRoleBadge.innerHTML = `<span class="px-3 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20 font-bold text-xs">🗣️ Người Nghe Nói</span>`;
      }
    }
  }

  function checkCooldownStatus() {
    const lastChangedStr = localStorage.getItem('last_username_changed_at');
    if (usernameCooldownNotice && lastChangedStr) {
      const lastChangedDate = new Date(lastChangedStr);
      const now = new Date();
      const diffTime = Math.abs(now - lastChangedDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 14) {
        const remainingDays = 14 - diffDays;
        usernameCooldownNotice.innerHTML = `⚠️ ID Name được bảo lưu. Bạn có thể đổi lại sau <strong class="text-amber-700">${remainingDays} ngày</strong> nữa.`;
        usernameCooldownNotice.className = "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium";
      } else {
        usernameCooldownNotice.innerHTML = `✅ Bạn có thể cập nhật ID Name mới (Hạn chế 14 ngày/lần).`;
        usernameCooldownNotice.className = "p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium";
      }
    }
  }

  // Live Username Input Formatting & Preview
  if (usernameInput) {
    usernameInput.addEventListener('input', (e) => {
      let rawVal = e.target.value;
      if (rawVal.startsWith('@')) rawVal = rawVal.substring(1);
      // Clean invalid characters
      rawVal = rawVal.replace(/[^a-zA-Z0-9_-]/g, '');
      if (rawVal.length > 15) rawVal = rawVal.substring(0, 15);
      e.target.value = rawVal;

      if (usernameFormattedPreview) {
        usernameFormattedPreview.innerText = rawVal ? `@${rawVal}` : '@...';
      }
    });
  }

  // Save Profile Changes Handler
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updatedName = fullNameInput.value.trim();
      const updatedPhone = phoneInput.value.trim();
      const updatedRole = roleSelect.value;
      const updatedUsernameRaw = usernameInput ? usernameInput.value.trim() : '';

      const userId = currentUser ? currentUser.id : 'demo_user_123';
      const formattedTarget = updatedUsernameRaw.startsWith('@') ? updatedUsernameRaw : `@${updatedUsernameRaw}`;

      localStorage.setItem('user_full_name', updatedName);
      localStorage.setItem('user_display_name', updatedName);
      localStorage.setItem('user_phone', updatedPhone);
      localStorage.setItem('user_role', updatedRole);
      localStorage.setItem('user_id_name', formattedTarget);

      updateProfileBadgeUI(updatedName, userEmail, updatedRole, formattedTarget);
      if (window.securityGuard && typeof window.securityGuard.loadSidebarUserProfile === 'function') {
        window.securityGuard.loadSidebarUserProfile();
      }
      checkCooldownStatus();

      if (saveMsg) {
        saveMsg.classList.remove('hidden');
        saveMsg.className = "p-3 rounded-2xl font-bold text-center text-xs bg-emerald-100 text-emerald-700 border border-emerald-300";
        saveMsg.innerText = `✅ Đã cập nhật thành công hồ sơ và ID Name: ${formattedTarget}!`;
        setTimeout(() => {
          saveMsg.classList.add('hidden');
        }, 4000);
      }
    });
  }

  // Log Out Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi tài khoản Sign Speak không?")) {
        if (window.supabaseService) {
          await window.supabaseService.signOut();
        }
        window.location.href = 'login.html';
      }
    });
  }
});
