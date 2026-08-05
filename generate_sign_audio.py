"""
Script tạo sẵn các file âm thanh tiếng Việt cho từ điển ký hiệu Sign_Speak
bằng valtec-tts (offline, CPU, giọng Việt thật 100%, license phi thương mại
CC BY-NC 4.0 - phù hợp đồ án tốt nghiệp).

CÀI ĐẶT (chạy 1 lần, cần internet để tải thư viện + model):
    pip install git+https://github.com/tronghieuit/valtec-tts.git

CHẠY:
    python generate_sign_audio.py

KẾT QUẢ: các file .wav trong thư mục output/, đặt tên khớp sign-dictionary.json.
Sau khi chạy xong, copy toàn bộ file trong output/ vào assets/media/audio/
của dự án Sign_Speak.
"""

import os
from valtec_tts import TTS

# Danh sách từ ký hiệu: (văn bản đọc, slug tên file)
# Chỉnh sửa/thêm bớt danh sách này cho khớp đúng 10-15 từ trong sign-dictionary.json
WORDS = [
    ("Không", "khong"),
    ("Tôi", "toi"),
    ("Bạn", "ban"),
    ("Cảm ơn", "cam_on"),
    ("Xin lỗi", "xin_loi"),
    ("Giúp đỡ", "giup_do"),
    ("Vui vẻ", "vui_ve"),
    ("Hẹn gặp lại", "hen_gap_lai"),
    ("Tạm biệt", "tam_biet"),
    ("Đồng ý", "dong_y"),
]

# Giọng đọc: NF/SF = nữ Bắc/Nam, NM1/SM/NM2 = nam Bắc/Nam
# Đổi giá trị này để thử giọng khác trước khi chốt bản demo
SPEAKER = "NF"

OUTPUT_DIR = "output"

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("Đang tải model (lần đầu cần internet)...")
    tts = TTS()

    for text, slug in WORDS:
        path = os.path.join(OUTPUT_DIR, f"{slug}.wav")
        tts.speak(text, speaker=SPEAKER, output_path=path)
        print(f"  OK: {text} -> {path}")

    print(f"\nHoàn tất {len(WORDS)} file. Copy thư mục '{OUTPUT_DIR}/' vào assets/media/audio/")

if __name__ == "__main__":
    main()
