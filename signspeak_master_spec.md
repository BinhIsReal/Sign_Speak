# Sign_Speak — Đặc Tả Kỹ Thuật Xây Dựng Từ Đầu (Bản Tổng Hợp)

> Tài liệu này tổng hợp toàn bộ quyết định kỹ thuật đã chốt cho đồ án tốt nghiệp Sign_Speak. Dùng làm prompt/chỉ thị chính khi làm việc với Antigravity — mọi module được yêu cầu code mới hoặc sửa lại đều phải bám theo các nguyên tắc dưới đây.

---

## 0. Bối Cảnh & Nguyên Tắc Tổng Quát

- Đây là sản phẩm demo cho **đồ án tốt nghiệp**, không phải sản phẩm thương mại — mọi quyết định công nghệ ưu tiên **khả thi trong thời gian giới hạn** hơn là hoàn hảo lý thuyết.
- Đối tượng sử dụng: **người Việt** (người khiếm thính dùng Ngôn ngữ Ký hiệu Việt Nam và người nghe nói bình thường).
- Nguyên tắc risk-first: phần rủi ro kỹ thuật cao nhất (nhận diện cử chỉ ký hiệu) phải được validate độc lập, sớm nhất, tách biệt khỏi UI/WebRTC.
- Mọi con số hiệu năng (FPS, độ trễ, accuracy) là mục tiêu đo được thực tế trên phần cứng phổ thông (laptop không GPU rời) — không đặt mục tiêu lý tưởng không kiểm chứng được.
- Luôn có **video demo quay sẵn làm phương án dự phòng** cho ngày bảo vệ, vì nhận diện qua webcam phụ thuộc ánh sáng/thiết bị.

---

## 1. Ngôn Ngữ & Framework

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| Frontend | HTML5 + JavaScript ES6+ + Tailwind CSS | Không dùng React/Vue cho các trang tĩnh (login, contacts, settings) — không cần thiết cho quy mô đồ án |
| Backend/DB | Supabase (PostgreSQL + Auth + Realtime) | Miễn phí, đủ dùng cho demo, Realtime Broadcast dùng được cho WebRTC signaling |
| Server riêng | Không dựng server riêng | Nếu cần proxy gọi API TTS ngoài, dùng Supabase Edge Functions thay vì tự quản lý hạ tầng |

---

## 2. Cơ Sở Dữ Liệu (Database) — Chỉ 3 Bảng

```sql
-- profiles: thông tin tài khoản, vai trò, cài đặt tiếp cận
create table profiles (
  id uuid primary key references auth.users(id),
  role text check (role in ('deaf', 'hearing')),
  display_name text,
  accessibility_settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- contacts: danh bạ bạn bè
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  contact_id uuid references profiles(id),
  status text check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz default now()
);

-- call_history: lịch sử cuộc gọi
create table call_history (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid references profiles(id),
  receiver_id uuid references profiles(id),
  started_at timestamptz,
  ended_at timestamptz,
  call_type text,
  created_at timestamptz default now()
);
```

- **Không tạo** bảng `transcripts` — phụ đề chỉ hiển thị live trong UI, không cần lưu trữ lâu dài cho bản demo.
- **Không tạo** bảng `sign_dictionary` — từ điển ký hiệu (tên từ + đường dẫn GIF minh họa) lưu trong file JSON tĩnh `assets/data/sign-dictionary.json`. Không dùng `localStorage` cho dữ liệu này vì không đồng bộ giữa các máy demo.
- RLS Policies bắt buộc trên cả 3 bảng: user chỉ đọc/sửa dữ liệu của chính mình, trừ các trường công khai cần thiết cho tính năng contacts.

---

## 3. Pipeline Nhận Diện Cử Chỉ (Phần Lõi — Quan Trọng Nhất)

### 3.1. Computer Vision
- Dùng **MediaPipe Holistic** (không chỉ Hands) — lấy thêm landmark Pose (vai, khuỷu tay, cổ tay) làm tín hiệu dự phòng khi bàn tay bị che khuất bởi tay kia.
- Cấu hình `numHands: 2`.
- Giữ `minDetectionConfidence` / `minTrackingConfidence` ở mức mặc định (0.5–0.7). **Không hạ xuống 0.45 toàn cục** — hạ ngưỡng khiến MediaPipe chấp nhận cả phát hiện có độ tin cậy thấp, dễ tạo ra landmark sai/nhiễu khó phát hiện hơn giá trị 0.0 rõ ràng. Nếu cần chế độ khoan dung khi occlusion, chỉ bật tạm thời có kiểm soát.

