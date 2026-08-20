# 📖 HƯỚNG DẪN THÊM TỪ MỚI VÀO HỆ THỐNG AI SIGN SPEAK

> Áp dụng cho: Vercel Production (`sign-speak-seven.vercel.app`)

---

## TỔNG QUAN QUY TRÌNH

```
1. Thêm từ vào gesture_collector → 2. Quay mẫu cử chỉ tay → 3. Tạo file âm thanh .wav → 4. Cập nhật slugMap → 5. Deploy lên Vercel
```

---

## BƯỚC 1 — Thêm Từ Mới vào Hệ Thống Thu Thập

1. Truy cập trang [gesture_collector.html](https://sign-speak-seven.vercel.app/gesture_collector.html)
2. Trong ô **"Nhập từ mới"** → gõ từ cần thêm (ví dụ: `học sinh`)
3. Bấm nút **"+ Thêm Từ"**
4. Hệ thống tự động:
   - Lưu từ vào `localStorage['vsl_custom_words']`
   - Đăng ký từ vào bộ nhớ TTS để sẵn sàng đọc

---

## BƯỚC 2 — Quay Mẫu Cử Chỉ Tay Để Train AI

1. Chọn từ vừa thêm từ dropdown **"Từ ký hiệu cần quay"**
2. Chọn chế độ nhận diện tay phù hợp (1 Tay / 2 Tay / Tự động)
3. Bấm **"Bắt Đầu Thu Thập Mẫu Cử Chỉ"**
4. Quay **tối thiểu 5–10 mẫu** cử chỉ tay cho từ đó
5. Bấm **"Tất Chế Độ Test"** để kiểm tra AI đã nhận diện chưa

---

## BƯỚC 3 — Tạo File Âm Thanh Tiếng Việt (.wav)

> ⚠️ Bước này phải thực hiện **trên máy tính local** (XAMPP), không thực hiện được trên Vercel.

### 3.1 — Mở file `generate_vi_audio.py`

Tìm file tại: `c:\xampp\htdocs\Sign_Speak\generate_vi_audio.py`

> Nếu file không tồn tại, tạo mới với nội dung sau:

```python
# -*- coding: utf-8 -*-
from gtts import gTTS
import os, shutil

AUDIO_DIR = r"c:\xampp\htdocs\Sign_Speak\assets\media\audio"

# Thêm từ mới vào đây: { "slug": "text tiếng Việt" }
CUSTOM_WORDS = {
    "ten_la":     "tên là",
    "hoc_sinh":   "học sinh",
    "gia_dinh":   "gia đình",
    # Thêm dòng mới theo mẫu bên dưới:
    # "slug_cua_tu": "từ hiển thị",
}

def generate_audio(slug, text):
    wav_path = os.path.join(AUDIO_DIR, f"{slug}.wav")
    mp3_path = os.path.join(AUDIO_DIR, f"{slug}.mp3")
    if os.path.exists(wav_path):
        print(f"[SKIP] {slug}.wav đã tồn tại.")
        return
    try:
        tts = gTTS(text=text, lang='vi', slow=False)
        tts.save(mp3_path)
        shutil.copy2(mp3_path, wav_path)
        print(f"[OK] Đã tạo: {slug}.wav ({os.path.getsize(wav_path)} bytes)")
    except Exception as e:
        print(f"[ERR] Lỗi tạo {slug}: {e}")

if __name__ == "__main__":
    for slug, text in CUSTOM_WORDS.items():
        generate_audio(slug, text)
    print("=== Hoàn thành! ===")
```

### 3.2 — Thêm từ mới vào dict `CUSTOM_WORDS`

```python
CUSTOM_WORDS = {
    "ten_la":     "tên là",
    "hoc_sinh":   "học sinh",
    # ↓ Thêm từ mới vào đây:
    "con_duong":  "con đường",   # Slug: chữ thường, dấu _ thay dấu cách
    "may_tinh":   "máy tính",
}
```

> **Quy tắc đặt slug:**
> - Viết thường, không dấu
> - Dấu cách → dấu gạch dưới `_`
> - Ví dụ: `"học sinh"` → slug `"hoc_sinh"`

### 3.3 — Chạy Script Tạo Audio

```bash
# Mở Command Prompt trong thư mục dự án:
cd c:\xampp\htdocs\Sign_Speak

# Cài gTTS nếu chưa có:
pip install gtts

# Chạy script:
python generate_vi_audio.py
```

**Output mong đợi:**
```
[OK] Đã tạo: con_duong.wav (8640 bytes)
[OK] Đã tạo: may_tinh.wav (8256 bytes)
=== Hoàn thành! ===
```

---

## BƯỚC 4 — Cập Nhật `slugMap` trong `tts_service.js`

Mở file [`js/services/tts_service.js`](file:///c:/xampp/htdocs/Sign_Speak/js/services/tts_service.js)

Tìm phần `// Custom words with generated gTTS audio files:` và thêm dòng mới:

```javascript
// Custom words with generated gTTS audio files:
"tên là": "ten_la",     "ten_la": "ten_la",
"học sinh": "hoc_sinh", "hoc_sinh": "hoc_sinh",
// ↓ Thêm từ mới vào đây (2 dòng mỗi từ):
"con đường": "con_duong", "con_duong": "con_duong",
"máy tính":  "may_tinh",  "may_tinh":  "may_tinh",
```

> **Lưu ý:** Mỗi từ cần **2 entry**:
> 1. `"từ có dấu": "slug"` — để tra khi AI trả về text gốc
> 2. `"slug": "slug"` — để tra khi AI trả về ID

---

## BƯỚC 5 — Deploy Lên Vercel

```bash
cd c:\xampp\htdocs\Sign_Speak
npx vercel --prod --yes
```

**Output thành công:**
```
▲ Aliased  https://sign-speak-seven.vercel.app
{ "status": "ok" }
```

---

## ✅ KIỂM TRA KẾT QUẢ

1. Vào [gesture_collector.html](https://sign-speak-seven.vercel.app/gesture_collector.html) → Test chế độ nhận diện
2. AI nhận diện đúng → Bật **Chế Độ Test** → Làm ký hiệu tay
3. Nghe âm thanh phát ra → Nếu nghe tiếng Việt đọc đúng từ ✅

---

## 📋 BẢNG TỪ ĐÃ CÓ SẴN

| Slug | Từ tiếng Việt | Nguồn audio |
|---|---|---|
| `toi` | Tôi | 🎙️ Thu âm thật |
| `ban` | Bạn | 🎙️ Thu âm thật |
| `khong` | Không | 🎙️ Thu âm thật |
| `cam_on` | Cảm ơn | 🎙️ Thu âm thật |
| `xin_chao` | Xin chào | 🎙️ Thu âm thật |
| `tam_biet` | Tạm biệt | 🎙️ Thu âm thật |
| `xin_loi` | Xin lỗi | 🎙️ Thu âm thật |
| `dong_y` | Đồng ý | 🎙️ Thu âm thật |
| `giup_do` | Giúp đỡ | 🎙️ Thu âm thật |
| `vui_ve` | Vui vẻ | 🎙️ Thu âm thật |
| `ten_la` | Tên là | 🤖 Google TTS |
| `hoc_sinh` | Học sinh | 🤖 Google TTS |
| `gia_dinh` | Gia đình | 🤖 Google TTS |
| `ban_be` | Bạn bè | 🤖 Google TTS |
| `yeu_thuong` | Yêu thương | 🤖 Google TTS |
| `nha_truong` | Nhà trường | 🤖 Google TTS |
| `thay_giao` | Thầy giáo | 🤖 Google TTS |
| `co_giao` | Cô giáo | 🤖 Google TTS |
| `tre_em` | Trẻ em | 🤖 Google TTS |
| `nguoi_lon` | Người lớn | 🤖 Google TTS |
| `a` – `y` | Bảng chữ cái | 🎙️ Thu âm thật |

---

> [!TIP]
> Nếu muốn chất lượng audio tốt hơn Google TTS, có thể tự thu âm từng từ bằng microphone và lưu vào `assets/media/audio/<slug>.wav`.

> [!NOTE]
> `_autoRegisterFromLocalStorage()` trong `tts_service.js` tự động đăng ký mọi từ trong `localStorage['vsl_custom_words']` vào `slugMap` khi trang load — nhưng chỉ hoạt động nếu file `.wav` tương ứng đã được deploy lên Vercel.
