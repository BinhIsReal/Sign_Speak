# Sign Speak — Nền Tảng Video Call Phiên Dịch Ngôn Ngữ Ký Hiệu Thời Gian Thực

**Sign Speak** là nền tảng giao tiếp và gọi video hai chiều thông minh, kết hợp công nghệ **WebRTC P2P**, **Computer Vision (MediaPipe Holistic)** và **Dynamic Time Warping (DTW)** nhằm xóa bỏ rào cản giao tiếp giữa người khiếm thính (sử dụng Ngôn ngữ Ký hiệu Việt Nam - VSL) và người nghe nói bình thường.

---

## ✨ Tính Năng Chính

### 1. 📹 Cuộc Gọi Video Hai Chiều (WebRTC Realtime)
- Kết nối âm thanh và hình ảnh P2P trực tiếp với độ trễ thấp thông qua `RTCPeerConnection`.
- Cơ chế Signaling thời gian thực qua kênh **Supabase Realtime Broadcast**.
- Hỗ trợ phòng gọi bảo mật, tự động tạo mã phòng ngẫu nhiên và quản lý trạng thái kết nối.

### 2. 🤖 Nhận Diện Cử Chỉ Ký Hiệu Bằng AI (Computer Vision Pipeline)
- **MediaPipe Holistic**: Trích xuất landmark bàn tay (Hands), tư thế (Pose) và gương mặt (Face).
- **196D Feature Engineering**:
  - 126D Tọa độ chuẩn hóa 2 bàn tay theo khớp cổ tay và tỉ lệ cơ thể.
  - 10D Tỷ lệ duỗi các ngón tay (Finger Extension Ratios).
  - 6D Vector hướng ngón cái 3D (Thumb Direction Vector) giúp phân biệt chính xác các ký tự tương đồng (như Y và I).
  - 9D Đặc trưng không gian tương quan giữa hai tay (Inter-Hand Spatial Features).
  - 12D Tọa độ vai & khuỷu tay (Pose landmarks) dự phòng khi bị che khuất.
  - 33D Biểu cảm khuôn mặt và khẩu hình miệng.
- **DTW Classifier (Dynamic Time Warping)**:
  - So khớp chuỗi chuyển động biến đổi độ dài với ràng buộc Sakoe-Chiba Band.
  - Phân loại ngưỡng thích ứng 3 tầng (3-Tier Adaptive Thresholding): 1 tay, 2 tay tĩnh, 2 tay chuyển động liên tục.
  - Giải quyết nhầm lẫn cặp ký hiệu (Confusion Pair Disambiguation - CPD).
- **Occlusion Handler**: Tự động ước lượng tọa độ khi bàn tay bị che khuất ngắn hạn hoặc đè lên nhau.

### 3. 🗣️ Chuyển Đổi Ký Hiệu ↔ Giọng Nói Hai Chiều
- **Sign-to-Speech (Ký hiệu sang Giọng nói)**: Cử chỉ nhận diện được dịch thành văn bản phụ đề và tự động phát âm tự nhiên qua TTS Service.
- **Speech-to-Sign (Giọng nói sang Phụ đề/Ký hiệu)**: Giọng nói từ người nghe được chuyển thành văn bản tức thì qua Web Speech API (STT).

### 4. 👥 Quản Lý Danh Bạ & Trạng Thái Trực Tuyến
- Tìm kiếm, thêm bạn bè, quản lý danh bạ theo thời gian thực.
- Gọi trực tiếp 1-chạm tới liên hệ trong danh bạ với thông báo cuộc gọi đến.

### 5. ♿ Tùy Biến Trợ Năng & Giao Diện (Accessibility)
- Đầy đủ chế độ **Dark Mode / Light Mode**.
- Tùy chỉnh kích thước phụ đề, độ tương phản cao (High Contrast).
- 2 chế độ hiển thị phụ đề: Kính mờ phủ trên video (Glassmorphism Overlay) hoặc Thanh phụ đề cố định (Fixed Subtitle Bar).

---

## 🛠️ Công Nghệ Sử Dụng

| Thành phần | Công nghệ |
|---|---|
| **Frontend** | HTML5, CSS3 (Modern Vanilla CSS / Glassmorphism), JavaScript ES6+ |
| **Computer Vision / AI** | MediaPipe Holistic, MediaPipe Hands, Custom DTW Classifier (196D) |
| **Realtime & WebRTC** | WebRTC API, Google STUN / OpenRelay TURN |
| **Backend as a Service** | Supabase (PostgreSQL, Row Level Security, Auth, Realtime Broadcast) |
| **Speech Processing** | Web Speech Recognition API (`vi-VN`), TTS Audio Synthesis |
| **Deployment** | Vercel Serverless Platform |

