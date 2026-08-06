import os
import json
import uuid
import re
from datetime import datetime
from parsers.process_mc import process_mc_block
from parsers.process_tf import process_tf_block
from parsers.process_sa import process_sa_block
from parsers.process_oe import process_oe_block
from parsers.process_stimulus import process_stimulus_block
from utils.get_bracket_content import get_bracket_content
from data.curriculum import DATA
from utils.utils import replace_math_macros

# Nhận diện loại câu hỏi và gọi hàm xử lý tương ứng
def dispatch_block(block, teacher_id, question_public_id, parent_id, subject, grade, metadata, source_path, img_dir):
    # Đúng/Sai # Xử lý choiceTF trước vì trong choiceTF có choice
    if "\\choiceTF" in block:
        return process_tf_block(block, teacher_id, question_public_id, subject, grade, parent_id, metadata['chapter'], metadata['lesson'], metadata['complexity'], True, source_path, img_dir)
     
    # Trắc nghiệm 4 lựa chọn
    elif "\\choice" in block:
        return process_mc_block(block, teacher_id, question_public_id, subject, grade, parent_id, metadata['chapter'], metadata['lesson'], metadata['complexity'], True, source_path, img_dir)
    
    # Trả lời ngắn
    elif "\\shortans" in block:
        return process_sa_block(block, teacher_id, question_public_id, subject, grade, parent_id, metadata['chapter'], metadata['lesson'], metadata['complexity'], True, source_path, img_dir)
    
    # Tự luận
    else:
        return process_oe_block(block, teacher_id, question_public_id, subject, grade, parent_id, metadata['chapter'], metadata['lesson'], metadata['complexity'], True, source_path, img_dir)


def run_parser(file_path, teacher_id, subject, grade, chapter, lesson, complexity, target_img_dir):

    # Thử nhiều encoding phổ biến cho file .tex tiếng Việt
    content = None
    for enc in ('utf-8-sig', 'utf-8', 'cp1252', 'latin-1'):
        try:
            with open(file_path, 'r', encoding=enc) as f:
                content = f.read()
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if content is None:
        raise ValueError("Không đọc được file .tex — encoding không hỗ trợ")

    # Bảo vệ grade rỗng hoặc không hợp lệ
    try:
        grade_int = int(grade) if grade else 12
    except (ValueError, TypeError):
        grade_int = 12

    # Nếu file có \begin{document}...\end{document}, chỉ lấy phần body
    # Điều này giúp bỏ qua hoàn toàn preamble (documentclass, usepackage, title, v.v.)
    doc_match = re.search(r'\\begin\{document\}(.*?)(?:\\end\{document\}|$)', content, re.DOTALL)
    if doc_match:
        content = doc_match.group(1)

    # Tách riêng các khối tikzpicture để không bị xóa comment bên trong
    tikz_blocks = []
    def save_tikz(match):
        tikz_blocks.append(match.group(0))
        return f"__TIKZ_BLOCK_{len(tikz_blocks)-1}__"

    content = re.sub(r'\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}', save_tikz, content, flags=re.DOTALL)

    # Xóa comment % ở những phần còn lại
    # Fix: Chỉ xóa % khi không phải \% (escape) và không phải \d% (ví dụ: 50%)
    content = re.sub(r'(?<!\\)(?<!\d)(?<!\\\\)%[^\n]*', '', content)

    # Phục hồi các khối tikzpicture
    for i, block in enumerate(tikz_blocks):
        content = content.replace(f"__TIKZ_BLOCK_{i}__", block)

    # Thay thế các lệnh \heva và \hoac
    content = replace_math_macros(content)

    # Xử lý các khối câu hỏi \begin{ex}
    blocks = re.findall(r'\\begin\{ex\}(.*?)\\end\{ex\}', content, re.DOTALL)
    
    final_db_ready_data = []
    metadata = {'chapter': chapter, 'lesson': lesson, 'complexity': complexity}

    import concurrent.futures

    def process_single_block(block):
        sochc_match = re.search(r'\\sochc\s*\{(\d+)\}\s*\{', block)
        temp_blocks_to_process = []
        if sochc_match:
            # Xử lý câu Stimulus
            parent_uuid = str(uuid.uuid4())
            stim_content, stim_end = get_bracket_content(block, sochc_match.end() - 1)
            stim_data = process_stimulus_block(stim_content, teacher_id, parent_uuid, subject, grade_int, None, chapter, lesson, complexity, False, file_path, target_img_dir)
            temp_blocks_to_process.append((stim_data, []))
            
            # Xử lý các câu con (\begin{chc})
            chc_blocks = re.findall(r'\\begin\{chc\}(.*?)\\end\{chc\}', block, re.DOTALL)
            for chc_content in chc_blocks:
                child_uuid = str(uuid.uuid4())
                questions_data, options_data, _ = dispatch_block(chc_content, teacher_id, child_uuid, parent_uuid, subject, grade_int, metadata, file_path, target_img_dir)
                temp_blocks_to_process.append((questions_data, options_data))
        else:
            # CÂU ĐƠN
            question_public_id = str(uuid.uuid4())
            questions_data, options_data, _ = dispatch_block(block, teacher_id, question_public_id, None, subject, grade_int, metadata, file_path, target_img_dir)
            temp_blocks_to_process.append((questions_data, options_data))
        
        block_results = []
        for questions_data, options_data in temp_blocks_to_process:
            if not questions_data: continue
            # Bảng questions
            question_record = {
                "teacher_id": teacher_id,
                "public_id": questions_data.get('public_id'),
                "subject": subject,
                "grade": grade_int,
                "parent_id": questions_data.get('parent_id'),
                "question_type": questions_data.get('question_type'), 
                "layout_type": questions_data.get('layout_type'),
                "content": questions_data.get('content'), 
                "solution": questions_data.get('solution'),
                "chapter": chapter, 
                "lesson": lesson, 
                "complexity": int(complexity),
                "is_shufflable": questions_data.get('is_shufflable', True)
            }

            # Bảng q_images
            images_records = []
            for img in questions_data.get('image', []):
                images_records.append({
                    "storage_path": img.get('storage_path'),
                    "img_type": img.get('img_type'),
                    "img_scale": img.get('img_scale'),
                    "raw_code": img.get('raw_code')
                })
            # Bảng Details
            details_table = {
                "mc": "q_choice_details", 
                "tf": "q_truefalse_details", 
                "sa": "q_shortans_details",
                }.get(questions_data['question_type'])
            
            block_results.append({
                "table_question": question_record,
                "table_images": images_records,
                "table_details": {
                    "target_table": details_table, 
                    "records": options_data}
            })
        return block_results

    # Khởi tạo mô hình AI OCR ở luồng chính (main thread) trước khi chia luồng nhỏ
    # để tránh việc PyTorch bị treo (hang) khi khởi tạo trong ThreadPoolExecutor
    try:
        import torch
        import cv2
        # Giới hạn số luồng của mỗi instance PyTorch = 1 để tránh context-switching
        # khi 8 luồng chạy song song! (Nếu không sẽ mất hơn 120 giây)
        torch.set_num_threads(1)
        cv2.setNumThreads(0)
        
        from parse_visuals import init_latex_ocr
        init_latex_ocr()
    except Exception:
        pass

    # Use ThreadPoolExecutor to process blocks concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        # Submit all tasks and preserve order using map
        results = executor.map(process_single_block, blocks)
        
        for block_results in results:
            final_db_ready_data.extend(block_results)
            
    return final_db_ready_data