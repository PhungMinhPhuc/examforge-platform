import re
from utils.get_bracket_content import get_bracket_content


def _flatten_formatting(s):
    r"""Strip every formatting wrapper (\textbf, \textit, \emph, \ul, \underline,
    \hl, \textcolor{c}{...}) brace-aware and recursively, leaving plain text.

    Used only to test whether an emphasised span is really an option label like
    "B." — Word/pandoc can nest these arbitrarily (e.g. ``\textbf{\ul{B}.}`` where
    the letter is underlined+bold and the dot sits between the layers), which a
    single fixed regex cannot peel.
    """
    simple = ('\\textbf', '\\textit', '\\emph', '\\underline', '\\ul', '\\hl')
    out = []
    i = 0
    n = len(s)
    while i < n:
        matched = False
        # \textcolor{color}{content} — drop the colour arg, flatten the content
        if s.startswith('\\textcolor', i):
            j = i + len('\\textcolor')
            if j < n and s[j] == '{':
                _, e1 = get_bracket_content(s, j)
                if e1 != -1 and e1 + 1 < n and s[e1 + 1] == '{':
                    inner, e2 = get_bracket_content(s, e1 + 1)
                    if e2 != -1:
                        out.append(_flatten_formatting(inner))
                        i = e2 + 1
                        matched = True
        if not matched:
            for cmd in simple:
                if s.startswith(cmd, i) and i + len(cmd) < n and s[i + len(cmd)] == '{':
                    inner, e = get_bracket_content(s, i + len(cmd))
                    if e != -1:
                        out.append(_flatten_formatting(inner))
                        i = e + 1
                        matched = True
                        break
        if not matched:
            out.append(s[i])
            i += 1
    return ''.join(out)


def _mark_emphasis_answers(text):
    r"""Brace-aware handling of \hl{...}, \ul{...} and \underline{...}.

    For each wrapper, inspect its inner content (with any \textbf{} removed):
      * if it begins with an option label "A." … "D.", emit ``__TRUE__<letter>. <rest>``
        — the emphasis was marking the correct answer, so the wrapper is consumed;
      * otherwise keep it as display emphasis (``\ul`` is normalised to ``\underline``)
        so an underlined word in the stem or a highlighted phrase survives untouched.

    Because it walks matched braces instead of matching fixed regex shapes, nestings
    like ``\hl{\textbf{B.} 集まって}`` or ``\textbf{\hl{B. ...}}`` all work, and the
    inner \textbf{B.} can never be rewritten to __OPT__ mid-wrapper (which used to
    split the braces and leak ``\hl{} {content}`` into the previous option).
    """
    display = {'\\hl': '\\hl', '\\underline': '\\underline', '\\ul': '\\underline'}
    out = []
    i = 0
    n = len(text)
    while i < n:
        cmd = None
        for c in ('\\underline', '\\hl', '\\ul'):  # match longest first
            if text.startswith(c, i) and i + len(c) < n and text[i + len(c)] == '{':
                cmd = c
                break
        if cmd is None:
            out.append(text[i])
            i += 1
            continue
        inner, end = get_bracket_content(text, i + len(cmd))
        if end == -1:
            out.append(text[i])
            i += 1
            continue
        inner = _mark_emphasis_answers(inner)  # recurse into nested wrappers
        # Fully de-format the inner text (brace-aware) to test for a label; handles
        # deep nestings like \textbf{\ul{B}.} that a single regex can't peel.
        flat = _flatten_formatting(inner).strip()
        m = re.match(r'([A-D])\s*\.\s*(.*)$', flat, re.DOTALL)
        if m:
            letter, rest = m.group(1), m.group(2).strip()
            out.append(f'__TRUE__{letter}. {rest}' if rest else f'__TRUE__{letter}.')
        else:
            out.append(display[cmd] + '{' + inner + '}')
        i = end + 1
    return ''.join(out)


def strip_pandocbounded(text):
    # \pandocbounded{\includegraphics[...]{...}} -> \includegraphics[...]{...}
    # This might be tricky if there are nested braces, but pandocbounded usually wraps a single includegraphics
    return re.sub(r'\\pandocbounded\{(\\includegraphics[^}]*\}|\\includegraphics[^\]]*\]\{[^}]*\})\}', r'\1', text)

