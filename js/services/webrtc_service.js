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

    // STUN servers only - TURN relay via Cloudflare & Metered
    // NOTE: openrelay is unreliable public relay. Replace with real TURN credentials for production.
    this.iceConfig = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun3.l.google.com:19302',
            'stun:stun4.l.google.com:19302',
            'stun:stun.cloudflare.com:3478',
            'stun:stun.services.mozilla.com:3478',
            'stun:stun.ekiga.net',
            'stun:stun.ideasip.com',
            'stun:stun.schlund.de',
            'stun:stun.voiparound.com',
            'stun:stun.voipbuster.com',
            'stun:stun.voipstunt.com'
          ]
        },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:80?transport=tcp',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
            'turns:openrelay.metered.ca:443',
            'turns:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: [
            'turn:global.relay.metered.ca:80',
            'turn:global.relay.metered.ca:80?transport=tcp',
            'turn:global.relay.metered.ca:443',
            'turns:global.relay.metered.ca:443',
          ],
          username: 'e8dd65f04b36a05dbf4e5e5b',
          credential: 'uBt6PXXj8nMc4vOe'
        }
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all'
    };

    this.onRemoteStreamCallback = null;
    this.onConnectionStateCallback = null;
    this.iceCandidatesQueue = [];
    this._iceDisconnectedTimer = null;
  }

  createFallbackStream(text = "Chưa cấp quyền Camera") {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    
    function draw() {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Counter-flip text so it renders correctly inside a CSS scaleX(-1) mirror wrapper
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

      // If peerConnection is already active, attach or replace tracks immediately!
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
   * Initialize PeerConnection and join room with W3C Perfect Negotiation
   */
  initPeerConnection(roomId, onRemoteStream, onStateChange, currentUserId = '', isCaller = false, isPolite = false) {
    this.roomId = roomId;
    this.currentUserId = currentUserId;
    this.isCaller = isCaller;
    this.isPolite = isPolite;
    this.onRemoteStreamCallback = onRemoteStream;
    this.onConnectionStateCallback = onStateChange;
    this.iceCandidatesQueue = [];
    this.offerCreated = false;
    this.makingOffer = false;
    clearTimeout(this._iceDisconnectedTimer);

    this.peerConnection = new RTCPeerConnection(this.iceConfig);
    this.remoteStream = new MediaStream();

    // Add local tracks or add transceivers to guarantee sendrecv negotiation
    if (this.localStream && this.localStream.getTracks().length > 0) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    } else {
      try {
        this.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
        this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (_e) {}
    }

    // Handle remote track received
    this.peerConnection.ontrack = event => {
      console.log("[WebRTC] Remote track received:", event.track.kind, event.track.id);
      
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      if (!this.remoteStream.getTracks().some(t => t.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(t => {
          if (!this.remoteStream.getTracks().some(existing => existing.id === t.id)) {
            this.remoteStream.addTrack(t);
          }
        });
      }

      const tracks = this.remoteStream.getTracks();
      console.log(`[WebRTC] remoteStream tracks: [${tracks.map(t => `${t.kind}:${t.readyState}:${t.enabled}`).join(', ')}]`);

      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(this.remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        window.supabaseService.sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          senderId: this.currentUserId
        });
      }
    };

    // ICE gathering state log
    this.peerConnection.onicegatheringstatechange = () => {
      console.log(`[WebRTC ICE Gathering]: ${this.peerConnection.iceGatheringState}`);
    };

    // Handle ICE connection state — auto-restart on failure
    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection.iceConnectionState;
      console.log(`[WebRTC ICE State]: ${iceState}`);

      if (iceState === 'connected' || iceState === 'completed') {
        clearTimeout(this._iceDisconnectedTimer);
        if (this.onConnectionStateCallback) this.onConnectionStateCallback('connected');
      } else if (iceState === 'failed') {
        console.warn("[WebRTC] ICE failed. Attempting ICE restart...");
        if (!this.isPolite) {
          setTimeout(() => this.createCallOffer(this.currentUserId, true), 500);
        }
      } else if (iceState === 'disconnected') {
        console.warn("[WebRTC] ICE disconnected. Will restart if not recovered in 4s...");
        this._iceDisconnectedTimer = setTimeout(() => {
          if (this.peerConnection && this.peerConnection.iceConnectionState === 'disconnected') {
            if (!this.isPolite) this.createCallOffer(this.currentUserId, true);
          }
        }, 4000);
      }
    };

    // Handle overall connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`[WebRTC Connection State]: ${state}`);
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(state);
      }
    };

    // Signal presence readiness
    setTimeout(() => {
      window.supabaseService.sendSignalingMessage({
        type: 'peer-joined',
        senderId: this.currentUserId
      });
      console.log("[WebRTC] Sent peer-joined. isCaller:", this.isCaller, "isPolite:", this.isPolite);
    }, 600);
  }

  /**
   * Handle incoming WebRTC signaling messages with Perfect Negotiation
   */
  async handleIncomingSignal(signal, currentUserId = '') {
    if (!this.peerConnection || !signal) return;
    if (signal.senderId && currentUserId && signal.senderId === currentUserId) return;

    try {
      const sigState = this.peerConnection.signalingState;

      if (signal.type === 'peer-joined') {
        console.log("[WebRTC] Received peer-joined. isCaller:", this.isCaller, "isPolite:", this.isPolite, "sigState:", sigState);
        // Impolite peer (caller) always initiates the offer
        if (!this.isPolite) {
          await this.createCallOffer(currentUserId);
        }
      } else if (signal.type === 'offer') {
        const offerCollision = (this.makingOffer || sigState !== 'stable');

        if (offerCollision) {
          if (!this.isPolite) {
            console.warn(`[WebRTC] Offer collision on impolite peer (state: ${sigState}), dropping incoming offer`);
            return;
          }
          console.log(`[WebRTC] Offer collision on polite peer (state: ${sigState}), rolling back`);
          try {
            await this.peerConnection.setLocalDescription({ type: 'rollback' });
          } catch (_rbErr) {
            console.warn("[WebRTC] Rollback failed:", _rbErr.message);
          }
        }

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
        await this.processQueuedIceCandidates();

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        window.supabaseService.sendSignalingMessage({
          type: 'answer',
          answer: answer,
          senderId: currentUserId || this.currentUserId
        });
        console.log("[WebRTC] Answer generated & sent successfully!");
      } else if (signal.type === 'answer') {
        if (sigState !== 'have-local-offer') {
          console.warn(`[WebRTC] Ignoring answer in signalingState: ${sigState}`);
          return;
        }
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
        await this.processQueuedIceCandidates();
        console.log("[WebRTC] Remote answer accepted!");
      } else if (signal.type === 'ice-candidate') {
        if (signal.candidate) {
          try {
            const candidate = new RTCIceCandidate(signal.candidate);
            if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
              await this.peerConnection.addIceCandidate(candidate);
            } else {
              this.iceCandidatesQueue.push(candidate);
            }
          } catch (e) {
            console.warn("[WebRTC] addIceCandidate warning:", e.message);
          }
        }
      }
    } catch (err) {
      console.error("[WebRTC] Error handling signaling message:", err);
    }
  }

  async processQueuedIceCandidates() {
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (e) {
        console.warn("Lỗi addIceCandidate từ queue:", e.message);
      }
    }
  }

  /**
   * Initiate call offer
   */
  async createCallOffer(currentUserId = '', iceRestart = false) {
    if (!this.peerConnection) return;
    if (this.makingOffer) {
      console.warn("[WebRTC] Already making offer, skipping duplicate createCallOffer");
      return;
    }
    try {
      this.makingOffer = true;
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: iceRestart
      });
      await this.peerConnection.setLocalDescription(offer);

      window.supabaseService.sendSignalingMessage({
        type: 'offer',
        offer: offer,
        senderId: currentUserId || this.currentUserId
      });
      console.log(`[WebRTC] Call offer sent! (iceRestart: ${iceRestart})`);
    } catch (err) {
      console.error("[WebRTC] Error creating offer:", err);
    } finally {
      this.makingOffer = false;
    }
  }

  /**
   * End call and release media resources
   */
  endCall() {
    clearTimeout(this._iceDisconnectedTimer);
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    console.log("Đã kết thúc cuộc gọi WebRTC.");
  }
}

window.webRTCService = new WebRTCService();
