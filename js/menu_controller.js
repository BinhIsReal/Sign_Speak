/**
 * Menu Controller for Sign_Speak (menu.html)
 * Loads user profile info into Stitch Mobile Account Menu Hub,
 * manages theme toggling, and provides clean account logout functionality.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const menuUserAvatar = document.getElementById("menuUserAvatar");
  const menuUserName = document.getElementById("menuUserName");
  const menuUserEmail = document.getElementById("menuUserEmail");
  const menuLightThemeBtn = document.getElementById("menuLightThemeBtn");
  const menuDarkThemeBtn = document.getElementById("menuDarkThemeBtn");
  const menuLogoutBtn = document.getElementById("menuLogoutBtn");

  const escape = window.securityGuard
    ? window.securityGuard.escapeHTML.bind(window.securityGuard)
    : (s) => s;

  // Load User Data
  if (window.supabaseService) {
    const user = await window.supabaseService.getCurrentUser();
    if (user) {
      const name = user.user_metadata?.display_name || user.email?.split("@")[0] || "Người dùng Sign Speak";
      const email = user.email || "@user";
      const avatarUrl = user.user_metadata?.avatar_url || localStorage.getItem("user_avatar_url");

      if (menuUserName) menuUserName.innerText = name;
      if (menuUserEmail) menuUserEmail.innerText = email;

      if (menuUserAvatar) {
        if (avatarUrl && (avatarUrl.startsWith("http") || avatarUrl.startsWith("data:image") || avatarUrl.includes("/"))) {
          menuUserAvatar.innerHTML = `<img src="${escape(avatarUrl)}" class="w-full h-full object-cover rounded-full" alt="${escape(name)}" />`;
          menuUserAvatar.classList.add("overflow-hidden");
        } else {
          const initials = name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() || "US";
          menuUserAvatar.innerText = initials;
        }
      }
    }
  }

  // Handle Theme Toggle Buttons
  const updateThemeUI = (isDark) => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("app_theme", "dark");
      if (menuDarkThemeBtn) {
        menuDarkThemeBtn.className = "w-8 h-8 rounded-full flex items-center justify-center bg-primary text-white shadow-sm transition-all";
      }
      if (menuLightThemeBtn) {
        menuLightThemeBtn.className = "w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 transition-all hover:text-primary";
      }
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("app_theme", "light");
      if (menuLightThemeBtn) {
        menuLightThemeBtn.className = "w-8 h-8 rounded-full flex items-center justify-center bg-primary text-white shadow-sm transition-all";
      }
      if (menuDarkThemeBtn) {
        menuDarkThemeBtn.className = "w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 transition-all hover:text-primary";
      }
    }
  };

  const isCurrentDark = document.documentElement.classList.contains("dark") || localStorage.getItem("app_theme") === "dark";
  updateThemeUI(isCurrentDark);

  if (menuLightThemeBtn) {
    menuLightThemeBtn.addEventListener("click", () => updateThemeUI(false));
  }
  if (menuDarkThemeBtn) {
    menuDarkThemeBtn.addEventListener("click", () => updateThemeUI(true));
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

  // Handle Logout Button
  if (menuLogoutBtn) {
    menuLogoutBtn.addEventListener("click", () => {
      showLogoutConfirmationModal(async () => {
        if (window.supabaseService && typeof window.supabaseService.logout === "function") {
          await window.supabaseService.logout();
        } else if (window.supabaseService && typeof window.supabaseService.signOut === "function") {
          await window.supabaseService.signOut();
        } else {
          localStorage.removeItem("sb_session");
          window.location.href = "login.html";
        }
      });
    });
  }
});