### 3.2. Chuẩn Hóa & Feature Engineering
- Chuẩn hóa thứ tự 2 tay dựa trên nhãn `handedness` (Left/Right) từ MediaPipe làm cơ sở chính; dùng tọa độ X làm tiêu chí dự phòng chỉ khi confidence thấp. Nếu thứ tự đảo đột ngột giữa 2 frame liên tiếp trong cùng 1 chuỗi (dấu hiệu nhiễu), giữ nguyên thứ tự frame trước.
- Vector đặc trưng mỗi frame gồm:
  - Landmark 2 tay: 126D (63D × 2 tay)
  - Inter-Hand Spatial Features: khoảng cách tương quan cổ tay trái–phải và các đầu ngón chính (dx, dy, dz, distance)
  - Landmark Pose liên quan (vai, khuỷu tay) làm tín hiệu dự phòng khi occlusion
- **Xử lý occlusion**: nếu 1 tay bị che, giữ vị trí frame gần nhất tối đa **5–8 frame liên tiếp (~0.2–0.3s)**. Vượt ngưỡng này: khi thu thập → đánh dấu mẫu không hợp lệ; khi suy luận realtime → dùng tín hiệu Pose để ước lượng vị trí gần đúng.

### 3.3. Thu Thập Dữ Liệu Theo Chuyển Động (Không Cố Định Cửa Sổ)
- Bắt đầu/kết thúc ghi 1 mẫu dựa trên **vận tốc chuyển động landmark** (motion velocity trigger), không dùng cửa sổ cố định — độ dài chuỗi biến đổi theo từng ký hiệu (khoảng 10–35 frame, ~0.3–1.2s).
- UI thu thập (`gesture_collector.html`): đếm ngược 3-2-1 → đang quay (progress bar) → hoàn thành; toggle chế độ `Bắt buộc 2 tay` / `1 Tay` / `Tự động`.
- Cho phép thêm từ ký hiệu mới qua UI, nhưng **phải export ra file JSON tĩnh** (không lưu `localStorage`) để đồng bộ chắc chắn qua mọi máy dùng demo. Sau khi thêm từ mới, dẫn thẳng người dùng vào quy trình quay 15–20 mẫu cho từ đó — nếu không, từ mới chỉ là 1 nhãn rỗng không thể nhận diện.

### 3.4. Nguồn Dữ Liệu
- Kết hợp dataset VSL có sẵn (VSL Kaggle Cropped — 472 từ, có keypoints `.npy`) làm nguồn chính cho các từ trùng khớp với bộ từ vựng đã chọn, cộng với tự quay bổ sung cho từ ngoài dataset.
- **Trước khi dùng số lượng lớn**: viết adapter kiểm tra format/tương thích trên mẫu nhỏ (5–10 từ) trước — kiểm tra version MediaPipe dùng để trích xuất, format tọa độ, license sử dụng.
- Giữ 1 tập nhỏ **tự quay riêng làm test độc lập**, không dùng chung nguồn với tập train, để accuracy đo được phản ánh đúng khả năng nhận diện người dùng thật khi demo.

### 3.5. Phân Loại (Classifier)
- Dùng **DTW (Dynamic Time Warping)** với **Sakoe-Chiba Band** (`W = max(6, |N-M|+4)`) để so khớp chuỗi biến đổi độ dài — không so khớp vector đơn (1 frame).
- `maxDistanceThreshold` để từ chối cử chỉ lạ: giá trị phải được **đo thực nghiệm** (test nhiều mức 0.7–0.9, đo cả tỷ lệ nhận đúng và tỷ lệ từ chối đúng), không đặt cứng từ đầu.
- **Motion Energy Filter**: chỉ suy luận khi tay đang chuyển động, tránh nhận diện sai lúc tay đứng yên.
- Ngưỡng accuracy mục tiêu: **≥70%** trên tập test độc lập.

### 3.6. Bộ Từ Vựng Thử Nghiệm (10–15 từ)
Có cả 2 loại để chứng minh hệ thống xử lý được cả hai:
- Tĩnh: Không, Tôi, Bạn
- Động / 2 tay: Cảm ơn, Xin lỗi, Giúp đỡ, Vui vẻ, Hẹn gặp lại, Tạm biệt

---

## 4. WebRTC & Hạ Tầng Realtime

- `RTCPeerConnection` chuẩn của trình duyệt; signaling qua Supabase Realtime Broadcast Channel.
- STUN: Google STUN công khai + TURN dự phòng miễn phí (OpenRelay/Metered) cho NAT nghiêm ngặt.
- **Mục tiêu hiệu năng thực tế** (không đặt 60 FPS cho cả pipeline AI):
  - Video call ổn định ≥30 FPS
  - Suy luận cử chỉ chạy theo chu kỳ lấy mẫu **100–150ms** (không chạy mỗi frame)
  - Độ trễ dịch thuật chấp nhận được: 300–500ms

