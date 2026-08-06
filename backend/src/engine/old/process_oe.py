import re
from utils.get_bracket_content import get_bracket_content
from utils.extract_loigiai import extract_loigiai
from utils.parse_visuals import *

def process_oe_block(block, teacher_id, question_public_id, subject, grade, parent_id, chapter, lesson, complexity, is_shufflable, source_file_path, target_img_dir):

    # 0. Thay thế TikZ/ảnh thành markdown inline trước khi bóc tách
    q_images, block = parse_visuals(block, source_file_path, target_img_dir, question_public_id)

    # Bóc tách Lời giải
    solution = extract_loigiai(block)

    # Xử lý Layout
    layout_type = "normal"
    content = ""

    if "\\immini" in block:
        immini_pos = block.find("\\immini")
        arg1_start = block.find("{", immini_pos)
        arg1_content, arg1_end = get_bracket_content(block, arg1_start)
        
        arg2_start = block.find("{", arg1_end + 1)
        arg2_content, _ = get_bracket_content(block, arg2_start)
        layout_type = "immini_content"
        content = arg1_content
        if arg2_content.strip():
            content += "\n" + arg2_content.strip()

    else:
        # Trường hợp NORMAL
        parts = re.split(r'\\loigiai', block, maxsplit=1)
        content = parts[0].strip()

    # Tạo object câu hỏi để khớp vào cấu trúc json
    questions_data = {
        "id": None,
        "teacher_id": teacher_id,
        "public_id": question_public_id,
        "subject": subject,
        "grade": grade,
        "parent_id": parent_id,
        "question_type": "oe",
        "layout_type": layout_type,
        "content": content,
        "solution": solution,
        "chapter": chapter,
        "lesson": lesson,
        "complexity": complexity,
        "is_shufflable": is_shufflable,
        "image": q_images
    }

    return questions_data, [], 1