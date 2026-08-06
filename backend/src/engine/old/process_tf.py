import re
from utils.get_bracket_content import get_bracket_content
from utils.extract_loigiai import extract_loigiai
from utils.parse_visuals import *

def process_tf_block(block, teacher_id, question_public_id, subject, grade, parent_id, chapter, lesson, complexity, is_shufflable, source_file_path, target_img_dir):

    # 0. Thay thế TikZ/ảnh thành markdown inline trước khi bóc tách
    q_images, block = parse_visuals(block, source_file_path, target_img_dir, question_public_id)

    # Xử lý Layout và Hình ảnh
    layout_type = "normal"
    content = ""
    options_part = ""

    if "\\immini" in block:
        immini_pos = block.find("\\immini")
        arg1_start = block.find("{", immini_pos)
        arg1_content, arg1_end = get_bracket_content(block, arg1_start)
        
        arg2_start = block.find("{", arg1_end + 1)
        arg2_content, arg2_end = get_bracket_content(block, arg2_start)

        if "\\choiceTF" in arg1_content:
            layout_type = "immini_all"
            parts = re.split(r'\\choiceTF', arg1_content, maxsplit=1)
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
        parts = re.split(r'\\choiceTF', block, maxsplit=1)
        content = parts[0].strip()
        options_part = block[len(parts[0]):] if len(parts) > 1 else ""
    
    # Bóc tách Lời giải
    solution_tex = extract_loigiai(block)

    # Bóc tách 4 Lời giải ứng với phương án
    tf_statements = []

    if solution_tex is not None:
        itemchoice_match = re.search(
            r'\\begin\s*\{\s*itemchoice\s*\}(.*?)\\end\s*\{\s*itemchoice\s*\}',
            solution_tex,
            re.DOTALL
        )
        if itemchoice_match:
            item_block = itemchoice_match.group(1)
            general_solution = solution_tex[:itemchoice_match.start()].strip()
            parts = re.split(r'\\itemch', item_block)
            tf_statements = [p.strip() for p in parts[1:]]
        else:
            general_solution = solution_tex
    else:
        general_solution = None

    # Tạo object câu hỏi để khớp vào cấu trúc json
    questions_data = {
        "id": None,
        "teacher_id": teacher_id,
        "public_id": question_public_id,
        "subject": subject,
        "grade": grade,
        "parent_id": parent_id,
        "question_type": "tf",
        "layout_type": layout_type,
        "content": content,
        "solution": general_solution,
        "chapter": chapter,
        "lesson": lesson,
        "complexity": complexity,
        "is_shufflable": is_shufflable,
        "image": q_images
    }

    # Bóc tách 4 Phương án
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
            "explaination": tf_statements[opt_index - 1] if (tf_statements and (opt_index - 1) < len(tf_statements)) else None,
            "order_index": opt_index,
            "is_shufflable": True
        })
        option_search_pos = end_opt + 1
        opt_index += 1
    
    return questions_data, parsed_options, 1