---

## 5. Speech (STT & TTS)

- **STT**: giữ Web Speech Recognition API (`vi-VN`) — hoạt động tốt trên Chrome/Edge, không cần thay đổi.
- **TTS**: **không dùng** `window.speechSynthesis` mặc định của trình duyệt cho tiếng Việt — đã xác nhận nhiều máy/trình duyệt không có giọng đọc tiếng Việt cài sẵn, gây phát âm sai hoàn toàn (giọng nước ngoài cố đọc tiếng Việt).
  - Chuyển sang gọi **API TTS tiếng Việt thật**, trả về audio file phát qua `<audio>`/Web Audio API.
  - Ưu tiên: **FPT.AI TTS** (free tier, giọng Việt tự nhiên) → dự phòng **Google Cloud TTS** (`vi-VN-Wavenet`, free tier theo ký tự/tháng).
  - API key lưu trong `.env`, không hardcode; có xử lý lỗi rõ ràng khi mất mạng/hết quota.
  - **Lưu ý báo cáo**: hệ thống không còn 100% offline/miễn phí tuyệt đối ở khâu TTS — cần ghi rõ đây là đánh đổi có chủ đích để đảm bảo phát âm tiếng Việt đúng.

---

## 6. Cấu Trúc Giao Diện (UI) — Tối Giản

| Mức đầu tư | Trang |
|---|---|
| Đầy đủ | `login.html`, `call.html` (ưu tiên cao nhất), `contacts.html`, `index.html`, `settings.html` |
| Tối giản / cắt nếu thiếu thời gian | `register.html` (form đơn giản), `hub.html` (có thể bỏ hoặc làm trang tĩnh) |

`settings.html` cần có: chuyển đổi cỡ chữ, độ tương phản, và **2 chế độ phụ đề** (Glassmorphism Overlay / Fixed Subtitle Bar).

---

## 7. Giới Hạn Kỹ Thuật Cần Khai Báo Rõ Trong Báo Cáo

*(Đây là phạm vi có chủ đích, không phải lỗi — cần nêu rõ để hội đồng đánh giá đúng kỳ vọng.)*

- Trình duyệt hỗ trợ: Chrome & Edge (do phụ thuộc Web Speech API cho STT).
- Chỉ nhận diện từ/cụm từ ký hiệu đơn lẻ (isolated gesture recognition) — không xử lý ngữ pháp không gian hay câu ký hiệu liên tục.
- Bộ từ vựng giới hạn 10–15 từ cho bản demo.
- Occlusion được xử lý ở mức khoan dung ngắn hạn (~0.2–0.3s) — không giải quyết được che khuất kéo dài toàn bộ cử chỉ.
- Không có avatar 3D ký hiệu — dùng GIF/video minh họa có sẵn.

---

## 8. Thứ Tự Triển Khai Bắt Buộc

1. **Validate pipeline nhận diện cử chỉ độc lập** (script riêng, không đụng UI/WebRTC) — bao gồm kiểm tra dataset VSL Kaggle có dùng được không.
2. Supabase schema (3 bảng) + WebRTC signaling cơ bản (test bằng 2 tab, dùng file test tối giản riêng — chưa có CV/Speech).
3. Tích hợp CV pipeline (DTW + occlusion handling) + STT/TTS (đã sửa sang API ngoài) vào `call.html`.
4. Hoàn thiện 5 trang UI chính.
5. Test tổng thể + đo accuracy trên tập test độc lập + **quay video demo backup**.

---

## 9. Bảng Tổng Hợp Mục Tiêu Đo Được (Dùng Cho Verification)

| Hạng mục | Mục tiêu | Cách đo |
|---|---|---|
| Accuracy nhận diện cử chỉ | ≥70% | Trên tập test tự quay, độc lập với tập train |
| FPS video call | ≥30 FPS | Quan sát trực tiếp khi gọi 2 tab/2 máy |
| Chu kỳ suy luận cử chỉ | 100–150ms | Đo thời gian giữa các lần gọi classifier |
| Độ trễ dịch thuật | 300–500ms | Đo từ lúc kết thúc cử chỉ đến lúc hiển thị text/phát TTS |
| Occlusion tolerance | ≤5–8 frame (~0.2–0.3s) | Test che 1 tay trong thời gian ngắn vs kéo dài |
| Phát âm TTS tiếng Việt | Đúng, tự nhiên | Test 10 câu có dấu, nhiều thanh điệu |