---

## 📁 Cấu Trúc Dự Án

```
Sign_Speak/
├── index.html              # Trang giới thiệu / Landing Page
├── login.html              # Trang đăng nhập
├── register.html           # Trang đăng ký tài khoản
├── menu.html               # Trung tâm điều hướng & bảng tính năng
├── call.html               # Phòng gọi video & nhận diện ký hiệu trực tiếp
├── contacts.html           # Quản lý danh bạ & bạn bè
├── profile.html            # Hồ sơ người dùng & cài đặt vai trò
├── settings.html           # Cài đặt trợ năng, âm thanh, camera & phụ đề
├── benchmark.html          # Môi trường kiểm thử độ chính xác nhận diện AI
├── gesture_collector.html  # Công cụ thu thập mẫu dữ liệu ký hiệu VSL
├── css/
│   └── style.css           # Design System & Token CSS toàn dự án
├── js/
│   ├── call_controller.js      # Điều khiển phòng gọi & luồng AI thời gian thực
│   ├── chat_controller.js      # Quản lý tin nhắn trong cuộc gọi
│   ├── contacts_controller.js  # Xử lý danh bạ & Realtime Presence
│   ├── profile_controller.js   # Cập nhật hồ sơ & tùy chọn trợ năng
│   ├── settings_controller.js  # Lưu trữ cấu hình thiết bị & giao diện
│   ├── collector_controller.js # Thu thập và xuất dataset cử chỉ
│   ├── sidebar_component.js    # Thanh điều hướng dùng chung
│   ├── cv/
│   │   ├── feature_extractor.js   # Trích xuất vector đặc trưng 196D
│   │   ├── dtw_classifier.js      # Thuật toán so khớp DTW & CPD
│   │   ├── occlusion_handler.js   # Xử lý che khuất và 2 tay đè nhau
│   │   ├── gesture_context.js     # Quản lý ngữ cảnh động của cử chỉ
│   │   └── vsl_dataset_adapter.js # Bộ chuyển đổi định dạng Dataset VSL
│   └── services/
│       ├── supabase_client.js          # Kết nối Supabase SDK & Database
│       ├── webrtc_service.js           # Xử lý kết nối WebRTC P2P
│       ├── tts_service.js              # Dịch vụ Text-to-Speech
│       ├── stt_service.js              # Dịch vụ Speech-to-Text
│       ├── push_notification_service.js # Thông báo đẩy cuộc gọi
│       └── context_resolver.js         # Xử lý ngữ cảnh câu từ
├── api/                    # Serverless APIs
├── assets/                 # Dữ liệu tĩnh & biểu tượng
└── supabase/               # SQL Migrations & Database Schema
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Cục Bộ

### Yêu Cầu
- Trình duyệt hiện đại hỗ trợ WebRTC và Web Speech API (Google Chrome hoặc Microsoft Edge).
- Thiết bị có Camera / Webcam và Microphone.
- Máy chủ web cục bộ (XAMPP Apache, Live Server trên VS Code, hoặc `npx serve`).

### Các Bước Thực Hiện

1. **Clone mã nguồn:**
   ```bash
   git clone https://github.com/BinhIsReal/Sign_Speak.git
   cd Sign_Speak
   ```

2. **Cấu hình Biến Môi Trường (nếu chạy local với Supabase riêng):**
   - Đảm bảo thông tin `SUPABASE_URL` và `SUPABASE_ANON_KEY` trong `js/services/supabase_client.js` trỏ đúng vào dự án Supabase của bạn.

3. **Chạy ứng dụng:**
   - Mở dự án qua **Live Server** trong VS Code hoặc đặt trong thư mục `htdocs` của XAMPP và truy cập `http://localhost/Sign_Speak/`.

---

## 🔒 Bảo Mật & Quyền Riêng Tư

- **P2P Encryption**: Luồng video và âm thanh WebRTC được mã hóa đầu cuối trực tiếp giữa 2 thiết bị người dùng.
- **Row Level Security (RLS)**: Cơ sở dữ liệu Supabase được phân quyền chặt chẽ theo `auth.uid()`, bảo vệ thông tin cá nhân và lịch sử danh bạ.
- **Client-Side AI**: Quá trình xử lý hình ảnh và nhận diện cử chỉ diễn ra 100% trên trình duyệt của người dùng, không truyền tải luồng camera thô lên máy chủ.
