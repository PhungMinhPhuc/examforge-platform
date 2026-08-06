import re
import os
import subprocess
import sys
import json

try:
    import docx
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-docx"])
    import docx

def clean_latex_tags(text):
    # Remove \textbf, \textit, etc around keywords to make it easier to match
    text = re.sub(r'\\textbf\{([^}]*)\}', r'\1', text)
    text = re.sub(r'\\textit\{([^}]*)\}', r'\1', text)
    return text

def extract_standardized_tables(docx_path):
    doc = docx.Document(docx_path)
    # Tìm 3 bảng cuối cùng hoặc các bảng có chứa chữ 'Câu' / 'Chọn'
    answers = {'P1': {}, 'P2': {}, 'P3': {}}
    
    for table in doc.tables:
        data = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        if not data: continue
        
        # Cả P1 và P3 đều có dạng: Câu - Chọn
        if data[0][0].lower() == 'câu' and len(data) >= 2 and data[1][0].lower() == 'chọn':
            is_p3 = False
            for c_idx in range(1, len(data[0])):
                ans = data[1][c_idx]
                if ans and ans.upper() not in ['A', 'B', 'C', 'D', '']:
                    is_p3 = True
                    break
            
            for c_idx in range(1, len(data[0])):
                q_num = data[0][c_idx]
                ans = data[1][c_idx]
                if q_num and q_num.isdigit() and ans:
                    if is_p3:
                        answers['P3'][q_num] = ans
                    else:
                        answers['P1'][q_num] = ans.upper()
            continue
                    
        # Phần 2: Bảng Đúng Sai (dòng đầu là số câu 1 2 3 4)
        # Các dòng sau là a) Đ, b) S...
        if data[0][0].isdigit() and len(data) >= 5:
            if data[1][0].lower().startswith('a)'):
                for c_idx in range(len(data[0])):
                    q_num = data[0][c_idx]
                    if not q_num.isdigit(): continue
                    answers['P2'][q_num] = {}
                    for r_idx in range(1, 5):
                        val = data[r_idx][c_idx].upper()
                        # val thường là "a) Đ" hoặc "a) S"
                        if 'Đ' in val or 'D' in val:
                            answers['P2'][q_num][r_idx - 1] = True
                        elif 'S' in val:
                            answers['P2'][q_num][r_idx - 1] = False
                            

                        
    return answers

def process_standardized_to_btpro(tex_content, answers):
    # Dọn dẹp sơ các tag bao quanh PHẦN, Câu
    # Mẫu 1: \textbf{PHẦN II. ...}
    tex_content = re.sub(r'\\textbf\{PHẦN\s+(I{1,3})[^\}]*\}', r'PHẦN \1', tex_content, flags=re.IGNORECASE)
    # Mẫu 2: PHẦN II. ...
    tex_content = re.sub(r'PHẦN\s+(I{1,3})[^\n]*', r'PHẦN \1', tex_content, flags=re.IGNORECASE)
    
    # Mẫu Câu 1: \textbf{Câu} \textbf{1.}
    tex_content = re.sub(r'\\textbf\{Câu\}\s*\\textbf\{(\d+)[^\}]*\}', r'Câu \1.', tex_content, flags=re.IGNORECASE)
    # Mẫu Câu 1: \textbf{Câu 1.}
    tex_content = re.sub(r'\\textbf\{Câu\s*(\d+)[^\}]*\}', r'Câu \1.', tex_content, flags=re.IGNORECASE)
    
    parts = re.split(r'PHẦN\s+(I{1,3})', tex_content, flags=re.IGNORECASE)
    
    if len(parts) == 1:
        parts = ["", "I", tex_content]
    
    final_tex = ""
    
    current_part = None
    for i in range(1, len(parts), 2):
        part_name = parts[i].upper()
        part_content = parts[i+1]
        
        # Tách các câu (Hỗ trợ cả Câu 1. và Câu 1:)
        questions = re.split(r'Câu\s+(\d+)[\.\:]', part_content, flags=re.IGNORECASE)
        
        for j in range(1, len(questions), 2):
            q_num = questions[j]
            q_content = questions[j+1]
            
            # Xóa các lời giải ở cuối
            q_content = re.split(r'\\textbf\{Lời giải\}|Lời giải|HẾT', q_content)[0]
            
            if part_name == 'I':
                # Tìm A. B. C. D.
                # Cẩn thận A. B. C. D. có thể nằm trong \textbf{A.}
                # Ta làm sạch A. B. C. D.
                q_content = re.sub(r'\\textbf\{([A-D])\.\}', r'\1.', q_content)
                q_content = re.sub(r'\\textbf\{([A-D])\}\.', r'\1.', q_content)
                
                # Split options
                opts = re.split(r'(?:\n|^|\s+)([A-D])\.\s+', q_content)
                main_q = opts[0]
                
                options_dict = {}
                for k in range(1, len(opts), 2):
                    opt_letter = opts[k].upper()
                    opt_text = opts[k+1].strip()
                    options_dict[opt_letter] = opt_text
                
                ans_key = answers['P1'].get(q_num)
                
                final_tex += f"\\begin{{ex}}\n{main_q.strip()}\n\\choice\n"
                for letter in ['A', 'B', 'C', 'D']:
                    if letter in options_dict:
                        prefix = "\\True " if letter == ans_key else ""
                        final_tex += f"{{{prefix}{options_dict[letter]}}}\n"
                    else:
                        final_tex += "{}\n"
                final_tex += "\\end{ex}\n\n"
                
            elif part_name == 'II':
                # Tìm a) b) c) d)
                q_content = re.sub(r'\\textbf\{([a-d])\)\}', r'\1)', q_content)
                opts = re.split(r'(?:\n|^|\s+)([a-d])\)\s+', q_content)
                main_q = opts[0]
                
                options_list = []
                for k in range(1, len(opts), 2):
                    options_list.append(opts[k+1].strip())
                
                ans_dict = answers['P2'].get(q_num, {})
                
                final_tex += f"\\begin{{ex}}\n{main_q.strip()}\n\\choiceTF\n"
                for idx in range(4):
                    if idx < len(options_list):
                        is_true = ans_dict.get(idx, False)
                        prefix = "\\True " if is_true else ""
                        final_tex += f"{{{prefix}{options_list[idx]}}}\n"
                    else:
                        final_tex += "{}\n"
                final_tex += "\\end{ex}\n\n"
                
            elif part_name == 'III':
                ans_key = answers['P3'].get(q_num, "")
                final_tex += f"\\begin{{ex}}\n{q_content.strip()}\n\\shortans{{{ans_key}}}\n\\end{{ex}}\n\n"

    return final_tex

def convert_standardized_docx_to_tex(docx_path, tex_path):
    answers = extract_standardized_tables(docx_path)
    
    with open(tex_path, "r", encoding="utf-8") as f:
        tex = f.read()
        
    btpro = process_standardized_to_btpro(tex, answers)
    
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(btpro)
    
    return tex_path
