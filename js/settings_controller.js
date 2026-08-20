/**
 * Settings Controller for Sign_Speak System Controls & Accessibility Features
 * Handles Light/Dark Theme, System Font Size Scale, Diagnostic HUD Toggle,
 * Subtitle Opacity Controls, and Interactive Live Preview.
 */

document.addEventListener('DOMContentLoaded', () => {
  let settings = {
    theme: localStorage.getItem('app_theme') || 'light',
    fontSize: localStorage.getItem('app_font_size') || '16',
    showHud: localStorage.getItem('show_diagnostic_hud') === 'true',
    subtitleMode: localStorage.getItem('subtitle_mode') || 'overlay',
    overlayOpacity: localStorage.getItem('overlay_opacity') || '80',
    fixedBarOpacity: localStorage.getItem('fixed_bar_opacity') || '90'
  };

  const themeLightBtn = document.getElementById('themeLightBtn');
  const themeDarkBtn = document.getElementById('themeDarkBtn');
  const themeDesc = document.getElementById('themeDesc');

  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeBadge = document.getElementById('fontSizeBadge');

  const hudToggle = document.getElementById('hudToggle');
  const hudDot = document.getElementById('hudDot');

  const subtitleModeBtn = document.getElementById('subtitleModeBtn');
  const subtitleModeDesc = document.getElementById('subtitleModeDesc');
  const overlayOpacityInput = document.getElementById('overlayOpacityInput');
  const overlayOpacityBadge = document.getElementById('overlayOpacityBadge');
  const fixedBarOpacityInput = document.getElementById('fixedBarOpacityInput');
  const fixedBarOpacityBadge = document.getElementById('fixedBarOpacityBadge');

  const previewSubtitleOverlay = document.getElementById('previewSubtitleOverlay');
  const previewOverlayInner = document.getElementById('previewOverlayInner');
  const previewFixedBar = document.getElementById('previewFixedBar');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  // --- 1. APPLY THEME REALTIME ---
  function applyTheme(theme) {
    settings.theme = theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      if (themeDarkBtn && themeLightBtn) {
        themeDarkBtn.className = "px-4 py-2 rounded-full font-bold text-xs transition-all bg-primary text-white shadow-sm";
        themeLightBtn.className = "px-4 py-2 rounded-full font-bold text-xs transition-all bg-slate-200 text-slate-700 hover:bg-slate-300";
      }
      if (themeDesc) themeDesc.innerText = 'Giao diện tối bảo vệ mắt (Dark Mode)';
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      if (themeDarkBtn && themeLightBtn) {
        themeLightBtn.className = "px-4 py-2 rounded-full font-bold text-xs transition-all bg-primary text-white shadow-sm";
        themeDarkBtn.className = "px-4 py-2 rounded-full font-bold text-xs transition-all bg-slate-200 text-slate-700 hover:bg-slate-300";
      }
      if (themeDesc) themeDesc.innerText = 'Giao diện sáng tiêu chuẩn (Light Mode)';
    }
  }

  // --- 2. APPLY FONT SIZE REALTIME ---
  function applyFontSize(size) {
    settings.fontSize = size;
    document.documentElement.style.fontSize = `${size}px`;
    if (fontSizeBadge) fontSizeBadge.innerText = `${size}px`;
    if (fontSizeSlider) fontSizeSlider.value = size;
  }

  // --- 3. APPLY HUD TOGGLE REALTIME ---
  function applyHudToggle(show) {
    settings.showHud = show;
    if (hudToggle && hudDot) {
      if (show) {
        hudToggle.className = "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-primary transition-colors duration-200 ease-in-out";
        hudDot.className = "pointer-events-none inline-block h-6 w-6 transform translate-x-5 rounded-full bg-white shadow-md transition duration-200 ease-in-out";
      } else {
        hudToggle.className = "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-300 transition-colors duration-200 ease-in-out";
        hudDot.className = "pointer-events-none inline-block h-6 w-6 transform translate-x-0 rounded-full bg-white shadow-md transition duration-200 ease-in-out";
      }
    }
  }

  // --- 4. APPLY SUBTITLE PREVIEW & OPACITY REALTIME ---
  function updateSubtitlePreview() {
    if (subtitleModeBtn && subtitleModeDesc) {
      if (settings.subtitleMode === 'fixed') {
        subtitleModeBtn.innerText = 'Fixed Subtitle Bar 🔄';
        subtitleModeDesc.innerText = 'Fixed Subtitle Bar (Băng chuyền màu đen cố định phía dưới)';
        if (previewSubtitleOverlay) previewSubtitleOverlay.classList.add('hidden');
        if (previewFixedBar) previewFixedBar.classList.remove('hidden');
      } else {
        subtitleModeBtn.innerText = 'Glassmorphism Overlay 🔄';
        subtitleModeDesc.innerText = 'Glassmorphism Overlay (Viên thuốc nổi lơ lửng đè trên video)';
        if (previewSubtitleOverlay) previewSubtitleOverlay.classList.remove('hidden');
        if (previewFixedBar) previewFixedBar.classList.add('hidden');
      }
    }

    if (overlayOpacityBadge) overlayOpacityBadge.innerText = `${settings.overlayOpacity}%`;
    if (overlayOpacityInput) overlayOpacityInput.value = settings.overlayOpacity;
    if (previewOverlayInner) {
      previewOverlayInner.style.backgroundColor = `rgba(0, 0, 0, ${settings.overlayOpacity / 100})`;
    }

    if (fixedBarOpacityBadge) fixedBarOpacityBadge.innerText = `${settings.fixedBarOpacity}%`;
    if (fixedBarOpacityInput) fixedBarOpacityInput.value = settings.fixedBarOpacity;
    if (previewFixedBar) {
      previewFixedBar.style.backgroundColor = `rgba(0, 0, 0, ${settings.fixedBarOpacity / 100})`;
    }
  }

  // --- 5. MODERN TOAST NOTIFICATION ---
  function showSaveSuccessToast() {
    const existing = document.getElementById('settingsSuccessToast');
    if (existing) existing.remove();

    const toastHtml = `
      <div id="settingsSuccessToast" class="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3.5 px-6 py-4 rounded-2xl bg-slate-900/95 dark:bg-[#111928]/95 border border-emerald-500/40 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-6 duration-300 max-w-md w-[92%] sm:w-auto">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
          <span class="material-symbols-outlined text-[24px]">verified</span>
        </div>
        <div class="pr-2 flex-1 min-w-0">
          <h4 class="text-xs font-bold text-white tracking-wide flex items-center gap-1.5">
            <span>Đã lưu cài đặt thành công!</span>
          </h4>
          <p class="text-[11px] text-slate-300 mt-0.5">Các thay đổi về giao diện, phụ đề và HUD đã được áp dụng.</p>
        </div>
        <button onclick="document.getElementById('settingsSuccessToast')?.remove()" class="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer shrink-0">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', toastHtml);

    setTimeout(() => {
      const toast = document.getElementById('settingsSuccessToast');
      if (toast) {
        toast.classList.add('opacity-0', '-translate-y-4', 'transition-all', 'duration-300');
        setTimeout(() => toast.remove(), 300);
      }
    }, 3000);
  }

  // --- INIT UI FROM LOCAL STORAGE ---
  applyTheme(settings.theme);
  applyFontSize(settings.fontSize);
  applyHudToggle(settings.showHud);
  updateSubtitlePreview();

  // --- EVENT LISTENERS ---
  if (themeLightBtn) themeLightBtn.addEventListener('click', () => applyTheme('light'));
  if (themeDarkBtn) themeDarkBtn.addEventListener('click', () => applyTheme('dark'));

  if (fontSizeSlider) {
    // Only update visual badge while dragging to prevent layout stutter
    fontSizeSlider.addEventListener('input', (e) => {
      if (fontSizeBadge) fontSizeBadge.innerText = `${e.target.value}px`;
    });
    // Trigger actual font reflow only when handle is released
    fontSizeSlider.addEventListener('change', (e) => {
      applyFontSize(e.target.value);
    });
  }

  // Handle Tick Mark Dot Clicks directly
  document.querySelectorAll('.font-size-tick').forEach(tickBtn => {
    tickBtn.addEventListener('click', () => {
      const targetSize = tickBtn.getAttribute('data-size');
      if (targetSize) {
        applyFontSize(targetSize);
      }
    });
  });

  if (hudToggle) {
    hudToggle.addEventListener('click', () => {
      applyHudToggle(!settings.showHud);
    });
  }

  if (subtitleModeBtn) {
    subtitleModeBtn.addEventListener('click', () => {
      settings.subtitleMode = settings.subtitleMode === 'overlay' ? 'fixed' : 'overlay';
      updateSubtitlePreview();
    });
  }

  if (overlayOpacityInput) {
    overlayOpacityInput.addEventListener('input', (e) => {
      settings.overlayOpacity = e.target.value;
      updateSubtitlePreview();
    });
  }

  if (fixedBarOpacityInput) {
    fixedBarOpacityInput.addEventListener('input', (e) => {
      settings.fixedBarOpacity = e.target.value;
      updateSubtitlePreview();
    });
  }

  // --- SAVE ALL SETTINGS ---
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      localStorage.setItem('app_theme', settings.theme);
      localStorage.setItem('app_font_size', settings.fontSize);
      localStorage.setItem('show_diagnostic_hud', settings.showHud ? 'true' : 'false');
      localStorage.setItem('subtitle_mode', settings.subtitleMode);
      localStorage.setItem('overlay_opacity', settings.overlayOpacity);
      localStorage.setItem('fixed_bar_opacity', settings.fixedBarOpacity);

      // Button feedback
      const origText = saveSettingsBtn.innerHTML;
      saveSettingsBtn.innerHTML = `<span>✓ Đã lưu cài đặt thành công!</span>`;
      saveSettingsBtn.className = "w-full py-4 bg-emerald-600 text-white rounded-full font-bold text-sm shadow-xl shadow-emerald-600/30 transition-all cursor-pointer";
      setTimeout(() => {
        saveSettingsBtn.innerHTML = origText;
        saveSettingsBtn.className = "w-full py-4 bg-gradient-to-r from-primary to-primary-container text-white rounded-full font-bold text-sm shadow-xl shadow-primary/25 hover:shadow-2xl hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer";
      }, 2000);

      showSaveSuccessToast();
    });
  }
});
