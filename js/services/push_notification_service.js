/**
 * PushNotificationService for Sign_Speak
 * Handles Browser Push Notifications for incoming video calls
 * and Web Audio API ringtone playback.
 */

class PushNotificationService {
  constructor() {
    this._ringtoneContext = null;
    this._ringtoneNodes = [];
    this._ringtoneTimer = null;
    this._isRinging = false;
  }

  /**
   * Request browser notification permission.
   * @returns {Promise<string>} 'granted' | 'denied' | 'default' | 'unsupported'
   */
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('[PushNotification] Browser does not support Web Notifications.');
      return 'unsupported';
    }
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const permission = await Notification.requestPermission();
    console.log('[PushNotification] Permission:', permission);
    return permission;
  }

  /**
   * Show a system-level push notification for an incoming call.
   * @param {string} callerName
   * @param {string} roomId
   * @param {Function} onClickCallback
   */
  showCallNotification(callerName, roomId, onClickCallback) {
    if (!('Notification' in window)) return null;
    if (Notification.permission !== 'granted') return null;

    const notification = new Notification('Cuoc goi Video den', {
      body: callerName + ' dang goi video cho ban...',
      icon: '/assets/icon-192.png',
      tag: 'incoming-call-' + roomId,
      requireInteraction: true,
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      if (typeof onClickCallback === 'function') onClickCallback();
    };

    setTimeout(() => notification.close(), 60000);
    return notification;
  }

  /**
   * Play telephone ringtone via Web Audio API (no external file needed).
   */
  playRingtone() {
    if (this._isRinging) return;
    this._isRinging = true;

    try {
      this._ringtoneContext = new (window.AudioContext || window.webkitAudioContext)();

      const ringPattern = () => {
        if (!this._isRinging || !this._ringtoneContext) return;
        const ctx = this._ringtoneContext;
        const now = ctx.currentTime;

        [440, 480].forEach(freq => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05);
          gainNode.gain.setValueAtTime(0.12, now + 0.9);
          gainNode.gain.linearRampToValueAtTime(0, now + 1.0);
          osc.start(now);
          osc.stop(now + 1.0);
          this._ringtoneNodes.push(osc);
        });

        if (this._isRinging) {
          this._ringtoneTimer = setTimeout(ringPattern, 3000);
        }
      };

      ringPattern();
    } catch (err) {
      console.warn('[PushNotification] Cannot play ringtone:', err.message);
    }
  }

  /**
   * Stop ringtone.
   */
  stopRingtone() {
    this._isRinging = false;
    clearTimeout(this._ringtoneTimer);
    this._ringtoneNodes.forEach(node => { try { node.stop(); } catch (_) {} });
    this._ringtoneNodes = [];
    if (this._ringtoneContext) {
      try { this._ringtoneContext.close(); } catch (_) {}
      this._ringtoneContext = null;
    }
  }
}

window.pushNotificationService = new PushNotificationService();
