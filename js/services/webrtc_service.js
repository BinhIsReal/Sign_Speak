/**
 * WebRTC Service for Sign_Speak
 * Manages RTCPeerConnection, STUN/TURN servers, and Supabase Realtime Broadcast signaling.
 */

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.roomId = null;
    this.offerCreated = false;

    // Multi-Region High Availability STUN & Active Metered TURN Relays
    this.iceConfig = {
      iceServers: [
        {
          urls: [
            'stun:stun.relay.metered.ca:80',
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun.cloudflare.com:3478'
          ]
        },
        {
          urls: [
            'turn:global.relay.metered.ca:80',
            'turn:global.relay.metered.ca:80?transport=tcp',
            'turn:global.relay.metered.ca:443',
            'turns:global.relay.metered.ca:443?transport=tcp'
          ],
          username: '19a41198dfa472d07e664267',
          credential: '2Dl+anP4+2pT5LBN'
        }
      ]
    };

    this.onRemoteStreamCallback = null;
    this.onConnectionStateCallback = null;
    this.iceCandidatesQueue = [];
  }

  createFallbackStream(text = "Chưa cấp quyền Camera") {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    
    function draw() {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);

      ctx.fillStyle = "#f43f5e";
      ctx.font = "bold 18px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🔒 " + text, canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px Outfit, sans-serif";
      ctx.fillText("Hãy Bật cho phép Camera trên ổ khóa URL rồi tải lại trang", canvas.width / 2, canvas.height / 2 + 20);

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
      console.warn("[WebRTC] Lỗi truy cập camera/micro (Tạo luồng Fallback):", err.name, err.message);
      this.localStream = this.createFallbackStream("Chưa cấp quyền Camera / Micro");
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
   */
  initPeerConnection(roomId, onRemoteStream, onStateChange, currentUserId = '', isCaller = false) {
    this.roomId = roomId;
    this.currentUserId = currentUserId;
    this.isCaller = isCaller;
    this.onRemoteStreamCallback = onRemoteStream;
    this.onConnectionStateCallback = onStateChange;
    this.iceCandidatesQueue = [];
    this.offerCreated = false;

    console.log(`[WebRTC Init] PeerConnection starting for user: ${currentUserId}, isCaller: ${isCaller}, roomId: ${roomId}`);

    this.peerConnection = new RTCPeerConnection(this.iceConfig);
    this.remoteStream = new MediaStream();

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      console.log(`[WebRTC Init] Added ${this.localStream.getTracks().length} local tracks to PeerConnection`);
    }

    // Handle remote track received
    this.peerConnection.ontrack = event => {
      console.log("[WebRTC] Remote track received:", event.track.kind, event.streams);
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
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`[WebRTC State]: ${state}`);
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(state);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection.iceConnectionState;
      console.log(`[WebRTC ICE State]: ${iceState}`);
      if (iceState === 'connected' || iceState === 'completed') {
        if (this.onConnectionStateCallback) this.onConnectionStateCallback('connected');
      }
    };

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
   * Handle incoming WebRTC signaling messages from Supabase Realtime
   */
  async handleIncomingSignal(signal, currentUserId = '') {
    if (!this.peerConnection || !signal) return;
    if (signal.senderId && currentUserId && signal.senderId === currentUserId) return;

    try {
      if (signal.type === 'peer-joined') {
        console.log("[WebRTC] Partner joined room. isCaller:", this.isCaller, "offerCreated:", this.offerCreated);
        if (this.isCaller) {
          await this.createCallOffer(currentUserId);
        }
      } else if (signal.type === 'offer') {
        console.log("[WebRTC] Received offer from caller, creating answer...");
        if (this.peerConnection.signalingState !== 'stable') {
          console.warn("[WebRTC] Ignoring offer — signalingState is not stable:", this.peerConnection.signalingState);
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
        console.log("[WebRTC] Answer sent to caller.");
      } else if (signal.type === 'answer') {
        console.log("[WebRTC] Received answer from callee.");
        if (this.peerConnection.signalingState !== 'have-local-offer') {
          console.warn("[WebRTC] Ignoring answer — signalingState is not have-local-offer:", this.peerConnection.signalingState);
          return;
        }
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
        await this.processQueuedIceCandidates();
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
      console.error("Lỗi khi xử lý tin nhắn WebRTC signaling:", err);
    }
  }

  async processQueuedIceCandidates() {
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (e) {
        console.warn("Lỗi addIceCandidate từ queue:", e);
      }
    }
  }

  /**
   * Initiate call offer — called by caller side
   */
  async createCallOffer(currentUserId = '') {
    if (!this.peerConnection) return;
    if (this.offerCreated) {
      console.warn('[WebRTC] createCallOffer skipped — offer already created for this session.');
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
      console.error('Lỗi khi khởi tạo offer:', err);
    }
  }

  /**
   * End call and release media resources
   */
  endCall() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.offerCreated = false;
    console.log("Đã kết thúc cuộc gọi WebRTC.");
  }
}

window.webRTCService = new WebRTCService();
