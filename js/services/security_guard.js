/**
 * Global Security Guard Service for Sign_Speak
 * Enforces XSS Prevention, Session Guards, Direct Access Prevention & Privilege Escalation Checks
 */

class SecurityGuardService {
  constructor() {
    this.protectedPages = ['index.html', 'contacts.html', 'settings.html', 'profile.html', 'call.html', 'gesture_collector.html'];
    this.authPages = ['login.html', 'register.html'];
  }

  escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    let clean = input.trim();
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/javascript:/gi, '');
    clean = clean.replace(/on\w+\s*=/gi, '');
    return clean;
  }

  requireAuth() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';
    const userId = localStorage.getItem('user_id');

    if (this.protectedPages.includes(currentPage)) {
      if (!isLoggedIn || !userId) {
        console.warn(`[Security Guard] Access Denied to ${currentPage}. Redirecting to login.html.`);
        this.clearSession();
        window.location.href = 'login.html';
        return false;
      }
    }
    return true;
  }

  redirectIfAuthenticated() {
    const currentPage = window.location.pathname.split('/').pop();
    const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';

    if (this.authPages.includes(currentPage) && isLoggedIn) {
      console.info(`[Security Guard] User is already authenticated. Redirecting to index.html.`);
      window.location.href = 'index.html';
      return true;
    }
    return false;
  }

  clearSession() {
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_full_name');
    localStorage.removeItem('user_display_name');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_id_name');
    localStorage.removeItem('user_phone');
    localStorage.removeItem('user_dob');
    localStorage.removeItem('last_username_changed_at');
    localStorage.removeItem('is_logged_in');
  }

  validateOwnership(targetUserId) {
    const currentUserId = localStorage.getItem('user_id');
    if (!currentUserId || (targetUserId && currentUserId !== targetUserId)) {
      console.error(`[Security Guard] Authorization Error: User ${currentUserId} attempted to modify resource owned by ${targetUserId}.`);
      return false;
    }
    return true;
  }

  async loadSidebarUserProfile() {
    const avatarElem = document.getElementById('sidebarUserAvatar');
    const nameElem = document.getElementById('sidebarUserName');

    if (!avatarElem && !nameElem) return;

    let displayName = localStorage.getItem('user_full_name') || localStorage.getItem('user_display_name');
    let avatarUrl = localStorage.getItem('user_avatar_url') || '';

    if ((!displayName || displayName === 'User Profile' || displayName === 'User profile' || displayName === 'Đang tải...') && window.supabaseService) {
      try {
        const currentUser = await window.supabaseService.getCurrentUser();
        if (currentUser) {
          displayName = currentUser.user_metadata?.display_name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User Profile';
          avatarUrl = currentUser.avatar_url || currentUser.user_metadata?.avatar_url || avatarUrl;
        }
      } catch (e) {
        console.warn("Could not load user profile for sidebar:", e);
      }
    }

    if (!displayName || displayName === 'Đang tải...') displayName = "User Profile";

    localStorage.setItem('user_full_name', displayName);
    localStorage.setItem('user_display_name', displayName);

    const parts = displayName.trim().split(/\s+/);
    let initials = 'NA';
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (displayName.length > 0) {
      initials = displayName.substring(0, Math.min(2, displayName.length)).toUpperCase();
    }

    if (avatarElem) {
      if (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:image') || avatarUrl.includes('/'))) {
        avatarElem.innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full" alt="Avatar" />`;
        avatarElem.classList.add('overflow-hidden');
      } else {
        avatarElem.innerText = initials;
      }
    }
    if (nameElem) nameElem.innerText = displayName;
  }

  initSidebarCollapse() {
    const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (isCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }

    const toggleBtn = document.getElementById('toggleSidebarCollapseBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const currentlyCollapsed = document.body.classList.contains('sidebar-collapsed');
        if (currentlyCollapsed) {
          document.body.classList.remove('sidebar-collapsed');
          localStorage.setItem('sidebar_collapsed', 'false');
        } else {
          document.body.classList.add('sidebar-collapsed');
          localStorage.setItem('sidebar_collapsed', 'true');
        }
      });
    }
  }
}

// Global Export & Auto Execution on Document Load
window.securityGuard = new SecurityGuardService();

document.addEventListener('DOMContentLoaded', () => {
  // Apply Global Theme Settings (Light/Dark)
  const theme = localStorage.getItem('app_theme') || 'light';
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  }

  // Apply Global Font Size Scaling
  const fontSize = localStorage.getItem('app_font_size') || '16';
  document.documentElement.style.fontSize = `${fontSize}px`;

  // Auto Load Logged-In User Profile into Left Sidebar
  window.securityGuard.loadSidebarUserProfile();

  // Auto Initialize Sidebar Collapse Engine
  window.securityGuard.initSidebarCollapse();

  // Auto Refresh Sidebar Notification Badges, Global Realtime Messages & Presence
  if (window.supabaseService) {
    window.supabaseService.updateSidebarBadges();

    const currentUserId = localStorage.getItem('user_id');
    if (currentUserId) {
      if (typeof window.supabaseService.subscribeGlobalUserMessages === 'function') {
        window.supabaseService.subscribeGlobalUserMessages(currentUserId);
      }
      if (typeof window.supabaseService.initUserPresence === 'function') {
        window.supabaseService.initUserPresence(currentUserId);
      }
    }
  }

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (window.securityGuard.authPages.includes(currentPage)) {
    window.securityGuard.redirectIfAuthenticated();
  } else if (window.securityGuard.protectedPages.includes(currentPage)) {
    window.securityGuard.requireAuth();
  }
});
