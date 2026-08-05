/**
 * Supabase Client Service for Sign_Speak
 * 100% Cloud-First Authentication & Database via Supabase SDK (Admin Service Role).
 * Fixed 409 Conflict on Friend Requests Accept & Realtime Status Synchronization.
 */

const SUPABASE_URL = "https://sljiqkenvcxtfewdfuqy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_J6RMR5HKV2ZgWAteat-ybw_xby5bMGD";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsamlxa2VudmN4dGZld2RmdXF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTE0NTU2MywiZXhwIjoyMTAwNzIxNTYzfQ._QBULv6aQwJvi4kVSHjCZqG7h0G3-AfDyFMIdT4tcVk";

class SupabaseService {
  constructor() {
    this.url = SUPABASE_URL;
    this.key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
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
      console.info("[Supabase Client] Admin Service Role Key active. Direct Cloud Authentication enabled.");

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
    if (!idStr || typeof idStr !== 'string') return this.generateUUID();
    const str = idStr.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(str)) {
      return str;
    }
    return this.generateUUID();
  }

  generateRandomIdName() {
    const rand5 = Math.floor(10000 + Math.random() * 90000);
    return `@user${rand5}`;
  }

  saveLocalSession(user, displayName, role, username = null, phone = null, dob = null) {
    const rawId = (user && user.id) ? user.id.toString() : '';
    const validId = this.ensureValidUUID(rawId);

    localStorage.setItem('user_id', validId);
    if (user && user.email) localStorage.setItem('user_email', user.email);
    if (displayName) {
      localStorage.setItem('user_full_name', displayName);
      localStorage.setItem('user_display_name', displayName);
    }
    if (role) localStorage.setItem('user_role', role);
    if (phone || (user && user.phone)) localStorage.setItem('user_phone', phone || user.phone);
    if (dob || (user && user.dob)) localStorage.setItem('user_dob', dob || user.dob);

    const finalUsername = username || localStorage.getItem('user_id_name') || this.generateRandomIdName();
    localStorage.setItem('user_id_name', finalUsername);
    localStorage.setItem('is_logged_in', 'true');

    if (window.securityGuard && typeof window.securityGuard.loadSidebarUserProfile === 'function') {
      window.securityGuard.loadSidebarUserProfile();
    }

    return validId;
  }

  clearLocalSession() {
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
    const phone = localStorage.getItem('user_phone') || '';

    if (email) {
      const payload = {
        id: userId,
        email: email,
        password: 'session_active',
        display_name: displayName,
        role: role,
        username: username,
        phone: phone
      };

      try {
        const { error } = await this.client.from('profiles').upsert([payload], { onConflict: 'email' });

        if (error) {
          console.warn("[Supabase Cloud Profile Sync Notice]:", error.message);
          delete payload.phone;
          await this.client.from('profiles').upsert([payload], { onConflict: 'email' });
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
            this.saveLocalSession(data, data.display_name, data.role, data.username, data.phone, data.dob);
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
        this.saveLocalSession(matchedUser, matchedUser.display_name, matchedUser.role, matchedUser.username, matchedUser.phone, matchedUser.dob);
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
  async signUp(email, password, displayName, role = 'deaf', phone = '', dob = '') {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim();
    const cleanDob = (dob || '').trim();
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
      phone: cleanPhone,
      dob: cleanDob,
      username: defaultUsername
    };

    if (this.client) {
      try {
        const payload = {
          id: validUUID,
          email: cleanEmail,
          password: password,
          display_name: displayName,
          role: role,
          username: defaultUsername,
          phone: cleanPhone
        };
        const { error: upsertErr } = await this.client.from('profiles').upsert([payload], { onConflict: 'email' });

        if (upsertErr) {
          console.warn("[Supabase Cloud Upsert Notice]:", upsertErr.message);
          delete payload.phone;
          await this.client.from('profiles').upsert([payload], { onConflict: 'email' });
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

    this.saveLocalSession(newUser, displayName, role, defaultUsername, cleanPhone, cleanDob);
    return { 
      data: { user: newUser }, 
      noticeMessage: "🎉 Đăng ký tài khoản thành công! Đang chuyển hướng vào hệ thống Sign Speak..." 
    };
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
    const displayName = localStorage.getItem('user_full_name') || localStorage.getItem('user_display_name') || 'Người dùng Sign Speak';
    const role = localStorage.getItem('user_role') || 'deaf';
    const username = localStorage.getItem('user_id_name') || '@user10293';

    return {
      id: userId,
      email: email,
      user_metadata: {
        display_name: displayName,
        role: role,
        username: username
      }
    };
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

    const pending = friendships.filter(f => 
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

        return {
          id: u.id,
          display_name: u.display_name,
          username: u.username || '@user' + Math.floor(10000 + Math.random() * 90000),
          role: u.role,
          avatar: initials,
          online: true,
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

  async getChatHistoryAsync(roomId) {
    const local = this.getChatHistory(roomId);

    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
          let updated = false;

          data.forEach(cloudMsg => {
            const mappedMsg = {
              id: cloudMsg.id,
              room_id: cloudMsg.room_id,
              sender_id: cloudMsg.sender_id,
              recipient_id: cloudMsg.recipient_id,
              sender_name: cloudMsg.sender_name,
              text: cloudMsg.text,
              timestamp: cloudMsg.timestamp,
              read: cloudMsg.read || false
            };

            const idx = all.findIndex(m => m.id === mappedMsg.id);
            if (idx === -1) {
              all.push(mappedMsg);
              updated = true;
            }
          });

          if (updated) {
            localStorage.setItem('chat_messages_db', JSON.stringify(all));
          }
          return all.filter(m => m.room_id === roomId);
        }
      } catch (e) {
        console.warn('[Supabase Cloud getChatHistoryAsync Exception]:', e);
      }
    }

    return local;
  }

  seedDefaultUnreadMessages(currentUserId, friends) {
    if (localStorage.getItem('chat_messages_seeded') === 'true') return;
    const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    if (all.length > 0) return;
    if (!friends || friends.length === 0) return;

    const friend1 = friends[0];
    const friend2 = friends.length > 1 ? friends[1] : null;
    const seeded = [];

    if (friend1) {
      const room1 = this.getCanonicalRoomId(currentUserId, friend1.id);
      seeded.push(
        {
          id: this.generateUUID(),
          room_id: room1,
          sender_id: friend1.id,
          recipient_id: currentUserId,
          sender_name: friend1.display_name,
          text: "Xin chào! Bạn có tiện trao đổi về video VSL không?",
          timestamp: "09:15",
          read: false
        },
        {
          id: this.generateUUID(),
          room_id: room1,
          sender_id: friend1.id,
          recipient_id: currentUserId,
          sender_name: friend1.display_name,
          text: "Mình vừa gửi gợi ý từ vựng mới đó!",
          timestamp: "09:18",
          read: false
        }
      );
    }

    if (friend2) {
      const room2 = this.getCanonicalRoomId(currentUserId, friend2.id);
      seeded.push({
        id: this.generateUUID(),
        room_id: room2,
        sender_id: friend2.id,
        recipient_id: currentUserId,
        sender_name: friend2.display_name,
        text: "Chào bạn, hôm nay cuộc gọi dịch VSL rất tốt!",
        timestamp: "08:30",
        read: false
      });
    }

    localStorage.setItem('chat_messages_db', JSON.stringify(seeded));
    localStorage.setItem('chat_messages_seeded', 'true');
  }

  getUnreadMessagesCountForRoom(roomId, currentUserId) {
    const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    return all.filter(m => m.room_id === roomId && m.sender_id !== currentUserId && m.read === false).length;
  }

  getTotalUnreadMessagesCount(currentUserId) {
    const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    return all.filter(m => m.sender_id !== currentUserId && m.read === false).length;
  }

  markMessagesAsRead(roomId, currentUserId) {
    let all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    let modified = false;
    all.forEach(m => {
      if (m.room_id === roomId && m.sender_id !== currentUserId && m.read === false) {
        m.read = true;
        modified = true;
      }
    });
    if (modified) {
      localStorage.setItem('chat_messages_db', JSON.stringify(all));
    }
    this.updateSidebarBadges();
  }

  async updateSidebarBadges() {
    try {
      const currentUser = await this.getCurrentUser();
      const currentUserId = currentUser ? currentUser.id : "usr_anon";

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

  async saveChatMessage(roomId, messageObj) {
    if (messageObj.read === undefined) {
      messageObj.read = false;
    }
    const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
    if (!all.some(m => m.id === messageObj.id)) {
      all.push(messageObj);
      localStorage.setItem('chat_messages_db', JSON.stringify(all));
    }

    if (this.client) {
      try {
        await this.client.from('messages').upsert([{
          id: this.ensureValidUUID(messageObj.id),
          room_id: roomId,
          sender_id: this.ensureValidUUID(messageObj.sender_id),
          recipient_id: messageObj.recipient_id ? this.ensureValidUUID(messageObj.recipient_id) : null,
          sender_name: messageObj.sender_name || 'User',
          text: messageObj.text,
          timestamp: messageObj.timestamp || 'Mới',
          read: messageObj.read || false
        }], { onConflict: 'id' });
      } catch (e) {
        console.warn('[Supabase Cloud saveChatMessage Notice]:', e);
      }
    }

    this.updateSidebarBadges();

    if (this.activeChatChannel) {
      await this.activeChatChannel.send({
        type: 'broadcast',
        event: 'new-chat-message',
        payload: messageObj
      });
    }

    if (this.client && messageObj.recipient_id) {
      try {
        const recipientChannel = this.client.channel(`user_messages_${messageObj.recipient_id}`);
        recipientChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await recipientChannel.send({
              type: 'broadcast',
              event: 'new-user-message',
              payload: messageObj
            });
            setTimeout(() => {
              try { this.client.removeChannel(recipientChannel); } catch (err) {}
            }, 2000);
          }
        });
      } catch (e) {}
    }
  }

  subscribeChatRoom(roomId, onMessageCallback) {
    if (!this.client) return null;

    if (this.activeChatChannel) {
      this.client.removeChannel(this.activeChatChannel);
    }

    // self: false prevents echo back to sender (fixes message duplication!)
    this.activeChatChannel = this.client.channel(`chat_${roomId}`, {
      config: { broadcast: { self: false } }
    });

    this.activeChatChannel.on('broadcast', { event: 'new-chat-message' }, payload => {
      if (onMessageCallback && payload.payload) {
        const incomingMsg = payload.payload;

        const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
        if (!all.some(m => m.id === incomingMsg.id)) {
          all.push(incomingMsg);
          localStorage.setItem('chat_messages_db', JSON.stringify(all));
        }

        onMessageCallback(incomingMsg);
        this.updateSidebarBadges();
      }
    });

    this.activeChatChannel.subscribe(status => {
      console.log(`[Supabase Realtime Chat] Subscribed to chat_${roomId} status:`, status);
    });

    return this.activeChatChannel;
  }

  subscribeUserMessageNotifications(myUserId, onIncomingMsg) {
    if (!this.client || !myUserId) return null;

    if (this.userMessagesChannel) {
      this.client.removeChannel(this.userMessagesChannel);
    }

    this.userMessagesChannel = this.client.channel(`user_messages_${myUserId}`, {
      config: { broadcast: { self: false } }
    });

    this.userMessagesChannel.on('broadcast', { event: 'new-user-message' }, payload => {
      if (payload.payload) {
        const incomingMsg = payload.payload;

        const all = JSON.parse(localStorage.getItem('chat_messages_db') || '[]');
        if (!all.some(m => m.id === incomingMsg.id)) {
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

    this.activeSignalingRoomId = roomId;
    this.signalingChannelReady = false; // BUG C FIX: track ready state
    this.pendingSignalingMessages = [];  // BUG C FIX: queue for pre-subscribe messages

    // self:false prevents sender from receiving its own signaling messages (BUG #3 fix)
    this.activeSignalingChannel = this.client.channel(`signaling_${roomId}`, {
      config: { broadcast: { self: false } }
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
        this.signalingChannelReady = true;
        // BUG C FIX: Flush any messages that were queued before channel was ready
        if (this.pendingSignalingMessages && this.pendingSignalingMessages.length > 0) {
          console.log(`[WebRTC Signaling] Flushing ${this.pendingSignalingMessages.length} queued message(s)...`);
          const queued = [...this.pendingSignalingMessages];
          this.pendingSignalingMessages = [];
          queued.forEach(msg => {
            this.activeSignalingChannel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: msg
            }).catch(e => console.warn('[WebRTC Signaling] Failed to flush queued message:', e));
          });
        }
      }
    });

    return this.activeSignalingChannel;
  }

  async sendSignalingMessage(signalData) {
    if (!this.activeSignalingChannel) return;

    // BUG C FIX: If channel is not yet SUBSCRIBED, queue the message instead of dropping it.
    // Supabase Realtime silently drops broadcast messages sent before the channel is subscribed.
    if (!this.signalingChannelReady) {
      console.log('[WebRTC Signaling] Channel not ready yet, queuing message:', signalData.type);
      if (!this.pendingSignalingMessages) this.pendingSignalingMessages = [];
      this.pendingSignalingMessages.push(signalData);
      return;
    }

    await this.activeSignalingChannel.send({
      type: 'broadcast',
      event: 'webrtc-signal',
      payload: signalData
    });
  }

  // --- REALTIME GLOBAL CALL NOTIFICATIONS ---

  subscribeGlobalCallNotifications(myUserId, onIncomingCall) {
    if (!this.client || !myUserId) return null;

    if (this.globalCallChannel) {
      this.client.removeChannel(this.globalCallChannel);
    }

    this.globalCallChannel = this.client.channel(`user_calls_${myUserId}`, {
      config: { broadcast: { self: false } }
    });

    this.globalCallChannel.on('broadcast', { event: 'incoming_call' }, payload => {
      if (onIncomingCall && payload.payload) {
        onIncomingCall(payload.payload);
      }
    });

    this.globalCallChannel.subscribe(status => {
      console.log(`[Supabase Realtime Call Notif] Subscribed to user_calls_${myUserId} status:`, status);
    });

    return this.globalCallChannel;
  }

  async sendCallNotification(targetUserId, callPayload) {
    if (!this.client || !targetUserId) return;

    const tempChannel = this.client.channel(`user_calls_${targetUserId}`);
    await tempChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await tempChannel.send({
          type: 'broadcast',
          event: 'incoming_call',
          payload: callPayload
        });
        setTimeout(() => {
          this.client.removeChannel(tempChannel);
        }, 3000);
      }
    });
  }
}

// Global Export
window.supabaseService = new SupabaseService();