def process_standard_to_btpro(tex_content):
    # Clean up pandocbounded
    tex_content = strip_pandocbounded(tex_content)
    
    # Remove quote blocks pandoc might have added
    tex_content = re.sub(r'\\begin\{quote\}', '', tex_content)
    tex_content = re.sub(r'\\end\{quote\}', '', tex_content)
    
    # Clean up some common LaTeX tags that interfere with parsing
    # Pandoc sometimes adds \textbf{} around \ul{} or vice versa.
    # Handle formats where option content is inside textbf/ul (TogTeX style) first.
    # Pattern allows one level of nested braces (e.g. \text{...}, subscripts) in content.
    _inner = r'(?:[^{}]|\{[^{}]*\})+'
    
    # Ensure option label dots are inside the formatting wrappers so they are 
    # correctly matched by label regexes (e.g. \textbf{\ul{C}.} -> \textbf{\ul{C.}})
    tex_content = re.sub(r'([A-D])\}\.', r'\1.}', tex_content)
    tex_content = re.sub(r'([A-D])\}\}\.', r'\1.}}', tex_content)
    tex_content = re.sub(r'([A-D])\}\}\}\.', r'\1.}}}', tex_content)

    # 1. Handle \textcolor{...}{...} (often red for correct answers)
    tex_content = re.sub(r'\\textcolor\{[^}]+\}\{\\textbf\{([A-D])\.\s*(' + _inner + r')\}\}', r'__TRUE__\1. \2', tex_content)
    tex_content = re.sub(r'\\textbf\{\\textcolor\{[^}]+\}\{([A-D])\.\s*(' + _inner + r')\}\}', r'__TRUE__\1. \2', tex_content)
    tex_content = re.sub(r'\\textcolor\{[^}]+\}\{([A-D])\.\s*(' + _inner + r')\}', r'__TRUE__\1. \2', tex_content)
    
    tex_content = re.sub(r'\\textcolor\{[^}]+\}\{\\textbf\{([A-D])\}\.?\}', r'__TRUE__\1.', tex_content)
    tex_content = re.sub(r'\\textbf\{\\textcolor\{[^}]+\}\{([A-D])\}\.?\}', r'__TRUE__\1.', tex_content)
    tex_content = re.sub(r'\\textcolor\{[^}]+\}\{([A-D])\}\.?\}', r'__TRUE__\1.', tex_content)

    # 2. Handle \ul / \underline / \hl with a brace-aware pass.
    tex_content = _mark_emphasis_answers(tex_content)

    # Normal options
    def replace_opt(m):
        tok = m.group(1)
        if not tok.startswith('__'):
            tok = '__OPT__' + tok
        return tok + '. ' + m.group(2)
        
    tex_content = re.sub(r'\\textbf\{(__(?:OPT|TRUE)__[A-D]|[A-D])\.\s*(' + _inner + r')\}', replace_opt, tex_content)
    tex_content = re.sub(r'\\textbf\{([A-D])\.\}', r'__OPT__\1.', tex_content)
    tex_content = re.sub(r'\\textbf\{([A-D])\}\.', r'__OPT__\1.', tex_content)

    # True/False options clean up (a), b), c), d))
    # Ensure option label parentheses are inside the formatting wrappers
    tex_content = re.sub(r'([a-d])\}\)', r'\1)}', tex_content)
    tex_content = re.sub(r'([a-d])\}\}\)', r'\1))}', tex_content)
    tex_content = re.sub(r'([a-d])\}\}\}\)', r'\1)))}', tex_content)

    # Inject __TF__ or __TRUE__ ONLY if wrapped in formatting! This prevents matching b) in (2a - b)
    tex_content = re.sub(r'\\(?:textbf|textit|emph)\{([a-d])\)\}', r'__TF__\1)', tex_content)
    tex_content = re.sub(r'\\(?:ul|underline|hl)\{([a-d])\)\}', r'__TRUE__\1)', tex_content)
    tex_content = re.sub(r'\\textcolor\{[^}]+\}\{([a-d])\)\}', r'__TRUE__\1)', tex_content)
    
    # Strip any formatting wrappers that wrap exactly the token.
    # If the True/False option label is highlighted/underlined/colored, it means the statement is TRUE.
    for _ in range(3):
        tex_content = re.sub(r'\\(?:textbf|textit|emph|ul|underline|hl)\{__(TRUE|OPT)__([A-D])\.\}', r'__\1__\2.', tex_content)
        tex_content = re.sub(r'\\textcolor\{[^}]+\}\{__(TRUE|OPT)__([A-D])\.\}', r'__\1__\2.', tex_content)

        tex_content = re.sub(r'\\(?:textbf|textit|emph)\{__TF__([a-d])\)\}', r'__TF__\1)', tex_content)
        tex_content = re.sub(r'\\(?:ul|underline|hl)\{__TF__([a-d])\)\}', r'__TRUE__\1)', tex_content)
        tex_content = re.sub(r'\\textcolor\{[^}]+\}\{__TF__([a-d])\)\}', r'__TRUE__\1)', tex_content)

        tex_content = re.sub(r'\\(?:textbf|textit|emph|ul|underline|hl)\{__TRUE__([a-d])\)\}', r'__TRUE__\1)', tex_content)
        tex_content = re.sub(r'\\textcolor\{[^}]+\}\{__TRUE__([a-d])\)\}', r'__TRUE__\1)', tex_content)
    
    # Split by questions. Accept both the bold form (\textbf{Câu 1.}) and the plain
    # form (a line starting with "Câu 1." / "Câu 1:") so files that don't bold the
    # question label are still parsed instead of yielding 0 questions.
    questions = re.split(
        r'\\textbf\{Câu\s+\d+[\.:]?\}[\.:]?'   # bold: \textbf{Câu 1} / \textbf{Câu 1.} / {Câu 1:}
        r'|(?m:^[ \t]*Câu\s+\d+[\.:])',          # plain: line begins with Câu 1. / Câu 1:
        tex_content,
        flags=re.IGNORECASE,
    )
    
    final_tex = ""
    for q_content in questions[1:]:
        if not q_content.strip():
            continue

        # Split into main part and solution part.
        # Matches: \textbf{Hướng dẫn}, \textbf{Lời giải}, \textbf{LỜI GIẢI}, or
        # bare "LỜI GIẢI" / "Lời giải" when not wrapped in \textbf{}.
        parts = re.split(
            r'\\textbf\{[Hh]ướng\s+[Dd]ẫn\}'
            r'|\\textbf\{[Ll]ời\s+[Gg]iải\}'
            r'|\\textbf\{LỜI\s+GIẢI\}'
            r'|\bLỜI\s+GIẢI\b'
            r'|\b[Ll]ời\s+[Gg]iải\b',
            q_content,
        )

        main_part = parts[0]
        solution_part = parts[1] if len(parts) > 1 else ""

        # Save any __TRUE__ hint from solution BEFORE cleaning (used as MC correct-answer fallback)
        _sol_true_match = re.search(r'__TRUE__([A-D])', solution_part)
        _sol_correct_hint = _sol_true_match.group(1) if _sol_true_match else None

        # Remove option tokens from solution (they come from \textbf{a)}, \textbf{A.} etc.
        # in the solution explanation section — convert back to plain labels)
        solution_part = re.sub(r'__TF__([a-d])', r'\1', solution_part)
        solution_part = re.sub(r'__(OPT|TRUE)__([A-D])', r'\2', solution_part)

        # Strip leftover \textbf{} from both parts.  Answer-label markers (A., B., …,
        # a), b), …) were already converted to __OPT__/__TF__ tokens above, so this is
        # safe and removes bold formatting that the frontend would otherwise show literally.
        main_part = re.sub(r'\\textbf\{((?:[^{}\\]|\\.)*)\}', r'\1', main_part)
        solution_part = re.sub(r'\\textbf\{((?:[^{}\\]|\\.)*)\}', r'\1', solution_part)
        
        # Keep emphasis that is NOT an answer marker so the stem matches the original
        # exam (e.g. an underlined word in a Japanese reading question, or a
        # highlighted phrase). Answer-marker underline/highlight on A./B./C./D. labels
        # was already turned into __TRUE__ above, so whatever \ul/\underline/\hl remains
        # is genuine content. Rename \ul → \underline because the frontend renders
        # \underline as <u> and \hl as <mark>; leave \underline / \hl untouched.
        main_part = main_part.replace(r'\ul{', r'\underline{')
        solution_part = solution_part.replace(r'\ul{', r'\underline{')

        # Drop empty emphasis wrappers (e.g. \hl{} left when a highlighted run held
        # only a space) — otherwise the frontend would print them literally.
        main_part = re.sub(r'\\(?:hl|underline)\{\s*\}', '', main_part)
        solution_part = re.sub(r'\\(?:hl|underline)\{\s*\}', '', solution_part)

        # Strip leftover \textcolor{...}{}
        main_part = re.sub(r'\\textcolor\{[^}]+\}\{((?:[^{}\\]|\\.)*)\}', r'\1', main_part)
        solution_part = re.sub(r'\\textcolor\{[^}]+\}\{((?:[^{}\\]|\\.)*)\}', r'\1', solution_part)
        
        # Determine question type
        is_short_answer = False
        short_answer_val = ""
        # Check Short Answer
        sa_match = re.search(r'(?:Đáp án|Trả lời ngắn|Trả lời)\s*:\s*([^\n]+)', main_part + "\n" + solution_part, flags=re.IGNORECASE)
        if sa_match:
            is_short_answer = True
            short_answer_val = sa_match.group(1).strip()
            
        # Check True False
        is_true_false = False
        if not is_short_answer and '__OPT__' not in main_part:
            if '__TF__' in main_part or '__TRUE__' in main_part:
                is_true_false = True
            else:
                has_a = re.search(r'(?:\n|^)\s*a\)', main_part)
                has_b = re.search(r'(?:\n|^)\s*b\)', main_part)
                has_c = re.search(r'(?:\n|^)\s*c\)', main_part)
                if has_a and has_b and has_c:
                    is_true_false = True

        if is_short_answer:
            # Xóa dòng Đáp án: khỏi main_part và solution_part
            main_part = re.sub(r'(?:Đáp án|Trả lời ngắn|Trả lời)\s*:\s*[^\n]+', '', main_part, flags=re.IGNORECASE).strip()
            solution_part = re.sub(r'(?:Đáp án|Trả lời ngắn|Trả lời)\s*:\s*[^\n]+', '', solution_part, flags=re.IGNORECASE).strip()
            final_tex += f"\\begin{{ex}}\n{main_part}\n\\shortans{{{short_answer_val}}}\n"

        elif is_true_false:
            # Replace raw a) with __TF__a) if not already
            if not '__TF__' in main_part and not '__TRUE__' in main_part:
                main_part = re.sub(r'(?:\n|^)\s*([a-d])\)', r'\n__TF__\1)', main_part)
                
            opts_split = re.split(r'__(TF|TRUE)__([a-d])\)', main_part)
            question_text = opts_split[0].strip()
            
            options_dict = {}
            correct_set = set()
            i = 1
            while i < len(opts_split) - 2:
                is_true = opts_split[i] == 'TRUE'
                letter = opts_split[i+1].lower()
                content = opts_split[i+2].strip() if i+2 < len(opts_split) else ""
                
                if is_true:
                    correct_set.add(letter)

                # A highlighted/underlined/coloured statement is the one marked Đúng
                # (True); the rest stay Sai (False). Unwrap the emphasis for clean display.
                if re.search(r'\\(?:hl|underline|ul)\{', content) or re.search(r'\\textcolor\{', content):
                    correct_set.add(letter)
                    content = re.sub(r'\\(?:hl|underline|ul)\{((?:[^{}\\]|\\.)*)\}', r'\1', content)
                    content = re.sub(r'\\textcolor\{[^}]+\}\{((?:[^{}\\]|\\.)*)\}', r'\1', content)
                    content = content.strip()
                options_dict[letter] = content
                i += 3

            final_tex += f"\\begin{{ex}}\n{question_text}\n\\choiceTF\n"
            for letter in ['a', 'b', 'c', 'd']:
                if letter in options_dict:
                    # Highlight/gạch chân mệnh đề → \True (Đúng); còn lại để trống (Sai).
                    prefix = "\\True " if letter in correct_set else ""
                    final_tex += f"{{{prefix}{options_dict[letter]}}}\n"
                else:
                    final_tex += "{}\n"

        else:
            # Multiple Choice (Default)
            # Fallback: nếu phương án không bôi đậm thì các nhãn "A.".."D." chưa được
            # đánh dấu __OPT__. Nhận diện nhãn dù ở ĐẦU DÒNG hay GIỮA DÒNG (cả 4 đáp án
            # nằm chung một dòng) — miễn là theo sau là khoảng trắng. Nhãn đã thành
            # __OPT__/__TRUE__ đứng sau '_' nên (?<![\w_]) bỏ qua; chữ giữa từ (vd "AB.")
            # cũng bị loại vì ký tự trước là chữ.
            main_part = re.sub(r'(?<![\w_])([A-D])\.(?=\s)', r'__OPT__\1.', main_part)
            opts_split = re.split(r'__(TRUE|OPT)__([A-D])\.', main_part)
            question_text = opts_split[0].strip()
            
            options_dict = {}
            correct_ans = None
            
            i = 1
            while i < len(opts_split) - 1:
                is_true = (opts_split[i] == 'TRUE')
                letter = opts_split[i+1].upper()
                content = opts_split[i+2].strip() if i+2 < len(opts_split) else ""
                # An option whose CONTENT (not just its label) is highlighted/underlined/
                # coloured is the marked answer too — e.g. "\textbf{D.} \hl{以下}", where
                # the emphasis sits after the label. Flag it correct, then unwrap the
                # emphasis so the stored option text is clean.
                if re.search(r'\\(?:hl|underline|ul)\{', content) or re.search(r'\\textcolor\{', content):
                    is_true = True
                    content = re.sub(r'\\(?:hl|underline|ul)\{((?:[^{}\\]|\\.)*)\}', r'\1', content)
                    content = re.sub(r'\\textcolor\{[^}]+\}\{((?:[^{}\\]|\\.)*)\}', r'\1', content)
                    content = content.strip()
                options_dict[letter] = content
                if is_true:
                    correct_ans = letter
                i += 3
                
            if not correct_ans and _sol_correct_hint:
                correct_ans = _sol_correct_hint
            if not correct_ans and solution_part:
                match = re.search(r'Chọn\s+([A-D])', solution_part, flags=re.IGNORECASE)
                if match:
                    correct_ans = match.group(1).upper()
                    
            if not options_dict:
                # Không tìm thấy bất kỳ đáp án A, B, C, D nào -> Tự luận
                final_tex += f"\\begin{{ex}}\n{question_text}\n"
            else:
                final_tex += f"\\begin{{ex}}\n{question_text}\n\\choice\n"
                for letter in ['A', 'B', 'C', 'D']:
                    if letter in options_dict:
                        prefix = "\\True " if letter == correct_ans else ""
                        final_tex += f"{{{prefix}{options_dict[letter]}}}\n"
                    else:
                        final_tex += "{}\n"
                
        if solution_part.strip():
            cleaned_solution = re.sub(r'\.?\s*Chọn\s+[A-D]\s*', '', solution_part, flags=re.IGNORECASE).strip()
            # Xóa Đáp án ra khỏi lời giải nếu có
            cleaned_solution = re.sub(r'(?:Đáp án|Trả lời ngắn)\s*:\s*[^\n]+', '', cleaned_solution, flags=re.IGNORECASE).strip()
            if cleaned_solution:
                final_tex += f"\\loigiai{{\n{cleaned_solution}\n}}\n"
            
        final_tex += "\\end{ex}\n\n"
        
    return final_tex

def convert_standard_docx_to_tex(docx_path, tex_path):
    with open(tex_path, "r", encoding="utf-8") as f:
        tex = f.read()
        
    btpro = process_standard_to_btpro(tex)
    
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(btpro)
    
    return tex_path
