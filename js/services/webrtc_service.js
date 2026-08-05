/**
 * WebRTC Service for Sign_Speak
 * Manages RTCPeerConnection, STUN/TURN servers, and Supabase Realtime Broadcast signaling.
 *
 * FIXED BUGS:
 * - [BUG #1] Removed duplicate subscribeSignalingRoom() inside initPeerConnection.
 *   call_controller.js already subscribes and routes signals via handleIncomingSignal.
 *   Having two subscribers caused double-processing of offer/answer/ice-candidate.
 * - [BUG #2] Added offerCreated guard flag to prevent duplicate offers when both
 *   'peer-joined' event AND the 1200ms setTimeout in call_controller.js fire.
 * - [BUG #3] Signaling channel broadcast config changed from self:true to self:false
 *   in supabase_client.js to prevent echo-back of own signaling messages.
 * - [BUG #4] Added proper error handling for remoteVideo.play() promise rejection.
 */

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.roomId = null;

    // Guard flag: prevents duplicate offer creation from race condition between
    // 'peer-joined' event handler and the setTimeout in call_controller.js
    this.offerCreated = false;

    // ICE Servers (Google STUN + Free OpenRelay TURN for strict NAT)
    this.iceConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    };

    this.onRemoteStreamCallback = null;
    this.onConnectionStateCallback = null;
    this.iceCandidatesQueue = [];
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
      return this.localStream;
    } catch (err) {
      console.error("Lỗi khi truy cập camera/micro:", err);
      throw err;
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
   * NOTE: Signaling subscription is intentionally NOT done here.
   * call_controller.js owns the single signaling subscription and routes
   * all WebRTC-specific signals here via handleIncomingSignal().
   */
  initPeerConnection(roomId, onRemoteStream, onStateChange, currentUserId = '', isCaller = false) {
    this.roomId = roomId;
    this.currentUserId = currentUserId;
    this.isCaller = isCaller;
    this.onRemoteStreamCallback = onRemoteStream;
    this.onConnectionStateCallback = onStateChange;
    this.iceCandidatesQueue = [];
    this.offerCreated = false; // Reset guard on each new call

    this.peerConnection = new RTCPeerConnection(this.iceConfig);
    this.remoteStream = new MediaStream();

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle remote track received — triggers when partner's video/audio arrives
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

    // Handle ICE candidates — relay to partner via Supabase Realtime signaling
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        window.supabaseService.sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          senderId: this.currentUserId
        });
      }
    };

    // Handle connection state changes — update UI status bar
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`[WebRTC State]: ${state}`);
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(state);
      }
    };

    // Announce presence to the partner — callee will hear this and wait;
    // caller uses its own createCallOffer() with the 1200ms delay in call_controller.js
    setTimeout(() => {
      window.supabaseService.sendSignalingMessage({
        type: 'peer-joined',
        senderId: this.currentUserId
      });
    }, 500);
  }

  /**
   * Handle incoming WebRTC signaling messages from Supabase Realtime.
   * Called exclusively by call_controller.js signaling subscription.
   */
  async handleIncomingSignal(signal, currentUserId = '') {
    if (!this.peerConnection || !signal) return;

    // Ignore own messages (belt-and-suspenders guard; primary filter is self:false channel config)
    if (signal.senderId && currentUserId && signal.senderId === currentUserId) return;

    try {
      if (signal.type === 'peer-joined') {
        // Only the CALLER creates the offer; callee waits for it.
        // offerCreated guard prevents duplicate offers if peer-joined fires multiple times.
        console.log("[WebRTC] Partner joined room.");
        if (this.isCaller && !this.offerCreated) {
          this.offerCreated = true;
          await this.createCallOffer(currentUserId);
        }
      } else if (signal.type === 'offer') {
        // Callee receives offer, sets remote description, then sends answer
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
        // Caller receives answer — P2P connection can now be established
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
            // Queue candidates received before remote description is set
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
   * Initiate call offer — called by the caller side only.
   * Protected by offerCreated flag to prevent duplicate offers.
   */
  async createCallOffer(currentUserId = '') {
    if (!this.peerConnection) return;

    // CRITICAL FIX: Simple boolean guard — once an offer has been created,
    // never create another one. The previous condition
    // `offerCreated && signalingState !== 'stable'` was wrong:
    // after a successful offer/answer exchange, signalingState returns to 'stable',
    // making the condition FALSE and allowing a second offer to be created,
    // which triggered the InvalidStateError on the callee side.
    if (this.offerCreated) {
      console.warn('[WebRTC] createCallOffer skipped — offer already created for this session.');
      return;
    }

    this.offerCreated = true;
    try {
      console.log('[WebRTC] Creating call offer...');
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      window.supabaseService.sendSignalingMessage({
        type: 'offer',
        offer: offer,
        senderId: currentUserId || this.currentUserId
      });
      console.log('[WebRTC] Offer sent to callee.');
    } catch (err) {
      this.offerCreated = false; // Allow retry only on failure
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
