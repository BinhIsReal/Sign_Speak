/**
 * WebRTC Service for Sign_Speak
 * Manages RTCPeerConnection with dynamic ICE config fetched from /api/ice-servers.
 * Supports automatic ICE restart on disconnection for cross-network reliability.
 */

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.roomId = null;
    this.offerCreated = false;
    this.currentUserId = '';
    this.isCaller = false;

    // ICE config is fetched dynamically from /api/ice-servers
    // This fallback is used only if the API call fails
    this._staticFallbackConfig = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun.cloudflare.com:3478',
            'stun:stun.relay.metered.ca:80',
          ]
        },
        {
          urls: 'turn:global.relay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:global.relay.metered.ca:80?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:global.relay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turns:global.relay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    this.iceConfig = null; // Will be fetched dynamically
    this.onRemoteStreamCallback = null;
    this.onConnectionStateCallback = null;
    this.iceCandidatesQueue = [];

    // ICE restart management
    this._iceRestartInProgress = false;
    this._iceRestartTimeout = null;
    this._iceRestartAttempts = 0;
    this._maxIceRestartAttempts = 3;
  }

  /**
   * Fetch dynamic ICE server config from Vercel serverless API.
   * Falls back to static config on error.
   */
  async fetchIceConfig() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch('/api/ice-servers', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`/api/ice-servers responded ${response.status}`);
      }

      const data = await response.json();

      // Handle both response shapes: { iceServers: [...] } or { iceServers: [...], ... } or array directly
      let iceServers = null;
      if (Array.isArray(data)) {
        iceServers = data;
      } else if (data.iceServers && Array.isArray(data.iceServers)) {
        iceServers = data.iceServers;
      }

      if (!iceServers || iceServers.length === 0) {
        throw new Error('Empty ICE server list returned from API');
      }

      const config = {
        iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      };
      console.log(`[WebRTC] Fetched ${iceServers.length} ICE servers from /api/ice-servers`);
      return config;

    } catch (err) {
      console.warn('[WebRTC] Failed to fetch dynamic ICE config, using static fallback:', err.message);
      return this._staticFallbackConfig;
    }
  }

  createFallbackStream(text = 'Chưa cấp quyền Camera') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    function draw() {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);

      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 18px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒 ' + text, canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px Outfit, sans-serif';
      ctx.fillText('Hãy Bật cho phép Camera trên ổ khóa URL rồi tải lại trang', canvas.width / 2, canvas.height / 2 + 20);

      ctx.restore();
    }
    draw();
    setInterval(draw, 1000);
    return canvas.captureStream(15);
  }

  /**
   * Initialize local camera/microphone stream
   */
  async getLocalStream(videoElement = null, audioEnabled = true) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: audioEnabled
      });

      if (videoElement) {
        videoElement.srcObject = this.localStream;
      }

      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        this.localStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track && s.track.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
            console.log(`[WebRTC] Replaced ${track.kind} track on active sender`);
          } else {
            this.peerConnection.addTrack(track, this.localStream);
            console.log(`[WebRTC] Added ${track.kind} track to active PeerConnection`);
          }
        });
      }

      return this.localStream;
    } catch (err) {
      console.warn('[WebRTC] Lỗi truy cập camera/micro (Tạo luồng Fallback):', err.name, err.message);
      this.localStream = this.createFallbackStream('Chưa cấp quyền Camera / Micro');
      if (videoElement) {
        videoElement.srcObject = this.localStream;
      }
      return this.localStream;
    }
  }

  toggleAudio(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log(`[WebRTC] Audio track enabled: ${enabled}`);
    }
  }

  toggleVideo(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log(`[WebRTC] Video track enabled: ${enabled}`);
    }
  }

  /**
   * Initialize PeerConnection and join room.
   * Fetches fresh ICE credentials dynamically before creating connection.
   */
  async initPeerConnection(roomId, onRemoteStream, onStateChange, currentUserId = '', isCaller = false) {
    this.roomId = roomId;
    this.currentUserId = currentUserId;
    this.isCaller = isCaller;
    this.onRemoteStreamCallback = onRemoteStream;
    this.onConnectionStateCallback = onStateChange;
    this.iceCandidatesQueue = [];
    this.offerCreated = false;
    this._iceRestartInProgress = false;
    this._iceRestartAttempts = 0;

    console.log(`[WebRTC Init] Fetching fresh ICE config...`);

    // CRITICAL: Always fetch fresh ICE credentials before creating connection
    this.iceConfig = await this.fetchIceConfig();

    console.log(`[WebRTC Init] PeerConnection starting for user: ${currentUserId}, isCaller: ${isCaller}, roomId: ${roomId}`);

    this._createPeerConnection();

    // Announce presence to partner
    setTimeout(() => {
      console.log(`[WebRTC] Broadcasting peer-joined signal for user: ${this.currentUserId}`);
      window.supabaseService.sendSignalingMessage({
        type: 'peer-joined',
        senderId: this.currentUserId
      });
    }, 600);
  }

  /**
   * Internal: Create RTCPeerConnection with current iceConfig.
   * Called on init and on reconnect.
   */
  _createPeerConnection() {
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (_e) {}
    }

    this.peerConnection = new RTCPeerConnection(this.iceConfig);
    this.remoteStream = new MediaStream();

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      console.log(`[WebRTC] Added ${this.localStream.getTracks().length} local tracks to PeerConnection`);
    }

    // Handle remote track received
    this.peerConnection.ontrack = event => {
      console.log('[WebRTC] Remote track received:', event.track.kind, event.streams?.length);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) this.remoteStream = new MediaStream();
        if (!this.remoteStream.getTracks().some(t => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
      }

      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(this.remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        console.log(`[WebRTC ICE Local Candidate]: type=${event.candidate.type}, protocol=${event.candidate.protocol}`);
        window.supabaseService.sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          senderId: this.currentUserId
        });
      } else {
        console.log('[WebRTC] ICE candidate gathering complete.');
      }
    };

    // Handle ICE gathering state
    this.peerConnection.onicegatheringstatechange = () => {
      console.log(`[WebRTC ICE Gathering]: ${this.peerConnection.iceGatheringState}`);
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`[WebRTC State]: ${state}`);
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(state);
      }

      if (state === 'failed') {
        console.error('[WebRTC] Connection FAILED — attempting full reconnect...');
        this._handleConnectionFailed();
      }
    };

    // Handle ICE connection state changes — main indicator of cross-network health
    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection.iceConnectionState;
      console.log(`[WebRTC ICE State]: ${iceState}`);

      if (iceState === 'connected' || iceState === 'completed') {
        this._iceRestartInProgress = false;
        this._iceRestartAttempts = 0;
        if (this._iceRestartTimeout) {
          clearTimeout(this._iceRestartTimeout);
          this._iceRestartTimeout = null;
        }
        if (this.onConnectionStateCallback) this.onConnectionStateCallback('connected');
      } else if (iceState === 'disconnected') {
        console.warn('[WebRTC] ICE disconnected across remote networks. Attempting auto ICE restart...');
        this._scheduleIceRestart();
      } else if (iceState === 'failed') {
        console.error('[WebRTC] ICE failed — attempting forced reconnect with fresh credentials...');
        this._handleConnectionFailed();
      }
    };
  }

  /**
   * Schedule ICE restart with a short delay to handle transient disconnects.
   */
  _scheduleIceRestart(delayMs = 2000) {
    if (this._iceRestartInProgress) return;

    if (this._iceRestartTimeout) {
      clearTimeout(this._iceRestartTimeout);
    }

    this._iceRestartTimeout = setTimeout(() => {
      // Re-check state — may have recovered on its own
      const currentIceState = this.peerConnection?.iceConnectionState;
      if (currentIceState === 'connected' || currentIceState === 'completed') {
        console.log('[WebRTC] ICE self-recovered, no restart needed.');
        return;
      }
      this._doIceRestart();
    }, delayMs);
  }

  /**
   * Perform ICE restart — caller re-sends offer with iceRestart:true.
   */
  async _doIceRestart() {
    if (!this.peerConnection || this._iceRestartInProgress) return;
    if (this._iceRestartAttempts >= this._maxIceRestartAttempts) {
      console.error(`[WebRTC] Exceeded max ICE restart attempts (${this._maxIceRestartAttempts}). Triggering full reconnect.`);
      this._handleConnectionFailed();
      return;
    }

    this._iceRestartInProgress = true;
    this._iceRestartAttempts++;
    console.log(`[WebRTC] ICE restart attempt ${this._iceRestartAttempts}/${this._maxIceRestartAttempts}`);

    try {
      if (this.isCaller) {
        // Caller initiates ICE restart by creating a new offer with iceRestart: true
        const offer = await this.peerConnection.createOffer({ iceRestart: true });
        await this.peerConnection.setLocalDescription(offer);

        window.supabaseService.sendSignalingMessage({
          type: 'offer',
          offer: offer,
          senderId: this.currentUserId,
          iceRestart: true
        });
        console.log('[WebRTC] Call offer sent to signaling room! (iceRestart: true)');
      } else {
        // Callee requests caller to restart ICE
        window.supabaseService.sendSignalingMessage({
          type: 'request-ice-restart',
          senderId: this.currentUserId
        });
        console.log('[WebRTC] Requested ICE restart from caller.');
      }
    } catch (err) {
      console.error('[WebRTC] ICE restart failed:', err);
      this._iceRestartInProgress = false;
    }
  }

  /**
   * Full reconnect: fetch fresh ICE credentials and recreate peer connection.
   */
  async _handleConnectionFailed() {
    if (!this.peerConnection) return;
    console.log('[WebRTC] Starting full peer connection rebuild with fresh ICE credentials...');

    // Clear pending restart
    if (this._iceRestartTimeout) {
      clearTimeout(this._iceRestartTimeout);
      this._iceRestartTimeout = null;
    }

    // Fetch fresh ICE credentials
    this.iceConfig = await this.fetchIceConfig();
    this.offerCreated = false;
    this._iceRestartInProgress = false;
    this._iceRestartAttempts = 0;
    this.iceCandidatesQueue = [];

    // Rebuild peer connection
    this._createPeerConnection();

    // Re-announce presence to trigger re-negotiation
    setTimeout(() => {
      console.log('[WebRTC] Re-announcing presence after connection rebuild...');
      window.supabaseService.sendSignalingMessage({
        type: 'peer-joined',
        senderId: this.currentUserId,
        reconnect: true
      });
    }, 800);
  }

  /**
   * Handle incoming WebRTC signaling messages from Supabase Realtime
   */
  async handleIncomingSignal(signal, currentUserId = '') {
    if (!this.peerConnection || !signal) return;
    if (signal.senderId && currentUserId && signal.senderId === currentUserId) return;

    try {
      if (signal.type === 'peer-joined' || signal.type === 'request-ice-restart') {
        const isReconnect = signal.reconnect === true || signal.type === 'request-ice-restart';
        console.log(`[WebRTC] Partner ${isReconnect ? 're-joined/requesting restart' : 'joined'} room. isCaller: ${this.isCaller}, offerCreated: ${this.offerCreated}`);

        if (this.isCaller) {
          if (isReconnect) {
            // Reset offer state for reconnect
            this.offerCreated = false;
            this._iceRestartInProgress = false;
            await this.createCallOffer(currentUserId, true);
          } else if (this.peerConnection.localDescription && this.peerConnection.localDescription.type === 'offer') {
            // Callee just joined and Caller already prepared the local offer -> re-send the offer to Callee!
            console.log('[WebRTC] Callee joined! Re-sending existing local offer to callee...');
            window.supabaseService.sendSignalingMessage({
              type: 'offer',
              offer: this.peerConnection.localDescription,
              senderId: currentUserId || this.currentUserId
            });
          } else {
            this.offerCreated = false;
            await this.createCallOffer(currentUserId, true);
          }
        }
      } else if (signal.type === 'offer') {
        console.log('[WebRTC] Received offer from caller, creating answer...');

        // If ICE restart offer, handle regardless of signaling state
        if (signal.iceRestart && this.peerConnection.signalingState !== 'stable') {
          await this.peerConnection.setLocalDescription({ type: 'rollback' }).catch(() => {});
        } else if (this.peerConnection.signalingState !== 'stable') {
          console.warn('[WebRTC] Ignoring offer — signalingState is not stable:', this.peerConnection.signalingState);
          return;
        }

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
        await this.processQueuedIceCandidates();

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        window.supabaseService.sendSignalingMessage({
          type: 'answer',
          answer: answer,
          senderId: currentUserId
        });
        console.log('[WebRTC] Answer sent to caller.');
        this._iceRestartInProgress = false;

      } else if (signal.type === 'answer') {
        console.log('[WebRTC] Remote answer accepted!');
        if (this.peerConnection.signalingState !== 'have-local-offer') {
          console.warn('[WebRTC] Ignoring answer — signalingState is not have-local-offer:', this.peerConnection.signalingState);
          return;
        }
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
        await this.processQueuedIceCandidates();
        this._iceRestartInProgress = false;

      } else if (signal.type === 'ice-candidate') {
        if (signal.candidate) {
          const candidate = new RTCIceCandidate(signal.candidate);
          if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
            await this.peerConnection.addIceCandidate(candidate);
          } else {
            this.iceCandidatesQueue.push(candidate);
          }
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error handling signaling message:', err);
    }
  }

  async processQueuedIceCandidates() {
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (e) {
        console.warn('[WebRTC] Error addIceCandidate from queue:', e);
      }
    }
  }

  /**
   * Initiate call offer — called by caller side
   */
  async createCallOffer(currentUserId = '', force = false) {
    if (!this.peerConnection) return;
    if (this.offerCreated && !force) {
      if (this.peerConnection.localDescription && this.peerConnection.localDescription.type === 'offer') {
        console.log('[WebRTC] Re-broadcasting existing local offer...');
        window.supabaseService.sendSignalingMessage({
          type: 'offer',
          offer: this.peerConnection.localDescription,
          senderId: currentUserId || this.currentUserId
        });
      } else {
        console.warn('[WebRTC] createCallOffer skipped — offer already created for this session.');
      }
      return;
    }

    this.offerCreated = true;
    try {
      console.log('[WebRTC] Creating call offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await this.peerConnection.setLocalDescription(offer);

      window.supabaseService.sendSignalingMessage({
        type: 'offer',
        offer: offer,
        senderId: currentUserId || this.currentUserId
      });
      console.log('[WebRTC] Offer sent to callee.');
    } catch (err) {
      this.offerCreated = false;
      console.error('[WebRTC] Error creating offer:', err);
    }
  }

  /**
   * End call and release media resources
   */
  endCall() {
    if (this._iceRestartTimeout) {
      clearTimeout(this._iceRestartTimeout);
      this._iceRestartTimeout = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.offerCreated = false;
    this._iceRestartInProgress = false;
    this._iceRestartAttempts = 0;
    console.log('[WebRTC] Call ended and resources released.');
  }
}

window.webRTCService = new WebRTCService();
