# SIGN SPEAK & SIGN SPEAK EXTENSION — CONTEXT HANDOVER

> **Mục đích tài liệu:** Lưu trữ toàn bộ ngữ cảnh, kiến trúc, các quyết định kỹ thuật và trạng thái triển khai để bất kỳ phiên làm việc / phiên chat mới nào cũng có thể nắm bắt 100% ngữ cảnh ngay lập tức.

---

## 1. Tổng quan Dự án & Phân định Vai trò

Dự án gồm 2 phân hệ chạy song song và dùng chung chuẩn dữ liệu AI:

1. **`Sign_Speak` (Web Application gốc):**
   - **Vị trí:** `c:\xampp\htdocs\Sign_Speak`
   - **Vai trò:** Nền tảng web video call nội bộ (WebRTC P2P), giao diện thu thập dữ liệu ký hiệu (`gesture_collector.html`), quản lý tài khoản & danh bạ qua Supabase.
   - **Trang gọi chính:** `call.html` kết hợp `js/call_controller.js`.

2. **`Sign_Speak_Extension` (Chrome Extension Manifest V3):**
   - **Vị trí:** `c:\xampp\htdocs\Sign_Speak_Extension`
   - **Vai trò:** Tiện ích mở rộng Google Chrome chèn phụ đề dịch thủ ngữ thời gian thực (Real-time Subtitles Overlay bằng Shadow DOM) trên các nền tảng video call bên thứ ba: **Google Meet, Messenger Web, Zalo Web, Zoom Web**.
   - **Cơ chế xử lý:** Bắt video stream từ DOM trang gọi -> Gửi frame sang `offscreen/offscreen.js` (xử lý MediaPipe Hands + DTW Classifier) -> Gửi kết quả về `content/content.js` để render phụ đề và phát âm thanh TTS.

---

## 2. Các Nâng cấp Kiến trúc Cốt lõi Đã Hoàn tất (Đồng bộ Cả 2 Dự án)

### A. Tối ưu Cold-Start: Binary Float32Array + Bộ nhớ đệm IndexedDB (0ms Boot)
- **Vấn đề đã xử lý:** File `vsl_dataset.json` gốc nặng 10.83 MB làm chậm thời gian tải trang ban đầu.
- **Giải pháp:**
  - Định dạng nhị phân độc quyền `VSLB` (`cv/binary_dataset.js` / `js/cv/binary_dataset.js`): Đóng gói toàn bộ tensor ma trận cử chỉ thành khối bộ nhớ liên tục `Float32Array`.
  - Dung lượng giảm từ **10.83 MB -> 2.79 MB** (nén HTTP Gzip còn **~1.03 MB**, giảm **90.7%** dung lượng truyền tải).
  - Đảm bảo **0.000000% sai số** (Bitwise Lossless Exact Match).
  - Dịch vụ `IndexedDBService` (`services/indexed_db_service.js` / `js/services/indexed_db_service.js`): Lưu trữ trực tiếp Buffer vào IndexedDB `SignSpeakDB` -> Thời gian khởi động các lần sau là **0ms** (Instant Boot).
  - Tự động fallback sang JSON nếu môi trường không hỗ trợ Binary.

### B. Cơ chế Tự động hóa Versioning & Quy trình Cập nhật Data (SOP)
- **Manifest phiên bản:** `assets/data/dataset_version.json` (quản lý `version`, `buildTimestamp`, `hash` SHA-256).
- **Cơ chế Stale-While-Revalidate (SWR):** Ứng dụng khởi động ngay từ cache IndexedDB, đồng thời kiểm tra ngầm hash từ `dataset_version.json`. Nếu có bản cập nhật mới, tự động tải ngầm và hot-reload trực tiếp vào RAM mà không cần người dùng reload trang hay xóa cache.
- **Tài liệu hướng dẫn chuẩn:** 
  - `HUONG_DAN_UPDATE_DATA_AI_CHUAN.docx` (Bản Word chính thức).
  - `HUONG_DAN_UPDATE_DATA_AI_CHUAN.md` (Bản Markdown).
