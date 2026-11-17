# 📖 HƯỚNG DẪN CẬP NHẬT DỮ LIỆU AI CHUẨN (AUTOMATED VERSIONING SOP)

Tài liệu này hướng dẫn quy trình chuẩn để thêm từ mới, cải thiện độ chính xác cử chỉ cũ hoặc xóa từ vựng trong hệ thống AI SignSpeak, đảm bảo **toàn bộ người dùng tự động nhận dữ liệu mới ngầm (Hot-Reload) mà không bị kẹt cache cũ**.

---

## 🚀 TỔNG QUAN QUY TRÌNH (3 BƯỚC TINH GỌN)

```
1. Quay mẫu cử chỉ (gesture_collector)
       │
       ▼
2. Gộp vào vsl_dataset.json & Thêm audio (.wav)
       │
       ▼
3. Chạy lệnh tự động hóa: node scripts/convert_dataset_to_binary.js
```

---

## BƯỚC 1: Thu thập hoặc Chỉnh sửa Mẫu Cử chỉ

1. Mở trang [gesture_collector.html](http://localhost/Sign_Speak_Extension/gesture_collector.html) trên trình duyệt.
2. **Nếu thêm từ mới:**
   - Nhập tên từ (ví dụ: `xe_may`) ➔ Bấm **"+ Thêm Từ"**.
   - Bấm **"Bắt Đầu Thu Thập"** ➔ Thực hiện cử chỉ tay từ 5–8 lần với tư thế rõ ràng, dứt khoát.
3. **Nếu cải thiện từ đã có (ví dụ: "Cảm ơn" nhận diện chưa nhạy):**
   - Chọn từ `cam_on` trong danh sách.
   - Bấm xoá các mẫu bị lệch hoặc rung tay.
   - Quay bổ sung thêm 3–5 mẫu nét hơn.
4. Bấm nút **"Xuất Dataset (JSON)"** ➔ Trình duyệt sẽ tải về file `vsl_dataset_export.json`.

---

## BƯỚC 2: Cập nhật vào Kho Dữ liệu Gốc & File Âm thanh

1. **Cập nhật JSON:**
   - Mở file `vsl_dataset_export.json` vừa tải.
   - Copy mục từ mới (hoặc các mẫu mới) dán vào file:
     `assets/data/vsl_dataset.json`
2. **Bổ sung giọng đọc tiếng Việt:**
   - Tạo file âm thanh `.wav` (hoặc `.mp3`) với tên trùng với slug của từ (ví dụ: `xe_may.wav`).
   - Copy vào thư mục: `assets/audio/xe_may.wav`.
   - *(Nếu không có file `.wav`, hệ thống sẽ tự động dùng Web Speech API tiếng Việt làm phương án dự phòng).*

---

## BƯỚC 3: Chạy Lệnh Tự Động Hóa Versioning (1 Bước Duy Nhất)

Mở PowerShell tại thư mục dự án và chạy:
```powershell
node scripts/convert_dataset_to_binary.js
```

### Script này sẽ tự động làm toàn bộ những việc sau:
1. **Nén nhị phân Float32:** Nén dữ liệu từ 10.83 MB xuống còn **~1.0 MB** (giảm 90.7% dung lượng mạng).
2. **Kiểm tra độ chính xác:** Tự động so sánh từng con số dấu phẩy động (đạt chuẩn **0.000000% sai lệch**).
3. **Tính mã băm SHA-256:** Tạo chuỗi mã băm bảo mật duy nhất theo nội dung dữ liệu mới.
4. **Tự động tăng phiên bản (Auto-Bump Version):**
   - File `assets/data/dataset_version.json` tự động cập nhật:
     Ví dụ: `v1.0.1` ➔ `v1.0.2` kèm `buildTimestamp` mới nhất.

---

## BƯỚC 4: Kiểm thử & Triển khai

1. Chạy bộ kiểm thử tự động để đảm bảo toàn bộ pipeline đạt chuẩn:
   ```powershell
   node tests/test_cv_pipeline.js
   ```
   *(Yêu cầu: Đạt 23/23 Tests Passed)*.
2. Commit và đẩy mã nguồn:
   ```powershell
   git add .
   git commit -m "data: update AI dataset to v1.0.2 (add xe_may)"
   ```

---

## ⚡ CÁC USER KHÁC SẼ NHẬN DỮ LIỆU MỚI NHƯ THẾ NÀO?

- **Khởi động 0ms:** Khi user mở Extension hoặc Web, hệ thống luôn đọc cache IndexedDB cũ trong máy để khởi động tức thì, không bắt user chờ đợi.
- **Tự động cập nhật ngầm (Background Hot-Reload):**
  1. Trong nền, hệ thống kiểm tra file nhỏ `dataset_version.json` (chỉ 50 bytes).
  2. Khi thấy mã băm SHA-256 trên server khác với mã băm trong máy user ➔ Tự động tải file `vsl_dataset.bin` mới (~1MB).
  3. Cập nhật vào IndexedDB và **nạp nóng ngay lập tức vào RAM** của AI mà không cần user phải tải lại trang hay xoá dữ liệu duyệt web.
- **Không bao giờ mất dữ liệu riêng:** Các từ vựng do từng user tự quay cá nhân hóa được lưu ở phân vùng riêng (`custom_dataset_bin`), độc lập hoàn toàn với `master_dataset_bin` của hệ thống.
