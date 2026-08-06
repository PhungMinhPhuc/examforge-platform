import re
from utils.get_bracket_content import get_bracket_content
from utils.extract_loigiai import extract_loigiai
from utils.parse_visuals import *

def clean_centering_commands(text):
    if not text: return ""
    # Xóa \centering
    text = re.sub(r'\\centering', '', text)
    # Xóa toàn bộ cụm \centerline{...} vì nội dung bên trong thường là ảnh đã được bóc tách
    text = re.sub(r'\\centerline\s*\{.*?\}', '', text, flags=re.DOTALL)
    return text.strip()

# Kiểm tra xem phương án có nên được trộn hay không dựa trên nội dung.
def check_smart_shufflable_default(content):
    fixed_keywords = [
        "tất cả", "đều đúng", "đều sai", "không có", 
        "cả a và b", "cả b và c", "cả a và c", "cả a, b, c", "cả 3"
    ]
    
    for key in fixed_keywords:
        if key in content.lower():
            return False # Nếu có từ khóa nhạy cảm thì KHÔNG cho trộn
    return True # Ngược lại cho trộn bình thường

# Xử lý nội dung bên trong một block (ex or chc)
def process_mc_block(block, teacher_id, question_public_id, subject, grade, parent_id, chapter, lesson, complexity, is_shufflable, source_file_path, target_img_dir):
        
    # 0. Thay thế TikZ/ảnh thành markdown inline trước khi bóc tách
    q_images, block = parse_visuals(block, source_file_path, target_img_dir, question_public_id)

    # 1. Bóc tách Lời giải (Luôn lấy phần này trước và xóa khỏi block để xử lý phần trên dễ hơn)
    solution = extract_loigiai(block)

    # 2. Xử lý Layout và Hình ảnh
    layout_type = "normal"
    content = ""
    options_part = ""

    if "\\immini" in block:
        immini_pos = block.find("\\immini")
        arg1_start = block.find("{", immini_pos)
        arg1_content, arg1_end = get_bracket_content(block, arg1_start)
        
        arg2_start = block.find("{", arg1_end + 1)
        arg2_content, arg2_end = get_bracket_content(block, arg2_start)

        if "\\choice" in arg1_content:
            layout_type = "immini_all"
            parts = re.split(r'\\choice', arg1_content, maxsplit=1)
            content = parts[0].strip()
            if arg2_content.strip():
                content += "\n" + arg2_content.strip()
            options_part = arg1_content[len(parts[0]):]
        else:
            layout_type = "immini_content"
            content = arg1_content
            if arg2_content.strip():
                content += "\n" + arg2_content.strip()
            options_part = block[arg2_end + 1:]
    
    else:
        # Trường hợp normal (bao gồm cả center vì ảnh đã được inline)
        parts = re.split(r'\\choice', block, maxsplit=1)
        content = parts[0].strip()
        options_part = block[len(parts[0]):] if len(parts) > 1 else ""
        
    content = clean_centering_commands(content)

    # Tạo object câu hỏi để khớp vào cấu trúc json
    questions_data = {
        "id": None,
        "teacher_id": teacher_id,
        "public_id": question_public_id,
        "subject": subject,
        "grade": grade,
        "parent_id": parent_id,
        "question_type": "mc",
        "layout_type": layout_type,
        "content": content,
        "solution": solution,
        "chapter": chapter,
        "lesson": lesson,
        "complexity": complexity,
        "is_shufflable": is_shufflable,
        "image": q_images
    }

    # Bóc tách 4 Phương án (Dùng hàm duyệt ngoặc để an toàn tuyệt đối)
    parsed_options = []
    option_search_pos = 0
    opt_index = 1
    while True:
        start_opt = options_part.find("{", option_search_pos)
        if start_opt == -1 or opt_index > 4: break
        
        opt_content, end_opt = get_bracket_content(options_part, start_opt)
        is_correct = "\\True" in opt_content

        parsed_options.append({
            "id": None,
            "question_id": None,
            "content": opt_content.replace("\\True", "").strip(),
            "is_correct": is_correct,
            "order_index": opt_index,
            "is_shufflable": check_smart_shufflable_default(opt_content)
        })
        option_search_pos = end_opt + 1
        opt_index += 1

    return questions_data, parsed_options, 1 # Trả về 1 vì hàm này vừa xủ lý xong đúng 1 câu
