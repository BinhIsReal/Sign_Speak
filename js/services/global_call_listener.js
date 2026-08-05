/**
 * Global Call Listener Service for Sign_Speak
 * Listens for Realtime Incoming Video Calls across all pages.
 * Displays interactive Incoming Call Modal with Accept & Decline actions.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Delay slightly to ensure Supabase Service initializes
  setTimeout(async () => {
    if (!window.supabaseService) return;

    const currentUser = await window.supabaseService.getCurrentUser();
    if (!currentUser) return;

    window.supabaseService.subscribeGlobalCallNotifications(currentUser.id, (callPayload) => {
      showIncomingCallModal(callPayload);
    });
  }, 1000);
});

function showIncomingCallModal(callData) {
  const existingModal = document.getElementById('globalIncomingCallModal');
  if (existingModal) existingModal.remove();

  const callerName = callData.callerName || 'Người dùng Sign Speak';
  const callerAvatar = callData.callerAvatar || 'NA';
  const roomId = callData.roomId || 'room_default';

  const modalHtml = `
    <div id="globalIncomingCallModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
      <div class="bg-white dark:bg-[#151e32] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full text-center space-y-5 transform transition-all duration-300">
        <div class="relative w-20 h-20 mx-auto mt-2">
          <div class="w-20 h-20 rounded-full bg-primary text-white font-bold text-2xl flex items-center justify-center shadow-xl border-4 border-white dark:border-slate-700 animate-pulse">
            ${callerAvatar}
          </div>
          <span class="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-700 shadow-md"></span>
        </div>

        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white">${callerName}</h3>
          <p class="text-xs text-primary font-bold mt-1.5 flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[16px] animate-bounce">videocam</span>
            <span>Cuộc gọi Video VSL Realtime...</span>
          </p>
        </div>

        <div class="flex items-center justify-center gap-3 pt-2">
          <button id="globalDeclineCallBtn" class="px-5 py-2.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-200 transition-all cursor-pointer">
            Từ chối
          </button>
          <button id="globalAcceptCallBtn" class="px-6 py-2.5 rounded-full bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer">
            Chấp nhận
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modal = document.getElementById('globalIncomingCallModal');
  const acceptBtn = document.getElementById('globalAcceptCallBtn');
  const declineBtn = document.getElementById('globalDeclineCallBtn');

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (modal) modal.remove();
      window.location.href = `call.html?room=${encodeURIComponent(roomId)}&partner=${encodeURIComponent(callerName)}&role=callee`;
    });
  }

  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      if (modal) modal.remove();
    });
  }
}
