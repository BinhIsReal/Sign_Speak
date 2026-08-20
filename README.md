# Sign_Speak - Hệ Thống Dịch Ngôn Ngữ Ký Hiệu Việt Nam

Ứng dụng web đột phá sử dụng Trí tuệ Nhân tạo (AI) và Computer Vision để phiên dịch Ngôn ngữ Ký hiệu thành văn bản và giọng nói theo thời gian thực.

---

## 🌟 Tính Năng Nổi Bật

### 🎯 Phiên Dịch Thời Gian Thực

- **Nhận diện cử chỉ bằng AI:** Sử dụng MediaPipe Hands với độ chính xác cao để phân tích chuyển động tay, vị trí và tư thế.
- **Chế độ song ngữ:** Tự động phát hiện và dịch thuật giữa ngôn ngữ ký hiệu và Tiếng Việt.

### 🧩 Trí Tuệ Học Tập & Thích Ứng

- **Học tập cá nhân hóa (Adaptive Learning):** Hệ thống tự động học và nâng cao độ chính xác dựa trên phản hồi của người dùng.
- **Machine Learning tiên tiến:** Kết hợp Dynamic Time Warping (DTW) và Neural Networks để giải quyết tính đa dạng trong cách thể hiện của người dùng.

### 🎮 Trải Nghiệm Tương Tác

- **Game hóa (Gamification):** Tích hợp Mini Game để biến quá trình học trở nên thú vị và hấp dẫn hơn.
- **Đề xuất từ vựng thông minh:** Gợi ý các ký hiệu và từ vựng liên quan dựa trên ngữ cảnh sử dụng.

### 🌐 Cộng Đồng & Kết Nối

- **Mạng xã hội học tập:** Nơi người dùng có thể giao lưu, chia sẻ và hỗ trợ lẫn nhau trong quá trình học.
- **Hệ thống xếp hạng:** Bảng xếp hạng (Leaderboard) cạnh tranh lành mạnh thúc đẩy sự tiến bộ.

### 📊 Phân Tích & Báo Cáo

- **Dashboard chi tiết:** Cung cấp các chỉ số trực quan về tiến độ học tập và hiệu suất nhận diện.
- **Biên dịch đa phương tiện:** Hỗ trợ nhận diện cả video quay sẵn và luồng camera trực tiếp.

---

## 🛠️ Công Nghệ Sử Dụng

- **Frontend:** HTML, Tailwind CSS, JavaScript.
- **AI/ML Frameworks:**
  - **MediaPipe Hands:** Nhận diện cấu trúc bàn tay thời gian thực.
  - **Dynamic Time Warping (DTW):** So sánh và phân loại chuỗi cử chỉ.
  - **Neural Networks (Keras/TensorFlow):** Học hỏi mẫu hình phức tạp.
- **Backend & Database:**
  - **Supabase:** Cơ sở dữ liệu và xác thực người dùng (Authentication).
  - **Vercel / Firebase:** Triển khai ứng dụng.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy

### Yêu Cầu Hệ Thống

- Trình duyệt web hiện đại (Chrome, Edge, Firefox).
- Webcam cho tính năng nhận diện trực tiếp.

### Các Bước Khởi Động

1.  **Clone Repository:**

    ```bash
    git clone <repository-url>
    cd Sign_Speak
    ```

2.  **Cấu hình Supabase:**
    - Tạo dự án mới trên [Supabase](https://supabase.com).
    - Lấy URL và Public Key trong phần Settings -> API.
    - Cập nhật file `js/services/supabase_client.js`:
      ```javascript
      const SUPABASE_URL = "YOUR_SUPABASE_URL";
      const SUPABASE_KEY = "YOUR_SUPABASE_KEY";
      ```

3.  **Chạy Ứng Dụng:**
    - Sử dụng **Live Server** (Extension trong VS Code) hoặc **NPM** để chạy local.
    - Mở `index.html` trong trình duyệt.

---

## 📂 Cấu Trúc Thư Mục

```
Sign_Speak/
├── camera.html             # Trang nhận diện Camera trực tiếp
├── translator.html         # Công cụ Dịch giả Song ngữ
├── game.html               # Mini Game học ký hiệu
├── contacts.html           # Mạng xã hội học tập
├── settings.html           # Cài đặt hệ thống
├── stats.html              # Thống kê & Báo cáo
├── index.html              # Trang chủ landing page
├── css/
│   └── style.css           # Stylesheet chính
├── js/
│   ├── services/           # Các service API (Supabase, TTS, STT)
│   ├── core/               # Logic cốt lõi (Translator, DTW)
│   ├── cv/                 # Computer Vision & AI Models
│   └── utils/              # Các tiện ích hệ thống
└── assets/                 # Hình ảnh, assets UI/UX
```

---

## 🤝 Đóng Góp

Chúng tôi hoan nghênh mọi đóng góp! Vui lòng:

1. Fork dự án.
2. Tạo Branch mới (`git checkout -b feature/AmazingFeature`).
3. Commit thay đổi (`git commit -m 'Add some AmazingFeature'`).
4. Push lên Branch (`git push origin feature/AmazingFeature`).
5. Mở Pull Request.
