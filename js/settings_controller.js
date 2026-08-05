/**
 * Settings Controller for Sign_Speak System Controls & Accessibility Features
 * Handles Light/Dark Theme, System Font Size Scale, Diagnostic HUD Toggle,
 * Subtitle Opacity Controls, and Interactive Live Preview.
 */

document.addEventListener('DOMContentLoaded', () => {
  let settings = {
    theme: localStorage.getItem('app_theme') || 'light',
    fontSize: localStorage.getItem('app_font_size') || '16',
    showHud: localStorage.getItem('show_diagnostic_hud') !== 'false',
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

      alert("✅ Đã lưu tất cả cài đặt hệ thống thành công!");
    });
  }
});
