# -*- coding: utf-8 -*-
"""
Generate a professional Word Document (.docx) for SignSpeak AI Dataset Update SOP.
"""

import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

doc = docx.Document()

# Set page margins
sections = doc.sections
for s in sections:
    s.top_margin = Inches(0.8)
    s.bottom_margin = Inches(0.8)
    s.left_margin = Inches(0.8)
    s.right_margin = Inches(0.8)

PRIMARY_COLOR = RGBColor(14, 116, 144)   # Teal/Ocean Blue #0e7490
TEXT_DARK = RGBColor(15, 23, 42)          # Slate 900
GRAY_BG = 'F1F5F9'
ACCENT_BLUE = 'E0F2FE'

def set_cell_bg(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def add_title(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.name = 'Calibri'
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = PRIMARY_COLOR

def add_subtitle(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.name = 'Calibri'
    run.font.size = Pt(13)
    run.font.italic = True
    run.font.color.rgb = RGBColor(71, 85, 105)

def add_heading1(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(text)
    run.font.name = 'Calibri'
    run.font.size = Pt(15)
    run.font.bold = True
    run.font.color.rgb = PRIMARY_COLOR

def add_heading2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    run.font.name = 'Calibri'
    run.font.size = Pt(12)
    run.font.bold = True
    run.font.color.rgb = RGBColor(30, 41, 59)

def add_callout(text, bold_prefix=''):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_bg(cell, ACCENT_BLUE)
    cell.paragraphs[0].paragraph_format.space_before = Pt(6)
    cell.paragraphs[0].paragraph_format.space_after = Pt(6)
    if bold_prefix:
        r_bold = cell.paragraphs[0].add_run(bold_prefix + ' ')
        r_bold.font.name = 'Calibri'
        r_bold.font.size = Pt(11)
        r_bold.font.bold = True
        r_bold.font.color.rgb = PRIMARY_COLOR
    r_text = cell.paragraphs[0].add_run(text)
    r_text.font.name = 'Calibri'
    r_text.font.size = Pt(11)
    r_text.font.color.rgb = TEXT_DARK
    doc.add_paragraph()

add_title('HƯỚNG DẪN CẬP NHẬT DỮ LIỆU AI CHUẨN (SOP)')
add_subtitle('Dự án SignSpeak AI • Quy trình Tự động hóa Versioning & Nạp nóng Hot-Reload')

add_callout(
    'Quy trình dưới đây áp dụng cơ chế tự động hóa Versioning bằng nhị phân Float32 và IndexedDB. '
    'Người dùng cuối (User) sẽ luôn nhận dữ liệu cập nhật mới nhất ngầm trong nền (Hot-Reload) mà không cần xóa cache hay F5 trang web.',
    '💡 ĐẶC QUYỀN HỆ THỐNG:'
)

add_heading1('1. GIẢI ĐÁP QUAN TRỌNG VỀ FILE XUẤT TỪ GESTURE_COLLECTOR')
p = doc.add_paragraph()
p.add_run(
    'Câu hỏi thường gặp: Khi xuất file từ gesture_collector.html, tôi phải làm gì với file vsl_dataset_export.json? '
    'Có cần lọc hay cắt dán từng dòng vào file gốc không?'
).font.bold = True

add_callout(
    'Khi bạn mở gesture_collector.html, hệ thống tự động nạp toàn bộ dữ liệu gốc (32 từ vựng và bảng chữ cái) vào bộ nhớ. '
    'Khi bạn thêm từ mới hoặc quay thêm cử chỉ, dữ liệu mới sẽ được gộp chung vào bộ nhớ đó.\n\n'
    'Do đó, khi bấm "Xuất Dataset (JSON)", file vsl_dataset_export.json tải về ĐÃ BAO GỒM TOÀN BỘ 100% DỮ LIỆU CŨ + DỮ LIỆU MỚI BẠN VỪA QUAY.\n\n'
    '👉 HÀNH ĐỘNG CHUẨN: Bạn chỉ cần lấy file vsl_dataset_export.json vừa tải về, ĐỔI TÊN THÀNH vsl_dataset.json và GHI ĐÈ TRỰC TIẾP lên file cũ trong assets/data/vsl_dataset.json. Tuyệt đối không cần phải mở file ra copy dán thủ công từng dòng!',
    '✅ CÂU TRẢ LỜI CHÍNH THỨC:'
)

add_heading1('2. QUY TRÌNH 4 BƯỚC CẬP NHẬT DỮ LIỆU AI CHUẨN (SOP)')

add_heading2('BƯỚC 1: Thu thập hoặc Hiệu chỉnh Mẫu Cử chỉ (gesture_collector.html)')
doc.add_paragraph('1. Mở trang gesture_collector.html trên trình duyệt (hoặc http://localhost/Sign_Speak_Extension/test_call.html).')
doc.add_paragraph('2. Trường hợp THÊM TỪ MỚI:\n'
                  '   • Nhập tên từ mới vào ô (ví dụ: xe_may hoặc may_bay) ➔ Bấm "+ Thêm Từ".\n'
                  '   • Bấm "Bắt Đầu Thu Thập Mẫu Cử Chỉ" ➔ Đưa tay thực hiện cử chỉ 5–8 lần trước camera.\n'
                  '   • Lưu ý giữ tư thế rõ ràng, kết thúc mỗi lần quay thì hạ tay xuống một chút để AI học rõ nhịp kết thúc.')
doc.add_paragraph('3. Trường hợp SỬA ĐỔI / NÂNG CAO ĐỘ NHẠY của từ đã có:\n'
                  '   • Chọn từ cần sửa trong dropdown (ví dụ: cam_on hoặc xin_chao).\n'
                  '   • Bấm xem các mẫu đã quay: Xoá bỏ những mẫu quay bị rung, tay bị lệch khung hình hoặc bị che khuất.\n'
                  '   • Quay bổ sung thêm 3–5 mẫu cử chỉ chuẩn nét nhất.')
doc.add_paragraph('4. Bấm nút "Xuất Dataset (JSON)" ➔ Trình duyệt tự động tải về file vsl_dataset_export.json.')

add_heading2('BƯỚC 2: Ghi đè file Dataset Gốc & Bổ sung Âm thanh Tiếng Việt')
doc.add_paragraph('1. Đổi tên file vsl_dataset_export.json vừa tải về thành vsl_dataset.json.')
doc.add_paragraph('2. Copy đè vào thư mục dự án:\n'
                  '   assets/data/vsl_dataset.json\n'
                  '   (Đường dẫn: c:\\xampp\\htdocs\\Sign_Speak_Extension\\assets\\data\\vsl_dataset.json).')
doc.add_paragraph('3. Thêm file âm thanh phát âm tương ứng:\n'
                  '   • Đặt file âm thanh vào thư mục: assets/audio/<slug_tu>.wav (hoặc .mp3).\n'
                  '   • Ví dụ: từ xe_may thì file âm thanh là xe_may.wav.\n'
                  '   • Nếu chưa có file thu âm thực tế, hệ thống sẽ tự động dùng Web Speech API tiếng Việt làm phương án dự phòng.')

add_heading2('BƯỚC 3: Chạy Lệnh Tự Động Hóa Chuyển Đổi & Versioning (1 Bước Duy Nhất)')
p_cmd = doc.add_paragraph('Mở PowerShell tại thư mục dự án Sign_Speak_Extension và chạy lệnh sau:')
p_box = doc.add_paragraph()
r_c = p_box.add_run('node scripts/convert_dataset_to_binary.js')
r_c.font.bold = True
r_c.font.size = Pt(12)
r_c.font.color.rgb = RGBColor(220, 38, 38)

doc.add_paragraph('Lệnh trên sẽ tự động thực hiện 4 công việc hoàn toàn tự động:')
doc.add_paragraph('• Nén nhị phân Float32Array: Nén file từ 10.83 MB xuống còn 2.79 MB (tải qua mạng chỉ ~1.0 MB, giảm 90.7% dung lượng).')
doc.add_paragraph('• Kiểm tra tính toán toàn vẹn: Tự động so sánh từng số thực giữa bản mã hoá và bản gốc, cam kết sai số 0.000000% (Lossless tuyệt đối).')
doc.add_paragraph('• Tính mã băm SHA-256 duy nhất đại diện cho tập dữ liệu mới.')
doc.add_paragraph('• Tự động tăng phiên bản (Auto-bump Version): Cập nhật tự động vào assets/data/dataset_version.json (ví dụ từ v1.0.1 lên v1.0.2).')

add_heading2('BƯỚC 4: Kiểm thử Toàn vẹn và Đẩy Mã Nguồn')
doc.add_paragraph('1. Chạy bộ kiểm thử tự động để bảo đảm an toàn 100% thuật toán:\n'
                  '   node tests/test_cv_pipeline.js\n'
                  '   (Yêu cầu: Toàn bộ 23/23 Tests đều PASS).')
doc.add_paragraph('2. Commit git:\n'
                  '   git add .\n'
                  '   git commit -m "data: update AI dataset to v1.0.2"\n'
                  '   git push')

add_heading1('3. CƠ CHẾ HOẠT ĐỘNG VỚI CÁC USER KHÁC')
doc.add_paragraph('Sau khi bạn cập nhật và deploy bản dữ liệu mới, các User khác sẽ vận hành như sau:')
doc.add_paragraph('1. Mở ứng dụng ngay trong 0ms: User mở Extension hoặc trang gọi điện vẫn nhận diện được ngay lập tức từ bộ nhớ đệm IndexedDB sẵn có trong máy của họ.')
doc.add_paragraph('2. Tự động kiểm tra phiên bản ngầm: Hệ thống gửi request nhẹ (chỉ 50 bytes) kiểm tra file dataset_version.json trên server.')
doc.add_paragraph('3. Tự động tải ngầm và Hot-Reload: Khi phát hiện mã băm SHA-256 trên server mới hơn trong máy, hệ thống tự động tải file vsl_dataset.bin (~1MB) trong nền, cập nhật vào IndexedDB và nạp nóng ngay vào RAM của AI.')
doc.add_paragraph('4. Bảo toàn từ vựng cá nhân: Các từ vựng riêng do từng user tự quay được lưu tại phân vùng riêng (custom_dataset_bin), hoàn toàn không bị ảnh hưởng hay ghi đè bởi dữ liệu mẫu gốc của hệ thống.')

out_path = r'c:\xampp\htdocs\Sign_Speak_Extension\HUONG_DAN_UPDATE_DATA_AI_CHUAN.docx'
doc.save(out_path)
print('DOCX saved successfully to:', out_path)