- **Script đóng gói 1-Click:** Chạy `node scripts/convert_dataset_to_binary.js` để tự động mã hóa JSON sang `.bin` và cập nhật mã băm SHA-256.

### C. Mô hình AI Hybrid 2 Tầng (Motion Energy Gate + Confusion Pair Disambiguation)
- **Vấn đề đã xử lý:** Tránh nhầm lẫn giữa các ký hiệu có hình thái bàn tay tương đồng:
  - Chữ `B` (bàn tay giơ thẳng tĩnh) vs Từ `Xin chào` (bàn tay giơ thẳng vẫy động).
  - Chữ `V` (xòe ngón trỏ & giữa) vs Chữ `U` (khép ngón trỏ & giữa).
  - Ký hiệu `Không` vs Chữ cái `O`.
  - Chữ `Y` vs Chữ `I`.
- **Cấu trúc 2 tầng trong `dtw_classifier.js`:**
  - **Tầng 1 - Motion Energy Gate:** Đo động năng dịch chuyển trung bình ($E_{motion}$) của cổ tay và khớp ngón tay qua chuỗi frames. Phạt mềm khoảng cách DTW nếu nhận diện chữ tĩnh nhưng tay có vận tốc động lớn (hoặc ngược lại).
  - **Tầng 2 - Confusion Pair Disambiguation (CPD):** Khi Top 1 và Top 2 có khoảng cách suýt soát ($d_2 / d_1 < 1.25$), kích hoạt vi trọng tài phân xử hình học:
    - `V` vs `U`: Đo khoảng cách đầu ngón trỏ và ngón giữa (`tipDist > 0.125`).
    - `B` vs `Xin chào`: Đo vận tốc vẫy tay kết hợp trạng thái ngón cái.
    - `Không` vs `O`: Đo biên độ quét ngang.
    - `Y` vs `I`: So khớp vector định hướng không gian ngón cái (chiều 136-141).
  - **Hiệu năng:** Chi phí chạy chỉ **$0.001\text{ ms}$**, không gây bất kỳ độ trễ nào cho luồng video call.

### D. Hệ thống Chấm điểm Tự động LOOCV Benchmark
- **Script:** `scripts/benchmark_accuracy.js`
- **Kết quả kiểm thử trên 135 mẫu cử chỉ thực tế:**
  - Độ chính xác tuyệt đối: **92.59% (125/135 mẫu)**.
  - Chữ cái `B`: **100% (6/6)** — Không còn nhầm với `Xin chào`.
  - Từ `Xin chào`: **88.9% (8/9)** — Không còn nhầm với `B`.
  - Chữ cái `V`: **75.0% (3/4)** — Tăng từ mức 25% trước đây.
  - Chữ cái `U`: **100.0% (4/4)**.
  - Bộ unit test `test_cv_pipeline.js`: **23/23 tests passed** trên cả 2 dự án.

---

## 3. Các Lệnh Thường dùng khi Làm việc trên Cả 2 Dự án

### Chạy Kiểm thử Pipeline (23 Tests):
```powershell
# Trên Sign_Speak:
cd c:\xampp\htdocs\Sign_Speak; node js/cv/test_cv_pipeline.js

# Trên Sign_Speak_Extension:
cd c:\xampp\htdocs\Sign_Speak_Extension; node tests/test_cv_pipeline.js
```

### Chạy Chấm điểm LOOCV Benchmark:
```powershell
# Chạy trên bất kỳ thư mục nào:
node scripts/benchmark_accuracy.js
```

### Cập nhật & Mã hóa Dữ liệu khi có Mẫu Mới:
```powershell
# Sau khi copy vsl_dataset.json mới vào assets/data/:
node scripts/convert_dataset_to_binary.js
```
