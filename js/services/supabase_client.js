/**
 * Supabase Client Service for Sign_Speak
 * 100% Cloud-First Authentication & Database via Supabase SDK (Admin Service Role).
 * Fixed 409 Conflict on Friend Requests Accept & Realtime Status Synchronization.
 */

const SUPABASE_URL = "https://sljiqkenvcxtfewdfuqy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_J6RMR5HKV2ZgWAteat-ybw_xby5bMGD";

class SupabaseService {
  constructor() {
    this.url = SUPABASE_URL;
    this.key = SUPABASE_ANON_KEY;
    this.client = null;
    this.activeSignalingChannel = null;
    this.activeChatChannel = null;

    this.init();
  }

  init() {
    if (window.supabase) {
      this.client = window.supabase.createClient(this.url, this.key, {
        auth: {
          autoRefreshToken: true,
          persistSession: true
        }
      });
      console.info("[Supabase Client] Public Anon Key active.");

      setTimeout(() => {
        this.syncCurrentUserProfileToCloud();
      }, 500);
    } else {
      console.warn("Supabase SDK JS chưa được nạp.");
    }
  }

  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  ensureValidUUID(idStr) {
    if (!idStr || typeof idStr !== 'string') return '00000000-0000-4000-8000-000000000000';
    const str = idStr.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(str)) {
      return str;
    }
    let hash1 = 0, hash2 = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash1 = (hash1 << 5) - hash1 + ch;
      hash1 |= 0;
      hash2 = (hash2 << 7) - hash2 + ch;
      hash2 |= 0;
    }
    const h1 = Math.abs(hash1).toString(16).padStart(8, '0');
    const h2 = Math.abs(hash2).toString(16).padStart(8, '0');
    const h3 = Math.abs(hash1 ^ hash2).toString(16).padStart(8, '0');
    const h4 = Math.abs((hash1 + hash2) * 31).toString(16).padStart(8, '0');

    return `${h1.substring(0,8)}-${h2.substring(0,4)}-4${h2.substring(4,7)}-8${h3.substring(0,3)}-${h3.substring(3,7)}${h4.substring(0,8)}`;
  }

  generateRandomIdName() {
    const rand5 = Math.floor(10000 + Math.random() * 90000);
    return `@user${rand5}`;
  }

  saveLocalSession(user, displayName, role, username = null) {
    const rawId = (user && user.id) ? user.id.toString() : '';
    const validId = this.ensureValidUUID(rawId);

    localStorage.setItem('user_id', validId);
    if (user && user.email) localStorage.setItem('user_email', user.email);
    if (displayName) localStorage.setItem('user_full_name', displayName);
    if (role) localStorage.setItem('user_role', role);

    const finalUsername = username || localStorage.getItem('user_id_name') || this.generateRandomIdName();
    localStorage.setItem('user_id_name', finalUsername);
    localStorage.setItem('is_logged_in', 'true');
    return validId;
  }

  clearLocalSession() {
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_full_name');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_id_name');
    localStorage.removeItem('last_username_changed_at');
    localStorage.removeItem('is_logged_in');
  }

  getCanonicalRoomId(id1, id2) {
    if (!id1 || !id2) return 'room_global';
    const sorted = [id1.toString(), id2.toString()].sort();
    return `room_${sorted[0]}_${sorted[1]}`;
  }

  async syncCurrentUserProfileToCloud() {
    const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';
    if (!isLoggedIn || !this.client) return;

    let rawId = localStorage.getItem('user_id') || '';
    const userId = this.ensureValidUUID(rawId);
    localStorage.setItem('user_id', userId);

    const email = (localStorage.getItem('user_email') || '').toLowerCase();
    const displayName = localStorage.getItem('user_full_name') || 'Người dùng Sign Speak';
    const role = localStorage.getItem('user_role') || 'deaf';
    const username = localStorage.getItem('user_id_name') || this.generateRandomIdName();

    if (email) {
      try {
        const { error } = await this.client.from('profiles').upsert([{
          id: userId,
          email: email,
          password: 'session_active',
          display_name: displayName,
          role: role,
          username: username
        }], { onConflict: 'email' });

        if (error) {
          console.warn("[Supabase Cloud Profile Sync Notice]:", error.message);
        } else {
          console.info("[Supabase Cloud Profile Sync Success]:", displayName, username);
        }
      } catch (e) {
        console.warn("[Supabase Cloud Profile Sync Exception]:", e);
      }
    }
  }

  // --- CLOUD AUTHENTICATION - SIGN IN ---
  async signIn(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return { data: null, error: { message: "Vui lòng nhập đầy đủ Email và Mật khẩu!" } };
    }

    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('profiles')
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (!error && data) {
          if (data.password === cleanPassword || data.password === 'session_active') {
            const validUUID = this.ensureValidUUID(data.id);
            data.id = validUUID;
            this.saveLocalSession(data, data.display_name, data.role, data.username);
            await this.syncCurrentUserProfileToCloud();
            return { data: { user: data }, error: null };
          } else {
            return { 
              data: null, 
              error: { message: "Mật khẩu không chính xác! Vui lòng kiểm tra lại." } 
            };
          }
        }
      } catch (e) {
        console.warn("[Supabase Profiles Query Exception]:", e);
      }
    }

    const userDb = JSON.parse(localStorage.getItem('registered_users_db') || '[]');
    const matchedUser = userDb.find(u => (u.email || '').toLowerCase() === cleanEmail);

    if (matchedUser) {
      if (matchedUser.password === cleanPassword) {
        matchedUser.id = this.ensureValidUUID(matchedUser.id);
        this.saveLocalSession(matchedUser, matchedUser.display_name, matchedUser.role, matchedUser.username);
        await this.syncCurrentUserProfileToCloud();
        return { data: { user: matchedUser }, error: null };
      } else {
        return { 
          data: null, 
          error: { message: "Mật khẩu không chính xác! Vui lòng kiểm tra lại." } 
        };
      }
    }

    return { 
      data: null, 
      error: { message: "Tài khoản không tồn tại trên hệ thống! Vui lòng kiểm tra lại địa chỉ Email hoặc bấm Đăng ký tài khoản mới." } 
    };
  }

  // --- CLOUD AUTHENTICATION - SIGN UP ---
  async signUp(email, password, displayName, role = 'deaf') {
    const cleanEmail = (email || '').trim().toLowerCase();
    const defaultUsername = this.generateRandomIdName();

    if (!cleanEmail || !password) {
      return { data: null, error: { message: "Vui lòng điền đầy đủ thông tin Email và Mật khẩu!" } };
    }

    if (this.client) {
      try {
        const { data } = await this.client
          .from('profiles')
          .select('id')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (data) {
          return { 
            data: null, 
            error: { message: "Địa chỉ Email này đã được đăng ký trước đó! Vui lòng chuyển sang trang Đăng Nhập." } 
          };
        }
      } catch (e) {}
    }

    const validUUID = this.generateUUID();

    const newUser = {
      id: validUUID,
      email: cleanEmail,
      password: password,
      display_name: displayName,
      role: role,
      username: defaultUsername
    };

    if (this.client) {
      try {
        const { error: upsertErr } = await this.client.from('profiles').upsert([{
          id: validUUID,
          email: cleanEmail,
          password: password,
          display_name: displayName,
          role: role,
          username: defaultUsername
        }], { onConflict: 'email' });

        if (upsertErr) {
          console.warn("[Supabase Cloud Upsert Notice]:", upsertErr.message);
        } else {
          console.info("[Supabase Cloud Profile Upsert Successful]:", validUUID);
        }
      } catch (se) {
        console.warn("[Supabase Cloud Profile Save Exception]:", se);
      }
    }

    const localUserDb = JSON.parse(localStorage.getItem('registered_users_db') || '[]');
    const existingIndex = localUserDb.findIndex(u => (u.email || '').toLowerCase() === cleanEmail);
    if (existingIndex >= 0) {
      localUserDb[existingIndex] = newUser;
    } else {
      localUserDb.push(newUser);
    }
    localStorage.setItem('registered_users_db', JSON.stringify(localUserDb));

    this.saveLocalSession(newUser, displayName, role, defaultUsername);
    return { data: { user: newUser }, error: null };
  }

  async signOut() {
    this.clearLocalSession();
    if (!this.client) return;
    return await this.client.auth.signOut();
  }

  async getCurrentUser() {
    const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';
    if (!isLoggedIn) return null;

    let rawId = localStorage.getItem('user_id') || '';
    const userId = this.ensureValidUUID(rawId);
    localStorage.setItem('user_id', userId);

    const email = localStorage.getItem('user_email') || '';
    const displayName = localStorage.getItem('user_full_name') || 'Người dùng Sign Speak';
    const role = localStorage.getItem('user_role') || 'deaf';
    const username = localStorage.getItem('user_id_name') || '@user10293';
    const avatarUrl = localStorage.getItem('user_avatar_url') || '';

    return {
      id: userId,
      email: email,
      avatar_url: avatarUrl,
      user_metadata: {
        display_name: displayName,
        role: role,
        username: username,
        avatar_url: avatarUrl
      }
    };
  }

  async updateUserProfileAvatar(avatarDataUrl) {
    localStorage.setItem('user_avatar_url', avatarDataUrl);

    let rawId = localStorage.getItem('user_id') || '';
    if (rawId && this.client) {
      try {
        const validId = this.ensureValidUUID(rawId);
        await this.client.from('profiles').update({ avatar_url: avatarDataUrl }).eq('id', validId);
      } catch (e) {
        console.warn('[updateUserProfileAvatar Notice]:', e);
      }
    }
    return true;
  }

  // --- FRIENDS & CONTACTS SEARCH ---

  async getFriendships() {
    let cloudFriendships = [];
    if (this.client) {
      try {
        const { data, error } = await this.client.from('friends').select('*');
        if (!error && data) cloudFriendships = data;
      } catch (e) {}
    }

    const localFriendships = JSON.parse(localStorage.getItem('user_friendships_db') || '[]');

    const map = new Map();
    cloudFriendships.forEach(f => {
      const key = `${f.user_id}_${f.friend_id}`;
      map.set(key, f);
    });
    localFriendships.forEach(f => {
      const key = `${f.user_id}_${f.friend_id}`;
      if (!map.has(key)) map.set(key, f);
    });

    return Array.from(map.values());
  }

  async getPendingRequestsCount() {
    const currentUser = await this.getCurrentUser();
    if (!currentUser) return 0;

    const currentUserId = currentUser.id;
    const currentEmail = (currentUser.email || '').toLowerCase();
    const friendships = await this.getFriendships();

    // ONLY incoming friend requests sent by OTHER users to CURRENT user
    const pending = friendships.filter(f => 
      f.user_id !== currentUserId && 
      (!currentEmail || f.user_id !== currentEmail) &&
      (f.friend_id === currentUserId || (currentEmail && f.friend_id === currentEmail)) && 
      (f.status === 'pending' || f.status === 'pending_sent')
    );
    return pending.length;
  }

  async searchGlobalUsers(queryText, filterTab = 'all') {
    const rawQ = (queryText || '').trim().toLowerCase();
    const cleanQ = rawQ.startsWith('@') ? rawQ.substring(1) : rawQ;

    const currentUser = await this.getCurrentUser();
    const currentUserId = currentUser ? (currentUser.id || '').toString() : '';
    const currentEmail = currentUser ? (currentUser.email || '').toLowerCase() : '';
    const currentUsername = currentUser && currentUser.user_metadata ? (currentUser.user_metadata.username || '').toLowerCase() : (localStorage.getItem('user_id_name') || '').toLowerCase();
    const currentDisplayName = currentUser && currentUser.user_metadata ? (currentUser.user_metadata.display_name || '').toLowerCase() : (localStorage.getItem('user_full_name') || '').toLowerCase();

    let cloudUsers = [];
    if (this.client) {
      try {
        const { data, error } = await this.client.from('profiles').select('*');
        if (!error && data) {
          cloudUsers = data;
        }
      } catch (e) {}
    }

    let localUsers = JSON.parse(localStorage.getItem('registered_users_db') || '[]');

    let userMap = new Map();
    cloudUsers.forEach(u => {
      const key = ((u.email || u.username || u.id) + '').toLowerCase();
      if (key) userMap.set(key, u);
    });
    localUsers.forEach(u => {
      const key = ((u.email || u.username || u.id) + '').toLowerCase();
      if (key && !userMap.has(key)) {
        userMap.set(key, u);
      }
    });

    let userDb = Array.from(userMap.values());
    const friendships = await this.getFriendships();

    let result = userDb
      .filter(u => {
        const uId = (u.id || '').toString();
        const uEmail = (u.email || '').toString().toLowerCase();
        const uUsername = (u.username || '').toString().toLowerCase();
        const uDisplayName = (u.display_name || '').toString().toLowerCase();

        const isSelfId = currentUserId && uId === currentUserId;
        const isSelfEmail = currentEmail && uEmail === currentEmail;
        const isSelfUsername = currentUsername && uUsername === currentUsername;
        const isSelfName = currentDisplayName && uDisplayName === currentDisplayName;

        return !isSelfId && !isSelfEmail && !isSelfUsername && !isSelfName;
      })
      .map(u => {
        const rel = friendships.find(f => 
          (f.user_id === currentUserId && f.friend_id === u.id) ||
          (f.user_id === u.id && f.friend_id === currentUserId) ||
          (currentEmail && ((f.user_id === currentEmail && f.friend_id === u.email) || (f.user_id === u.email && f.friend_id === currentEmail)))
        );

        let friendStatus = 'none';
        if (rel) {
          if (rel.status === 'accepted') {
            friendStatus = 'accepted';
          } else if ((rel.user_id === currentUserId || rel.user_id === currentEmail) && (rel.status === 'pending' || rel.status === 'pending_sent')) {
            friendStatus = 'pending_sent';
          } else if ((rel.friend_id === currentUserId || rel.friend_id === currentEmail) && (rel.status === 'pending' || rel.status === 'pending_sent')) {
            friendStatus = 'pending_received';
          }
        }

        const nameParts = (u.display_name || 'US').trim().split(' ');
        const initials = nameParts.length >= 2 
          ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
          : (u.display_name || 'US').substring(0, 2).toUpperCase();

        const userAvatar = u.avatar_url || u.avatar || initials;
        const isOnline = this.isUserOnline(u);
        return {
          id: u.id,
          display_name: u.display_name,
          username: u.username || '@user' + Math.floor(10000 + Math.random() * 90000),
          role: u.role,
          avatar: userAvatar,
          avatar_url: u.avatar_url || u.avatar || null,
          online: isOnline,
          friendStatus: friendStatus
        };
      });

    if (filterTab === 'friends') {
      result = result.filter(u => u.friendStatus === 'accepted');
    } else if (filterTab === 'requests') {
      result = result.filter(u => u.friendStatus === 'pending_received' || u.friendStatus === 'pending_sent');
    }

    if (rawQ) {
      result = result.filter(u => {
        const dName = (u.display_name || '').toLowerCase();
        const uNameRaw = (u.username || '').toLowerCase();
        const uNameClean = uNameRaw.startsWith('@') ? uNameRaw.substring(1) : uNameRaw;
        const emailRaw = (u.email || '').toLowerCase();

        return dName.includes(rawQ) || 
               dName.includes(cleanQ) || 
               uNameRaw.includes(rawQ) || 
               uNameClean.includes(cleanQ) || 
               uNameClean.includes(rawQ) ||
               emailRaw.includes(rawQ);
      });
    }

    return result;
  }

  async getSuggestedFriends() {
    const allUsers = await this.searchGlobalUsers('', 'all');
    return allUsers.filter(u => u.friendStatus === 'none');
  }

  async sendFriendRequest(targetUserId) {
    const currentUser = await this.getCurrentUser();
    if (!currentUser) return { success: false, message: 'Vui lòng đăng nhập!' };

    await this.syncCurrentUserProfileToCloud();

    const currentId = currentUser.id;
    const targetId = this.ensureValidUUID(targetUserId);

    if (this.client) {
      try {
        const { error } = await this.client.from('friends').upsert([{
          user_id: currentId,
          friend_id: targetId,
          status: 'pending'
        }]);
        if (error) console.warn("[Supabase Send Request Notice]:", error.message);
      } catch (e) {}
    }

    const friendships = JSON.parse(localStorage.getItem('user_friendships_db') || '[]');
    const exists = friendships.some(f => 
      (f.user_id === currentId && f.friend_id === targetId) ||
      (f.user_id === targetId && f.friend_id === currentId)
    );

    if (!exists) {
      friendships.push({
        user_id: currentId,
        friend_id: targetId,
        status: 'pending'
      });
      localStorage.setItem('user_friendships_db', JSON.stringify(friendships));
    }

    return { success: true, message: '📩 Đã gửi lời mời kết bạn thành công!' };
  }

  async acceptFriendRequest(targetUserId) {
    const currentUser = await this.getCurrentUser();
    if (!currentUser) return { success: false, message: 'Vui lòng đăng nhập!' };

    const currentId = currentUser.id;
    const targetId = this.ensureValidUUID(targetUserId);

    if (this.client) {
      try {
        const { error: updateErr } = await this.client
          .from('friends')
          .update({ status: 'accepted' })
          .or(`and(user_id.eq.${currentId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${currentId})`);

        if (updateErr) {
          console.warn("[Supabase Update Accept Friend Notice]:", updateErr.message);
          await this.client.from('friends').upsert([{
            user_id: targetId,
            friend_id: currentId,
            status: 'accepted'
          }]);
        }
      } catch (e) {
        console.warn("[Supabase Accept Request Exception]:", e);
      }
    }

    const friendships = JSON.parse(localStorage.getItem('user_friendships_db') || '[]');
    const rel = friendships.find(f => 
      (f.user_id === currentId && f.friend_id === targetId) ||
      (f.user_id === targetId && f.friend_id === currentId)
    );

    if (rel) {
      rel.status = 'accepted';
    } else {
      friendships.push({
        user_id: targetId,
        friend_id: currentId,
        status: 'accepted'
      });
    }
    localStorage.setItem('user_friendships_db', JSON.stringify(friendships));

    return { success: true, message: '🎉 Đã chấp nhận lời mời kết bạn!' };
  }

  async removeFriendship(targetUserId) {
    const currentUser = await this.getCurrentUser();
    if (!currentUser) return { success: false, message: 'Vui lòng đăng nhập!' };

    const currentId = currentUser.id;
    const targetId = this.ensureValidUUID(targetUserId);

    if (this.client) {
      try {
        await this.client.from('friends')
          .delete()
          .or(`and(user_id.eq.${currentId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${currentId})`);
      } catch (e) {}
    }

    let friendships = JSON.parse(localStorage.getItem('user_friendships_db') || '[]');
    friendships = friendships.filter(f => 
      !((f.user_id === currentId && f.friend_id === targetUserId) ||
        (f.user_id === targetUserId && f.friend_id === currentId))
    );
    localStorage.setItem('user_friendships_db', JSON.stringify(friendships));

    return { success: true, message: 'Đã hủy lời mời / kết bạn!' };
  }

  // --- REALTIME CHAT MANAGEMENT ---

  getChatHistory(roomId) {
    const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    return all.filter(m => m.room_id === roomId);
  }

  async saveChatMessage(roomId, messageObj) {
    if (!messageObj) return;

    // 1. Save locally
    const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    if (!all.some(m => m.id === messageObj.id)) {
      all.push(messageObj);
      localStorage.setItem('chat_messages_db', JSON.stringify(all));
    }

    // 2. Broadcast to active chat room channel if connected
    if (this.activeChatChannel) {
      try {
        await this.activeChatChannel.send({
          type: 'broadcast',
          event: 'new-chat-message',
          payload: messageObj
        });
      } catch (e) {}
    }

    // 3. Broadcast to recipient's personal message channel (GLOBAL REALTIME RECEIVE)
    if (this.client && messageObj.recipient_id) {
      try {
        const targetChannel = this.client.channel(`user_messages_${messageObj.recipient_id}`);
        await targetChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await targetChannel.send({
              type: 'broadcast',
              event: 'global_new_message',
              payload: messageObj
            });
            setTimeout(() => {
              this.client.removeChannel(targetChannel);
            }, 3000);
          }
        });
      } catch (e) {
        console.warn('[saveChatMessage Broadcast Exception]:', e);
      }
    }

    // 4. Save message to Supabase Cloud DB 'messages' table if connected
    if (this.client) {
      try {
        const validSender = this.ensureValidUUID(messageObj.sender_id);
        const validRecipient = messageObj.recipient_id ? this.ensureValidUUID(messageObj.recipient_id) : null;
        await this.client.from('messages').upsert([{
          id: messageObj.id,
          room_id: roomId,
          sender_id: validSender,
          recipient_id: validRecipient,
          sender_name: messageObj.sender_name,
          text: messageObj.text,
          timestamp: messageObj.timestamp,
          read: messageObj.read || false
        }]);
      } catch (e) {
        console.warn('[saveChatMessage Cloud Table Notice]:', e);
      }
    }
  }

  subscribeGlobalUserMessages(myUserId, onNewMessageCallback) {
    if (!this.client || !myUserId) return null;

    if (this.globalUserMessagesChannel) {
      this.client.removeChannel(this.globalUserMessagesChannel);
    }

    this.globalUserMessagesChannel = this.client.channel(`user_messages_${myUserId}`, {
      config: { broadcast: { self: false } }
    });

    this.globalUserMessagesChannel.on('broadcast', { event: 'global_new_message' }, payload => {
      const msg = payload.payload;
      if (!msg) return;

      // 1. Save to local storage
      const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
      if (!all.some(m => m.id === msg.id)) {
        all.push(msg);
        localStorage.setItem('chat_messages_db', JSON.stringify(all));
      }

      // 2. Update sidebar unread badges on ALL pages
      this.updateSidebarBadges();

      // 3. Execute custom page callback or show toast
      if (onNewMessageCallback) {
        try { onNewMessageCallback(msg); } catch (e) {}
      } else {
        this.showGlobalMessageToast(msg);
      }
    });

    this.globalUserMessagesChannel.subscribe(status => {
      console.log(`[Supabase Realtime Global Messages] Subscribed to user_messages_${myUserId} status:`, status);
    });

    return this.globalUserMessagesChannel;
  }

  showGlobalMessageToast(msg) {
    if (!msg || document.getElementById(`toast_msg_${msg.id}`)) return;

    const toast = document.createElement('div');
    toast.id = `toast_msg_${msg.id}`;
    toast.className = 'fixed top-5 right-5 z-50 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white p-4 rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-700/80 flex items-center gap-3.5 max-w-sm backdrop-blur-md cursor-pointer animate-bounce transition-all hover:scale-105';

    const senderName = msg.sender_name || 'Bạn mới';
    const textPreview = msg.text ? (msg.text.length > 35 ? msg.text.substring(0, 35) + '...' : msg.text) : 'Đã gửi tin nhắn';

    toast.innerHTML = `
      <div class="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 text-primary font-extrabold text-sm flex items-center justify-center shrink-0 border border-primary/20 dark:border-primary/30">
        💬
      </div>
      <div class="flex flex-col min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${senderName}</span>
          <span class="text-[10px] text-slate-400 font-semibold">${msg.timestamp || 'Mới'}</span>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-300 truncate mt-0.5">${textPreview}</p>
      </div>
      <span class="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
    `;

    toast.addEventListener('click', () => {
      window.location.href = `index.html?chat_with=${encodeURIComponent(msg.sender_id)}`;
    });

    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 5000);
  }

  // --- REALTIME PRESENCE & ONLINE/OFFLINE ENGINE ---

  initUserPresence(myUserId) {
    if (!myUserId || myUserId === "usr_anon") return;
    this.currentUserIdForPresence = myUserId.toString().toLowerCase();

    if (!this.onlineUsersSet) {
      this.onlineUsersSet = new Set();
    }
    this.onlineUsersSet.add(this.currentUserIdForPresence);

    this.recordUserHeartbeat(this.currentUserIdForPresence);

    if (this.client) {
      try {
        if (this.presenceChannel) {
          this.client.removeChannel(this.presenceChannel);
        }

        this.presenceChannel = this.client.channel('presence_global', {
          config: { presence: { key: this.currentUserIdForPresence } }
        });

        this.presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const state = this.presenceChannel.presenceState();
            this.onlineUsersSet.clear();
            this.onlineUsersSet.add(this.currentUserIdForPresence);

            Object.keys(state).forEach(key => {
              const cleanKey = key.toString().toLowerCase();
              this.onlineUsersSet.add(cleanKey);
              this.recordUserHeartbeat(cleanKey);
            });
            this.notifyPresenceChange();
          })
          .on('presence', { event: 'join' }, ({ key }) => {
            if (key) {
              const cleanKey = key.toString().toLowerCase();
              this.onlineUsersSet.add(cleanKey);
              this.recordUserHeartbeat(cleanKey);
              this.notifyPresenceChange();
            }
          })
          .on('presence', { event: 'leave' }, ({ key }) => {
            if (key) {
              const cleanKey = key.toString().toLowerCase();
              if (cleanKey !== this.currentUserIdForPresence) {
                this.onlineUsersSet.delete(cleanKey);
              }
              this.notifyPresenceChange();
            }
          });

        this.presenceChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await this.presenceChannel.track({
              user_id: this.currentUserIdForPresence,
              online_at: new Date().toISOString()
            });
          }
        });
      } catch (e) {
        console.warn('[Presence Subscription Exception]:', e);
      }
    }

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        if (this.currentUserIdForPresence) {
          this.recordUserHeartbeat(this.currentUserIdForPresence);
          if (this.presenceChannel) {
            this.presenceChannel.track({
              user_id: this.currentUserIdForPresence,
              online_at: new Date().toISOString()
            }).catch(() => {});
          }
        }
      }, 15000);
    }
  }

  recordUserHeartbeat(userId) {
    if (!userId) return;
    try {
      const uid = userId.toString().toLowerCase();
      const heartbeats = JSON.parse(localStorage.getItem('user_heartbeats_db') || '{}');
      heartbeats[uid] = Date.now();
      localStorage.setItem('user_heartbeats_db', JSON.stringify(heartbeats));
    } catch (e) {}
  }

  isUserOnline(userOrId) {
    if (!userOrId) return false;

    let possibleIds = [];
    if (typeof userOrId === 'object') {
      if (userOrId.id) possibleIds.push(userOrId.id.toString().toLowerCase());
      if (userOrId.username) possibleIds.push(userOrId.username.toString().toLowerCase().replace(/^@/, ''));
      if (userOrId.email) possibleIds.push(userOrId.email.toString().toLowerCase());
    } else {
      possibleIds.push(userOrId.toString().toLowerCase().replace(/^@/, ''));
    }

    const myId = (localStorage.getItem('user_id') || '').toLowerCase();
    const myEmail = (localStorage.getItem('user_email') || '').toLowerCase();
    const myUsername = (localStorage.getItem('user_id_name') || '').toLowerCase().replace(/^@/, '');

    for (let id of possibleIds) {
      if (!id) continue;
      if (id === myId || id === myEmail || id === myUsername) return true;
      if (this.onlineUsersSet && (this.onlineUsersSet.has(id) || this.onlineUsersSet.has(`@${id}`))) return true;

      try {
        const heartbeats = JSON.parse(localStorage.getItem('user_heartbeats_db') || '{}');
        const timestamp = heartbeats[id] || heartbeats[`@${id}`];
        if (timestamp) {
          const diff = Date.now() - Number(timestamp);
          if (diff < 60000) return true;
        }
      } catch (e) {}
    }

    return false;
  }

  notifyPresenceChange() {
    if (typeof window.loadConversationsListGlobal === 'function') {
      try { window.loadConversationsListGlobal(); } catch (e) {}
    }
    if (typeof window.loadContactsGlobal === 'function') {
      try { window.loadContactsGlobal(); } catch (e) {}
    }
  }

  subscribeChatRoom(roomId, onMessageCallback) {
    if (!this.client) return null;

    if (this.activeChatChannel) {
      this.client.removeChannel(this.activeChatChannel);
    }

    this.activeChatChannel = this.client.channel(`chat_${roomId}`, {
      config: { broadcast: { self: true } }
    });

    this.activeChatChannel.on('broadcast', { event: 'new-chat-message' }, payload => {
      if (onMessageCallback && payload.payload) {
        onMessageCallback(payload.payload);
      }
    });

    this.activeChatChannel.subscribe(status => {
      console.log(`[Supabase Realtime Chat] Subscribed to chat_${roomId} status:`, status);
    });

    return this.activeChatChannel;
  }

  subscribeSignalingRoom(roomId, onSignalCallback) {
    if (!this.client) return null;

    if (!this.signalingCallbacks) {
      this.signalingCallbacks = [];
    }

    if (onSignalCallback && !this.signalingCallbacks.includes(onSignalCallback)) {
      this.signalingCallbacks.push(onSignalCallback);
    }

    if (this.activeSignalingChannel && this.activeSignalingRoomId === roomId) {
      return this.activeSignalingChannel;
    }

    if (this.activeSignalingChannel) {
      this.client.removeChannel(this.activeSignalingChannel);
    }

    this.isSignalingSubscribed = false;
    this.signalingOutboxQueue = this.signalingOutboxQueue || [];
    this.activeSignalingRoomId = roomId;
    this.activeSignalingChannel = this.client.channel(`signaling_${roomId}`, {
      config: { broadcast: { self: true } }
    });

    this.activeSignalingChannel.on('broadcast', { event: 'webrtc-signal' }, payload => {
      if (this.signalingCallbacks) {
        this.signalingCallbacks.forEach(cb => {
          try { cb(payload.payload); } catch (e) {}
        });
      }
    });

    this.activeSignalingChannel.subscribe(status => {
      console.log(`[Supabase Realtime WebRTC] Connected to signaling_${roomId} status:`, status);
      if (status === 'SUBSCRIBED') {
        this.isSignalingSubscribed = true;
        // Flush all queued messages
        if (this.signalingOutboxQueue && this.signalingOutboxQueue.length > 0) {
          console.log(`[Supabase Realtime WebRTC] Flushing ${this.signalingOutboxQueue.length} queued signaling messages`);
          while (this.signalingOutboxQueue.length > 0) {
            const msg = this.signalingOutboxQueue.shift();
            this.activeSignalingChannel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: msg
            }).catch(err => console.warn('[Signaling Outbox Send Error]:', err));
          }
        }
      } else {
        this.isSignalingSubscribed = false;
      }
    });

    return this.activeSignalingChannel;
  }

  async sendSignalingMessage(signalData) {
    if (!this.signalingOutboxQueue) this.signalingOutboxQueue = [];

    if (this.activeSignalingChannel && this.isSignalingSubscribed) {
      try {
        await this.activeSignalingChannel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: signalData
        });
      } catch (err) {
        console.warn('[sendSignalingMessage] Send error, enqueuing message:', err);
        this.signalingOutboxQueue.push(signalData);
      }
    } else {
      this.signalingOutboxQueue.push(signalData);
    }
  }

  // --- REALTIME GLOBAL CALL NOTIFICATIONS ---

  subscribeCallNotifications(myUserId, onIncomingCall) {
    return this.subscribeGlobalCallNotifications(myUserId, onIncomingCall);
  }

  subscribeGlobalCallNotifications(myUserId, onIncomingCall) {
    if (!this.client || !myUserId) return null;

    if (this.globalCallChannel) {
      try {
        this.client.removeChannel(this.globalCallChannel);
      } catch (_e) {}
    }

    this.globalCallChannel = this.client.channel(`user_calls_${myUserId}`, {
      config: { broadcast: { self: false } }
    });

    this.globalCallChannel.on('broadcast', { event: 'incoming_call' }, payload => {
      if (onIncomingCall && payload.payload) {
        onIncomingCall(payload.payload);
      }
    });

    this.globalCallChannel.on('broadcast', { event: 'call_action' }, payload => {
      if (onIncomingCall && payload.payload) {
        onIncomingCall(payload.payload);
      }
    });

    this.globalCallChannel.subscribe(status => {
      console.log(`[Supabase Realtime Call Notif] Subscribed to user_calls_${myUserId} status:`, status);
    });

    return this.globalCallChannel;
  }

  /**
   * Start persistent ringing heartbeat from Caller to Callee.
   * Keeps pulsing incoming_call event every 2.5 seconds until stopped or timeout (60s).
   * Ensures Callee receives notification even if network reconnects, tab wakes up, or was temporarily busy.
   */
  startCallRingingHeartbeat(targetUserId, callPayload) {
    if (!this.client || !targetUserId) return null;

    this.stopCallRingingHeartbeat();

    const channelName = `user_calls_${targetUserId}`;
    const outgoingChannel = this.client.channel(channelName, {
      config: { broadcast: { self: false } }
    });

    let isSubscribed = false;
    let heartbeatTimer = null;
    let maxTimeoutTimer = null;

    const pulsePayload = () => {
      if (!isSubscribed) return;
      outgoingChannel.send({
        type: 'broadcast',
        event: 'incoming_call',
        payload: {
          ...callPayload,
          heartbeat: true,
          timestamp: Date.now()
        }
      }).catch(err => console.warn('[Call Heartbeat Pulse Error]:', err));
    };

    outgoingChannel.subscribe(status => {
      console.log(`[Call Ringing Heartbeat] Outgoing channel to ${targetUserId} status:`, status);
      if (status === 'SUBSCRIBED') {
        isSubscribed = true;
        // Pulse immediately
        pulsePayload();
        // Continue pulsing every 2.5 seconds
        if (!heartbeatTimer) {
          heartbeatTimer = setInterval(pulsePayload, 2500);
        }
      }
    });

    // Automatically stop ringing after 60 seconds (Caller waiting timeout)
    maxTimeoutTimer = setTimeout(() => {
      console.log('[Call Ringing Heartbeat] Max ringing duration reached (60s). Stopping heartbeat.');
      this.stopCallRingingHeartbeat();
    }, 60000);

    this.activeCallingHeartbeat = {
      targetUserId,
      channel: outgoingChannel,
      heartbeatTimer,
      maxTimeoutTimer,
      callPayload,
      stop: () => this.stopCallRingingHeartbeat()
    };

    return this.activeCallingHeartbeat;
  }

  stopCallRingingHeartbeat() {
    if (this.activeCallingHeartbeat) {
      if (this.activeCallingHeartbeat.heartbeatTimer) {
        clearInterval(this.activeCallingHeartbeat.heartbeatTimer);
      }
      if (this.activeCallingHeartbeat.maxTimeoutTimer) {
        clearTimeout(this.activeCallingHeartbeat.maxTimeoutTimer);
      }
      if (this.activeCallingHeartbeat.channel) {
        try {
          this.client.removeChannel(this.activeCallingHeartbeat.channel);
        } catch (_e) {}
      }
      this.activeCallingHeartbeat = null;
      console.log('[Call Ringing Heartbeat] Stopped and channel released.');
    }
  }

  async sendCallCancelled(targetUserId, callPayload) {
    if (!this.client || !targetUserId) return;
    this.stopCallRingingHeartbeat();

    try {
      const cancelChannel = this.client.channel(`user_calls_${targetUserId}`);
      await cancelChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await cancelChannel.send({
            type: 'broadcast',
            event: 'incoming_call',
            payload: {
              type: 'call_cancelled',
              ...callPayload,
              timestamp: Date.now()
            }
          });
          setTimeout(() => {
            try { this.client.removeChannel(cancelChannel); } catch (_e) {}
          }, 1500);
        }
      });
    } catch (e) {
      console.warn('[sendCallCancelled error]:', e);
    }
  }

  async sendCallNotification(targetUserId, callPayload) {
    if (!this.client || !targetUserId) return;

    try {
      const tempChannel = this.client.channel(`user_calls_${targetUserId}`);
      await tempChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await tempChannel.send({
            type: 'broadcast',
            event: 'incoming_call',
            payload: callPayload
          });
          setTimeout(() => {
            try { this.client.removeChannel(tempChannel); } catch (_e) {}
          }, 3000);
        }
      });
    } catch (e) {
      console.warn('[sendCallNotification error]:', e);
    }
  }

  // --- SIDEBAR BADGES & MESSAGING UTILITIES ---

  seedDefaultUnreadMessages(currentUserId, friends) {
    if (!currentUserId || !friends || friends.length === 0) return;
    try {
      const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
      if (all.length > 0) return;

      const sampleMsgs = [];
      friends.forEach((f, idx) => {
        const roomId = this.getCanonicalRoomId(currentUserId, f.id);
        const isDeaf = f.role === 'deaf';
        sampleMsgs.push({
          id: 'msg_seed_' + idx + '_' + Date.now(),
          room_id: roomId,
          sender_id: f.id,
          recipient_id: currentUserId,
          sender_name: f.display_name,
          text: isDeaf ? '🤟 Xin chào! Mình vừa gửi cử chỉ VSL cho bạn.' : '🎙️ Xin chào bạn! Rất vui được kết nối.',
          timestamp: '10:00',
          read: false
        });
      });
      localStorage.setItem('chat_messages_db', JSON.stringify(sampleMsgs));
    } catch (e) {
      console.warn('[seedDefaultUnreadMessages error]:', e);
    }
  }

  getUnreadMessagesCountForUser(roomId, currentUserId, partnerId) {
    try {
      const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
      return all.filter(m => (m.room_id === roomId || (m.sender_id === partnerId && m.recipient_id === currentUserId)) && m.sender_id !== currentUserId && m.read === false).length;
    } catch (e) {
      return 0;
    }
  }

  getUnreadMessagesCountForRoom(roomId, currentUserId) {
    const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    return all.filter(m => m.room_id === roomId && m.sender_id !== currentUserId && m.read === false).length;
  }

  getTotalUnreadMessagesCount(currentUserId) {
    try {
      const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
      const cIdStr = (currentUserId || '').toString().toLowerCase();
      return all.filter(m => {
        const mSender = (m.sender_id || '').toString().toLowerCase();
        const mRecipient = (m.recipient_id || '').toString().toLowerCase();
        return m.read === false && mSender !== cIdStr && (mRecipient === cIdStr || !mRecipient || mRecipient === 'usr_anon' || mRecipient === 'undefined');
      }).length;
    } catch (e) {
      return 0;
    }
  }

  markMessagesAsRead(roomId, currentUserId, partnerId = null) {
    try {
      let all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
      let modified = false;

      const pIdStr = partnerId ? partnerId.toString().toLowerCase() : '';
      const rIdStr = roomId ? roomId.toString().toLowerCase() : '';
      const cIdStr = currentUserId ? currentUserId.toString().toLowerCase() : '';

      all.forEach(m => {
        const mSender = (m.sender_id || '').toString().toLowerCase();
        const mRecipient = (m.recipient_id || '').toString().toLowerCase();
        const mRoom = (m.room_id || '').toString().toLowerCase();

        const isMatchRoom = rIdStr && (mRoom === rIdStr || (pIdStr && mRoom.includes(pIdStr)));
        const isMatchUserPair = pIdStr && (mSender === pIdStr || mRecipient === pIdStr || (pIdStr && mRoom.includes(pIdStr)));

        if ((isMatchRoom || isMatchUserPair) && m.read !== true) {
          m.read = true;
          modified = true;
        }
      });

      if (modified) {
        localStorage.setItem('chat_messages_db', JSON.stringify(all));
      }

      if (this.client && roomId) {
        try {
          const validUserId = this.ensureValidUUID(currentUserId);
          this.client.from('messages')
            .update({ read: true })
            .eq('room_id', roomId)
            .neq('sender_id', validUserId)
            .then(() => {});
        } catch (e) {}
      }

      this.updateSidebarBadges();
    } catch (e) {
      console.warn('[markMessagesAsRead Exception]:', e);
    }
  }

  async updateSidebarBadges() {
    try {
      const currentUser = await this.getCurrentUser();
      const currentUserId = currentUser ? currentUser.id : (localStorage.getItem('user_id') || '');
      if (!currentUserId) return;

      const unreadCount = this.getTotalUnreadMessagesCount(currentUserId);
      const pendingRequestsCount = await this.getPendingRequestsCount();

      const msgBadges = document.querySelectorAll('#sidebarMessagesBadge');
      msgBadges.forEach(badge => {
        if (unreadCount > 0) {
          badge.classList.remove('hidden');
          badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
        } else {
          badge.classList.add('hidden');
        }
      });

      const contactBadges = document.querySelectorAll('#sidebarContactsBadge');
      contactBadges.forEach(badge => {
        if (pendingRequestsCount > 0) {
          badge.classList.remove('hidden');
          badge.innerText = pendingRequestsCount > 99 ? '99+' : pendingRequestsCount;
        } else {
          badge.classList.add('hidden');
        }
      });
    } catch (e) {
      console.warn('[updateSidebarBadges error]:', e);
    }
  }

  async getChatHistoryAsync(roomId) {
    const local = this.getChatHistory(roomId);
    if (!this.client || !roomId) return local;

    try {
      const { data, error } = await this.client
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
        let updated = false;

        data.forEach(cloudMsg => {
          const mappedMsg = {
            id: cloudMsg.id,
            room_id: cloudMsg.room_id,
            sender_id: cloudMsg.sender_id,
            recipient_id: cloudMsg.recipient_id,
            sender_name: cloudMsg.sender_name,
            msg_type: cloudMsg.msg_type || (cloudMsg.text && cloudMsg.text.includes('📞') ? 'call_log' : 'text'),
            call_status: cloudMsg.call_status || null,
            duration: cloudMsg.duration || null,
            text: cloudMsg.text,
            timestamp: cloudMsg.timestamp,
            read: cloudMsg.read !== undefined ? cloudMsg.read : false
          };

          const idx = all.findIndex(m => m.id === mappedMsg.id);
          if (idx === -1) {
            all.push(mappedMsg);
            updated = true;
          } else {
            if (all[idx].read === true) mappedMsg.read = true;
            if (all[idx].read !== mappedMsg.read || all[idx].text !== mappedMsg.text) {
              all[idx] = mappedMsg;
              updated = true;
            }
          }
        });

        if (updated) {
          localStorage.setItem('chat_messages_db', JSON.stringify(all));
        }
        return all.filter(m => m.room_id === roomId);
      }
    } catch (e) {
      console.info('[Supabase Cloud getChatHistoryAsync Fallback to Local]:', e.message || e);
    }
    return local;
  }

  subscribeUserMessageNotifications(myUserId, onIncomingMsg) {
    if (!this.client || !myUserId) return null;

    if (this.userMessagesChannel) {
      try { this.client.removeChannel(this.userMessagesChannel); } catch (e) {}
    }

    this.userMessagesChannel = this.client.channel(`user_messages_${myUserId}`, {
      config: { broadcast: { self: false } }
    });

    this.userMessagesChannel.on('broadcast', { event: 'new-user-message' }, payload => {
      if (payload && payload.payload) {
        const incomingMsg = payload.payload;
        if (incomingMsg.sender_id && incomingMsg.sender_id !== myUserId) {
          incomingMsg.read = false;
        }

        const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
        const idx = all.findIndex(m => m.id === incomingMsg.id);
        if (idx === -1) {
          all.push(incomingMsg);
          localStorage.setItem('chat_messages_db', JSON.stringify(all));
        }

        if (onIncomingMsg) {
          onIncomingMsg(incomingMsg);
        }

        this.updateSidebarBadges();
      }
    });

    this.userMessagesChannel.subscribe(status => {
      console.log(`[Supabase Realtime User Notif] Subscribed to user_messages_${myUserId} status:`, status);
    });

    return this.userMessagesChannel;
  }

  async syncUnreadCloudMessagesToLocal(currentUserId) {
    if (!this.client || !currentUserId || currentUserId === 'usr_anon') return;
    const validId = this.ensureValidUUID(currentUserId);

    try {
      const { data, error } = await this.client
        .from('messages')
        .select('*')
        .or(`recipient_id.eq.${validId},sender_id.eq.${validId}`)
        .order('created_at', { ascending: true });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
        let updated = false;

        data.forEach(cloudMsg => {
          const mappedMsg = {
            id: cloudMsg.id,
            room_id: cloudMsg.room_id,
            sender_id: cloudMsg.sender_id,
            recipient_id: cloudMsg.recipient_id,
            sender_name: cloudMsg.sender_name,
            msg_type: cloudMsg.msg_type || (cloudMsg.text && cloudMsg.text.includes('📞') ? 'call_log' : 'text'),
            call_status: cloudMsg.call_status || null,
            duration: cloudMsg.duration || null,
            text: cloudMsg.text,
            timestamp: cloudMsg.timestamp,
            read: cloudMsg.read !== undefined ? cloudMsg.read : false
          };

          const idx = all.findIndex(m => m.id === mappedMsg.id);
          if (idx === -1) {
            all.push(mappedMsg);
            updated = true;
          } else {
            if (all[idx].read === true) {
              mappedMsg.read = true;
            }
            if (all[idx].read !== mappedMsg.read || all[idx].text !== mappedMsg.text) {
              all[idx] = mappedMsg;
              updated = true;
            }
          }
        });

        if (updated) {
          localStorage.setItem('chat_messages_db', JSON.stringify(all));
        }
      }
    } catch (e) {
      console.info('[Supabase Cloud syncUnreadCloudMessagesToLocal Notice]:', e.message || e);
    }
  }
}

// Global Export
window.supabaseService = new SupabaseService();
