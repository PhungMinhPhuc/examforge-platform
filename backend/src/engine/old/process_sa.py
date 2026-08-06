import re
from utils.get_bracket_content import get_bracket_content
from utils.extract_loigiai import extract_loigiai
from utils.parse_visuals import *

def process_sa_block(block, teacher_id, question_public_id, subject, grade, parent_id, chapter, lesson, complexity, is_shufflable, source_file_path, target_img_dir):

    # 0. Thay thế TikZ/ảnh thành markdown inline trước khi bóc tách
    q_images, block = parse_visuals(block, source_file_path, target_img_dir, question_public_id)

    # Bóc tách Lời giải
    solution = extract_loigiai(block)

    # Xử lý Layout và Hình ảnh
    layout_type = "normal"
    content = ""
    short_answer = ""

    if "\\immini" in block:
        immini_pos = block.find("\\immini")
        # Tham số 1 của immini (Nội dung câu hỏi hoặc bao gồm cả shortans)
        arg1_start = block.find("{", immini_pos)
        arg1_content, arg1_end = get_bracket_content(block, arg1_start)
        
        # Tham số 2 của immini (Mã hình ảnh - giờ đã là markdown tag)
        arg2_start = block.find("{", arg1_end + 1)
        arg2_content, _ = get_bracket_content(block, arg2_start)

        if "\\shortans" in arg1_content:
            layout_type = "immini_all"
            parts = re.split(r'\\shortans', arg1_content, maxsplit=1)
            content = parts[0].strip()
            # Ghép ảnh từ arg2 vào content
            if arg2_content.strip():
                content += "\n" + arg2_content.strip()
            shortans_pos = arg1_content.find("{", arg1_content.find(r'\shortans'))
            if shortans_pos != -1:
                short_answer, _ = get_bracket_content(arg1_content, shortans_pos)
        else:
            layout_type = "immini_content"
            content = arg1_content
            # Ghép ảnh từ arg2 vào content
            if arg2_content.strip():
                content += "\n" + arg2_content.strip()
            shortans_pos = block.find(r'\shortans')
            if shortans_pos != -1:
                brace_start = block.find("{", shortans_pos)
                if brace_start != -1:
                    short_answer, _ = get_bracket_content(block, brace_start)
    
    else:
        # Trường hợp NORMAL (bao gồm cả center vì ảnh đã được inline)
        parts = re.split(r'\\shortans', block, maxsplit=1)
        content = parts[0].strip()
        shortans_pos = block.find(r'\shortans')
        if shortans_pos != -1:
            brace_start = block.find("{", shortans_pos)
            if brace_start != -1:
                short_answer, _ = get_bracket_content(block, brace_start)

    # Xóa phần loigiai còn dính trong content
    content = re.sub(r'\\loigiai\s*\{.*', '', content, flags=re.DOTALL).strip()

    # Tạo object câu hỏi để khớp vào cấu trúc json
    questions_data = {
        "id": None,
        "teacher_id": teacher_id,
        "public_id": question_public_id,
        "subject": subject,
        "grade": grade,
        "parent_id": parent_id,
        "question_type": "sa",
        "layout_type": layout_type,
        "content": content,
        "solution": solution,
        "chapter": chapter,
        "lesson": lesson,
        "complexity": complexity,
        "is_shufflable": is_shufflable,
        "image": q_images
    }

    # Điền nội dung vào file json
    parsed_options = []
    if short_answer:
        parsed_options.append({
            "id": None,
            "question_id": None,
            "content": short_answer
        })

    return questions_data, parsed_options, 1