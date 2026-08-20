/**
 * Profile Controller for Sign_Speak User Profile, User ID Name (@username), Avatar & Account Management
 */

document.addEventListener("DOMContentLoaded", async () => {
  const profileForm = document.getElementById("profileForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const userAvatarWrapper = document.getElementById("userAvatarWrapper");
  const userAvatarInitial = document.getElementById("userAvatarInitial");
  const avatarFileInput = document.getElementById("avatarFileInput");
  const profileDisplayName = document.getElementById("profileDisplayName");
  const profileUsernameDisplay = document.getElementById(
    "profileUsernameDisplay",
  );
  const profileEmailDisplay = document.getElementById("profileEmailDisplay");
  const profileRoleBadge = document.getElementById("profileRoleBadge");
  const fullNameInput = document.getElementById("fullNameInput");
  const usernameInput = document.getElementById("usernameInput");
  const usernameFormattedPreview = document.getElementById(
    "usernameFormattedPreview",
  );
  const usernameCooldownNotice = document.getElementById(
    "usernameCooldownNotice",
  );
  const emailInput = document.getElementById("emailInput");
  const phoneInput = document.getElementById("phoneInput");
  const roleSelect = document.getElementById("roleSelect");
  const saveMsg = document.getElementById("saveMsg");

  // Load saved user info
  let currentUser = null;
  if (window.supabaseService) {
    currentUser = await window.supabaseService.getCurrentUser();
  }

  let userEmail =
    (currentUser && currentUser.email) ||
    localStorage.getItem("user_email") ||
    "nguyen.an@signspeak.com";
  let userName =
    (currentUser &&
      currentUser.user_metadata &&
      currentUser.user_metadata.display_name) ||
    localStorage.getItem("user_full_name") ||
    "Nguyễn Văn An";
  let userRole =
    (currentUser &&
      currentUser.user_metadata &&
      currentUser.user_metadata.role) ||
    localStorage.getItem("user_role") ||
    "deaf";
  let userIdName =
    (currentUser &&
      currentUser.user_metadata &&
      currentUser.user_metadata.username) ||
    localStorage.getItem("user_id_name") ||
    window.supabaseService.generateRandomIdName();
  let userPhone =
    (currentUser &&
      (currentUser.phone ||
        (currentUser.user_metadata && currentUser.user_metadata.phone))) ||
    localStorage.getItem("user_phone") ||
    "";

  // Save ID Name if not present
  localStorage.setItem("user_id_name", userIdName);

  // Pre-fill user data
  if (fullNameInput) fullNameInput.value = userName;
  if (emailInput) emailInput.value = userEmail;
  if (phoneInput) phoneInput.value = userPhone;
  if (roleSelect) roleSelect.value = userRole;

  // Pre-fill username input & Live Badge Preview
  if (usernameInput) {
    const cleanUsername = userIdName.startsWith("@")
      ? userIdName.substring(1)
      : userIdName;
    usernameInput.value = cleanUsername;
    if (usernameFormattedPreview) {
      usernameFormattedPreview.innerText = `@${cleanUsername}`;
    }
  }

  updateProfileBadgeUI(userName, userEmail, userRole, userIdName);
  checkCooldownStatus();

  function updateProfileBadgeUI(name, email, role, idName) {
    const formattedId = idName.startsWith("@") ? idName : `@${idName}`;
    if (profileDisplayName) profileDisplayName.innerText = name;
    if (profileEmailDisplay) profileEmailDisplay.innerText = email;
    if (profileUsernameDisplay) profileUsernameDisplay.innerText = formattedId;
    if (usernameFormattedPreview)
      usernameFormattedPreview.innerText = formattedId;

    const nameParts = name.trim().split(" ");
    const initials =
      nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();

    const avatarUrl = (currentUser && (currentUser.avatar_url || (currentUser.user_metadata && currentUser.user_metadata.avatar_url))) || localStorage.getItem("user_avatar_url");
    if (userAvatarInitial) {
      if (avatarUrl && (avatarUrl.startsWith("http") || avatarUrl.startsWith("data:image") || avatarUrl.includes("/"))) {
        userAvatarInitial.innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full" alt="Avatar" />`;
        userAvatarInitial.classList.add("overflow-hidden");
      } else {
        userAvatarInitial.innerText = initials || "NA";
      }
    }

    if (profileRoleBadge) {
      if (role === "deaf") {
        profileRoleBadge.innerHTML = `<span class="px-3.5 py-1.5 rounded-full bg-white/20 text-white border border-white/40 font-bold text-xs backdrop-blur-md shadow-sm">Người Khiếm Thính</span>`;
      } else {
        profileRoleBadge.innerHTML = `<span class="px-3.5 py-1.5 rounded-full bg-amber-400/30 text-white border border-amber-200/50 font-bold text-xs backdrop-blur-md shadow-sm">Người Nghe Nói</span>`;
      }
    }
  }

  function checkCooldownStatus() {
    const lastChangedStr = localStorage.getItem("last_username_changed_at");
    if (usernameCooldownNotice && lastChangedStr) {
      const lastChangedDate = new Date(lastChangedStr);
      const now = new Date();
      const diffTime = Math.abs(now - lastChangedDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 14) {
        const remainingDays = 14 - diffDays;
        usernameCooldownNotice.innerHTML = `⚠️ ID Name được bảo lưu. Bạn có thể đổi lại sau <strong class="text-amber-700">${remainingDays} ngày</strong> nữa.`;
        usernameCooldownNotice.className =
          "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium";
      } else {
        usernameCooldownNotice.innerHTML = `✅ Bạn có thể cập nhật ID Name mới (Hạn chế 14 ngày/lần).`;
        usernameCooldownNotice.className =
          "p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium";
      }
    }
  }

  // Live Avatar Image Selection & Compression Handler
  const avatarClickTarget = userAvatarWrapper || userAvatarInitial;
  if (avatarClickTarget && avatarFileInput) {
    avatarClickTarget.addEventListener("click", () => {
      avatarFileInput.click();
    });
  }

  if (avatarFileInput) {
    avatarFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        alert("Vui lòng chọn một file hình ảnh hợp lệ (PNG, JPG, WEBP)!");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          // Compress image via Canvas to 256x256 max
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          const maxDim = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

          // 1. Update userAvatarInitial UI
          if (userAvatarInitial) {
            userAvatarInitial.innerHTML = `<img src="${compressedDataUrl}" class="w-full h-full object-cover rounded-full" alt="Avatar" />`;
            userAvatarInitial.classList.add("overflow-hidden");
          }

          // 2. Save avatar to Supabase & localStorage
          if (window.supabaseService && typeof window.supabaseService.updateUserProfileAvatar === "function") {
            await window.supabaseService.updateUserProfileAvatar(compressedDataUrl);
          } else {
            localStorage.setItem("user_avatar_url", compressedDataUrl);
          }

          // 3. Update sidebarUserAvatar live across all elements
          if (window.securityGuard && typeof window.securityGuard.loadSidebarUserProfile === "function") {
            window.securityGuard.loadSidebarUserProfile();
          }

          // Show Toast feedback
          const toast = document.createElement("div");
          toast.className = "fixed bottom-6 right-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 px-5 py-3 rounded-2xl shadow-xl z-50 text-xs font-bold flex items-center gap-2 animate-bounce";
          toast.innerHTML = `<span class="material-symbols-outlined text-emerald-500 dark:text-emerald-400 text-sm">check_circle</span> Đã thay đổi ảnh đại diện thành công!`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3500);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Live Username Input Formatting & Preview
  if (usernameInput) {
    usernameInput.addEventListener("input", (e) => {
      let rawVal = e.target.value;
      if (rawVal.startsWith("@")) rawVal = rawVal.substring(1);
      rawVal = rawVal.replace(/[^a-zA-Z0-9_-]/g, "");
      if (rawVal.length > 15) rawVal = rawVal.substring(0, 15);
      e.target.value = rawVal;

      if (usernameFormattedPreview) {
        usernameFormattedPreview.innerText = rawVal ? `@${rawVal}` : "@...";
      }
    });
  }

  // Save Profile Changes Handler
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const updatedName = fullNameInput.value.trim();
      const updatedPhone = phoneInput.value.trim();
      const updatedRole = roleSelect.value;
      const updatedUsernameRaw = usernameInput
        ? usernameInput.value.trim()
        : "";

      const formattedTarget = updatedUsernameRaw.startsWith("@")
        ? updatedUsernameRaw
        : `@${updatedUsernameRaw}`;

      localStorage.setItem("user_full_name", updatedName);
      localStorage.setItem("user_display_name", updatedName);
      localStorage.setItem("user_phone", updatedPhone);
      localStorage.setItem("user_role", updatedRole);
      localStorage.setItem("user_id_name", formattedTarget);

      updateProfileBadgeUI(
        updatedName,
        userEmail,
        updatedRole,
        formattedTarget,
      );
      if (
        window.securityGuard &&
        typeof window.securityGuard.loadSidebarUserProfile === "function"
      ) {
        window.securityGuard.loadSidebarUserProfile();
      }
      checkCooldownStatus();

      if (saveMsg) {
        saveMsg.classList.remove("hidden");
        saveMsg.className =
          "p-3 rounded-2xl font-bold text-center text-xs bg-emerald-100 text-emerald-700 border border-emerald-300";
        saveMsg.innerText = `✅ Đã cập nhật thành công hồ sơ và ID Name: ${formattedTarget}!`;
        setTimeout(() => {
          saveMsg.classList.add("hidden");
        }, 4000);
      }
    });
  }

  // Modern Custom Logout Confirmation Modal Helper
  function showLogoutConfirmationModal(onConfirm) {
    const existing = document.getElementById("logoutConfirmationModal");
    if (existing) existing.remove();

    const modalHtml = `
      <div id="logoutConfirmationModal" class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
        <div class="relative w-full max-w-sm bg-white dark:bg-[#151e32] rounded-3xl p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800 text-center space-y-5 transform transition-all duration-200 animate-in zoom-in-95">
          
          <!-- Icon Header Badge with Glowing Ring -->
          <div class="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto ring-8 ring-rose-500/10 dark:ring-rose-500/5 shadow-inner">
            <span class="material-symbols-outlined text-[32px]">logout</span>
          </div>

          <!-- Text Header & Details -->
          <div class="space-y-1.5">
            <h3 class="text-base font-bold text-slate-900 dark:text-white">Xác nhận đăng xuất</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-2">
              Bạn có chắc chắn muốn đăng xuất khỏi tài khoản <strong>Sign Speak</strong> không? Mọi dữ liệu phiên làm việc sẽ được lưu an toàn.
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center gap-3 pt-1">
            <button
              id="cancelLogoutModalBtn"
              type="button"
              class="flex-1 py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              id="confirmLogoutModalBtn"
              type="button"
              class="flex-1 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-600/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span class="material-symbols-outlined text-[18px]">logout</span>
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    const modal = document.getElementById("logoutConfirmationModal");
    const cancelBtn = document.getElementById("cancelLogoutModalBtn");
    const confirmBtn = document.getElementById("confirmLogoutModalBtn");

    const closeModal = () => {
      if (modal) modal.remove();
    };

    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span><span>Đang đăng xuất...</span>`;
        if (typeof onConfirm === "function") {
          await onConfirm();
        }
      });
    }
  }

  // Log Out Handler
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      showLogoutConfirmationModal(async () => {
        if (window.supabaseService) {
          await window.supabaseService.signOut();
        }
        window.location.href = "login.html";
      });
    });
  }
});
