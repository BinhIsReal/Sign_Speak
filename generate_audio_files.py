import os
import urllib.request
import urllib.parse

# List of words and letters with authentic Vietnamese pronunciation text
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
    ("Cần hỗ trợ", "can_ho_tro"),
    ("Khỏe mạnh", "khoe_manh"),
    ("Xin chào", "xin_chao"),
    ("Đừng", "dung"),
    # Vietnamese Alphabet Letter Transliterations
    ("Á", "a"),
    ("Bê", "b"),
    ("Xê", "c"),
    ("Dê", "d"),
    ("E", "e"),
    ("Gờ", "g"),
    ("Hát", "h"),
    ("I ngắn", "i"),
    ("Ca", "k"),
    ("E-lờ", "l"),
    ("E-mờ", "m"),
    ("E-nờ", "n"),
    ("O", "o"),
    ("Pê", "p"),
    ("Quy", "q"),
    ("E-rờ", "r"),
    ("Ép-sờ", "s"),
    ("Tê", "t"),
    ("U", "u"),
    ("Vê", "v"),
    ("Ít-sờ", "x"),
    ("Y dài", "y")
]

OUTPUT_DIR = os.path.join("assets", "media", "audio")

def generate():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    for text, slug in WORDS:
        url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q={urllib.parse.quote(text)}"
        req = urllib.request.Request(url, headers=headers)
        
        wav_path = os.path.join(OUTPUT_DIR, f"{slug}.wav")
        mp3_path = os.path.join(OUTPUT_DIR, f"{slug}.mp3")
        
        try:
            with urllib.request.urlopen(req) as response, open(wav_path, 'wb') as out_file:
                data = response.read()
                out_file.write(data)
                
            with open(mp3_path, 'wb') as out_file:
                out_file.write(data)

            print(f"[OK] Generated audio for '{slug}' -> {wav_path} ({len(data)} bytes)")
        except Exception as e:
            print(f"[ERROR] Failed to generate audio for '{slug}': {e}")

if __name__ == "__main__":
    generate()
