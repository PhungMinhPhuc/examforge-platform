import os
import subprocess
import tempfile
import re

def unescape_latex(text: str) -> str:
    """
    Pandoc escapes LaTeX macros when converting from DOCX (since it assumes they are plain text).
    This function unescapes them back to valid LaTeX.
    """
    # Xóa các khoảng trắng do pandoc tự thêm vào sau dấu backslash và ngoặc

    # 1. Khôi phục các thẻ chính
    replacements = [
        (r'\textbackslash begin\{ex\}', r'\begin{ex}'),
        (r'\textbackslash end\{ex\}', r'\end{ex}'),
        (r'\textbackslash choice', r'\choice'),
        (r'\textbackslash True', r'\True'),
        (r'\textbackslash loigiai', r'\loigiai'),
        (r'\textbackslash shortans', r'\shortans'),
        (r'\textbackslash choiceTF', r'\choiceTF'),
        (r'\textbackslash motcot', r'\motcot'),
        (r'\textbackslash haicot', r'\haicot'),
        (r'\textbackslash info', r'\info'),
        (r'\textbackslash heva', r'\heva'),
        (r'\textbackslash hoac', r'\hoac'),
    ]

    for old, new in replacements:
        text = text.replace(old, new)

    # 2. Khôi phục các dấu ngoặc nhọn bị escape do người dùng gõ
    # Lưu ý: pandoc escape `{` thành `\{` và `}` thành `\}`
    # Trong các thẻ LaTeX (vd \choice{A}{B}), pandoc sẽ biến thành \textbackslash choice\{A\}\{B\}
    # Sau bước 1, nó thành \choice\{A\}\{B\}
    # Ta cần khôi phục \{ thành { nhưng phải cẩn thận không phá hỏng cấu trúc
    # Cách tốt nhất là replace toàn bộ \{ và \} thành { và } vì trong ngữ cảnh này,
    # người dùng ít khi gõ \{ với ý nghĩa là ký tự \{ thực sự (trừ khi trong toán, mà toán thì pandoc đã bọc $..$ rồi)
    text = text.replace(r'\{', '{').replace(r'\}', '}')

    # 3. Một số macro toán học đôi khi bị pandoc hiểu nhầm nếu không dùng MathType
    # (Nhưng đa phần OMML đã chuyển thành chuẩn)

    return text


def normalize_textbf_whitespace(text: str) -> str:
    """
    Pandoc sometimes inserts a newline (or several blank lines) right after \\textbf{.
    This must run BEFORE simplify_pandoc_tables so table cells don't inherit the newline.

    \\textbf{\\n (2)}  →  \\textbf{(2)}
    \\textbf{\\n\\n $x=10$\\n. }  →  \\textbf{$x=10$.}

    Uses [^{}]* to stay safe with non-nested content; pairs with nested braces are left alone.
    """
    # Strip leading whitespace (including newlines) inside \textbf{
    text = re.sub(r'\\textbf\{\s*\n\s*', r'\\textbf{', text)
    # Collapse all remaining internal whitespace (multi-blank-line bodies)
    text = re.sub(
        r'\\textbf\{([^{}]*)\}',
        lambda m: r'\textbf{' + re.sub(r'\s+', ' ', m.group(1)).strip() + '}',
        text,
    )
    return text


def unescape_pandoc_math(text: str) -> str:
    """Khôi phục các ký tự toán học bị Pandoc escape khi nó coi là plain text (vd từ Togtex)."""
    text = text.replace(r'\$', '$')

    def _unescape_togtex(s):
        s = re.sub(r'\\textbackslash\\textbackslash(?:\{\})?', r'\\\\', s)
        s = s.replace(r'\textbackslash ', '\\')
        s = s.replace(r'\textbackslash', '\\')
        s = s.replace(r'\{', '{')
        s = s.replace(r'\}', '}')
        s = s.replace(r'\^{}', '^')
        s = s.replace(r'\_', '_')
        s = s.replace(r'\~{}', '~')
        s = s.replace(r'\>', '>')
        s = s.replace(r'\<', '<')
        s = s.replace(r'\textasciitilde{}', r'\sim')
        s = s.replace(r'\textasciitilde', r'\sim')
        s = s.replace(r'\&', '&')
        return s

    def _replacer(match):
        prefix = match.group(1)
        s = match.group(2)
        
        if prefix == '$$':
            return '$$' + _unescape_togtex(s) + '$$'
        elif prefix == '$':
            return '$' + _unescape_togtex(s) + '$'
        elif prefix == r'\textbackslash{[' + '}':
            return r'\[' + _unescape_togtex(s) + r'\]'
        elif prefix == r'\textbackslash(':
            return r'\(' + _unescape_togtex(s) + r'\)'
        return match.group(0)

    # Unescape Togtex math blocks (which Pandoc escaped as plain text)
    pattern = r'(\$\$|\$|\\textbackslash\{\[\}|\\textbackslash\()(.*?)(\$\$|\$|\\textbackslash\{\]\}|\\textbackslash\))'
    text = re.sub(pattern, _replacer, text, flags=re.DOTALL)

    # These patterns must be handled for OMML display math or leftovers
    # \textbackslash{[} / {]} → display-math delimiters \[ / \]
    text = text.replace(r'\textbackslash{[}', r'\[')
    text = text.replace(r'\textbackslash{]}', r'\]')
    # \textbar is pandoc's escape for | — use \vert so it renders in KaTeX and
    # does not break markdown table cell delimiters
    text = re.sub(r'\\textbar(?:\{\})?', r'\\vert ', text)
    # {[} is pandoc's way of protecting [ from being parsed as an optional-arg opener;
    # strip it when it appears immediately before \left so the math renders correctly
    text = re.sub(r'\{\[\}\s*(?=\\left)', '', text)
    # Any remaining {[} / {]} are pandoc-escaped literal brackets (e.g. [竹] in plain
    # text) — restore them so they don't show up literally as "{[}竹{]}".
    text = text.replace('{[}', '[').replace('{]}', ']')
    # Two adjacent inline-math blocks like $A$$B$ are unescaped from \$A\$\$B\$.
    # $$ in the middle of a line means display-math in LaTeX/KaTeX, not two inlines.
    # Insert a space to separate them: $A$ $B$.
    text = re.sub(r'(?<=[^\n$])\$\$(?=[^\n$])', r'$ $', text)
    return text


def fix_misplaced_right_dot(text: str) -> str:
    """
    Pandoc misplaces \\right. in two distinct patterns when converting Word equation systems.

    Pattern A — \\right. is the first token inside \\begin{array}:
        \\left\\{...\\begin{array}{spec}
        \\right.[array body]
        \\end{array}
      Fix: move \\right. to after \\end{array}.

    Pattern B — \\right. appears on its own line immediately after \\left\\{, with no array:
        \\left\\{
        \\right.
        content line 1
        content line 2
      Fix: wrap content in \\begin{array}{l}...\\end{array} between \\left\\{ and \\right..
    """
    # --- Pattern A ---
    pattern_a = (
        r'(\\left\s*\\\{[^$\n]*?\\begin\{array\}\{[^}]+\})'  # \left\{...\begin{array}{spec}
        r'[ \t]*\n[ \t]*\\right\.'                              # \right. on next line
        r'(.*?)'                                                # array body
        r'(\\end\{array\})'                                     # \end{array}
    )
    def _repl_a(m):
        return m.group(1) + '\n' + m.group(2) + m.group(3) + r'\right.'
    text = re.sub(pattern_a, _repl_a, text, flags=re.DOTALL)

    # --- Pattern B ---
    # \left\{ on its own line, \right. on the very next non-empty line, content following
    pattern_b = (
        r'(\\left\s*\\\{)'           # \left\{
        r'[ \t]*\n[ \t]*'            # only spaces/tabs before newline (no real content)
        r'\\right\.[ \t]*\n'         # \right. immediately on the next line
        r'((?:[^\n$][^\n]*\n?)+?)'   # one or more content lines (no $ at line start)
        r'(?=[ \t]*\$)'              # stop just before the closing $
    )
    def _repl_b(m):
        left = m.group(1)
        content_str = m.group(2).strip()
        lines = [l.strip() for l in content_str.split('\n') if l.strip()]
        if not lines:
            return m.group(0)
        array_body = ' \\\\\n'.join(lines)
        return left + r'\begin{array}{l}' + '\n' + array_body + '\n' + r'\end{array}\right.'
    text = re.sub(pattern_b, _repl_b, text, flags=re.DOTALL)

    return text


def simplify_pandoc_tables(tex: str) -> str:
    """Converts Pandoc's longtable+minipage mess into LaTeX array environments for KaTeX."""
    def _strip_math_delimiters(c: str) -> str:
        """Remove math wrappers from cell (array env is already in math mode)."""
        c = re.sub(r'\\\[(.+?)\\\]', r'\1', c, flags=re.DOTALL)
        c = re.sub(r'\\\((.+?)\\\)', r'\1', c, flags=re.DOTALL)
        c = re.sub(r'\$\$(.+?)\$\$', r'\1', c, flags=re.DOTALL)
        c = re.sub(r'\\\$(.+?)\\\$', r'\1', c, flags=re.DOTALL)
        c = re.sub(r'\$(.+?)\$', r'\1', c, flags=re.DOTALL)
        return c

    def repl(match):
        block = match.group(0)
        # Strip header boilerplate up to and including \toprule
        block = re.sub(r'\{\\def\\LTcaptype\{none\}[^\n]*\n\\begin\{longtable\}[^}]*\}[^\n]*\n(?:[ \t]*>?[^\n]*\n)*?\\toprule(?:\\noalign\{\})?', '', block, flags=re.DOTALL)
        # Remove table control commands (no longer needed in array output)
        block = re.sub(r'\\(?:midrule|bottomrule)(?:\\noalign\{\})?', '', block)
        block = re.sub(r'\\endhead|\\endlastfoot', '', block)
        # Remove minipage wrappers (\raggedright is optional across pandoc versions)
        block = re.sub(r'\\begin\{minipage\}[^}]*\}\s*(?:\\raggedright\s*)?', '', block)
        block = re.sub(r'\s*\\end\{minipage\}', '', block)
        block = re.sub(r'\\end\{longtable\}\s*\}', '', block)

        rows = []
        for line in re.split(r'\\\\|\s*\\tabularnewline', block):
            line = line.strip()
            if not line: continue
            cells = []
            for c in re.split(r'(?<!\\)&', line):
                c = c.strip().replace('\n', ' ')
                # Remove alignment commands which are invalid in math array mode
                c = re.sub(r'\\(?:centering|raggedright|raggedleft)\s*', '', c)
                # Strip \textbf{} wrappers; allow escaped-brace sequences (\{ \}) inside
                c = re.sub(r'\\textbf\{((?:[^{}\\]|\\.)*)\}', r'\1', c)
                # Drop WMF/EMF image refs left by un-converted MathType equations
                c = re.sub(r'\\includegraphics(?:\[[^\]]*\])?\{[^}]*\.(?:wmf|emf)\}', '', c, flags=re.IGNORECASE)
                # Strip math delimiters — content is already in array math mode
                c = _strip_math_delimiters(c).strip()
                cells.append(c)
            if any(c for c in cells):
                rows.append(cells)

        if not rows: return ''

        num_cols = max(len(r) for r in rows)
        col_spec = '|' + '|'.join(['c'] * num_cols) + '|'
        # Use $$ so KaTeX auto-render picks it up (more widely supported than \[...\])
        out = '\n\n$$\\begin{array}{' + col_spec + '}\n\\hline\n'
        for i, row in enumerate(rows):
            while len(row) < num_cols: row.append('')
            out += ' & '.join(row) + ' \\\\\n'
            if i == 0:
                out += '\\hline\n'
        out += '\\hline\n\\end{array}$$\n\n'
        return out

    return re.sub(r'\{\\def\\LTcaptype\{none\}.*?\\end\{longtable\}\s*\}', repl, tex, flags=re.DOTALL)


def convert_docx_to_tex(docx_path: str, media_dir: str, progress_cb=None) -> str:
    """
    Sử dụng pandoc để chuyển đổi docx sang tex.
    Trả về đường dẫn tới file tex kết quả.
    media_dir là thư mục mà ảnh sẽ được bung ra (vd: tmp_dir/media)
    """
    tex_path = docx_path.rsplit('.', 1)[0] + '.tex'

    # Chạy lệnh pandoc
    cmd = [
        'pandoc',
        docx_path,
        '-f', 'docx',
        '-t', 'latex',
        '--extract-media', media_dir,
        '-o', tex_path
    ]

    subprocess.run(cmd, check=True)

    # Đọc file tex
    with open(tex_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pre-normalize \textbf whitespace BEFORE table processing so table cells
    # don't inherit embedded newlines from bold-formatted header cells
    content = normalize_textbf_whitespace(content)

    # Simplify complex LaTeX tables generated by Pandoc into KaTeX-compatible arrays
    content = simplify_pandoc_tables(content)

    # Unescape toàn bộ các ký tự toán học bị pandoc escape
    # (vì Togtex tạo ra raw text $...$, pandoc hiểu lầm là text thường nên escape)
    content = unescape_pandoc_math(content)
    content = fix_misplaced_right_dot(content)

    # Đưa tất cả các định dạng toán về $ ... $ (inline math) theo yêu cầu
    content = re.sub(r'\\\[(.*?)\\\]', r'$\1$', content, flags=re.DOTALL)
    content = re.sub(r'\\\((.*?)\\\)', r'$\1$', content, flags=re.DOTALL)
    content = re.sub(r'\$\$(.*?)\$\$', r'$\1$', content, flags=re.DOTALL)

    # Remove excessive blank lines around display math \[ \] or $$ to prevent huge gaps in frontend
    # (Đã chuyển thành $ ở trên, nhưng giữ lại rules cũ phòng hờ)
    content = re.sub(r'\n{2,}(\\\[|\$\$)', r'\n\1', content)
    content = re.sub(r'(\\\]|\$\$)\n{2,}', r'\1\n', content)

    # Save the unescaped content back so downstream functions get clean LaTeX
    with open(tex_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # Auto-detect format:
    # Nếu file có thẻ \textbackslash begin\{ex\} (hoặc \begin{ex} nếu gõ chuẩn), thì là BTPRO.
    # Nếu không, nhưng có chữ PHẦN I, Câu 1 thì là Azota.

    if r'\begin{ex}' in content:
        # BTPRO Format
        content = unescape_latex(content)
        with open(tex_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return tex_path
    else:
        # Check Standardized vs Standard
        from .parse_docx_standardized import extract_standardized_tables, convert_standardized_docx_to_tex
        from .parse_docx_standard import convert_standard_docx_to_tex

        answers = extract_standardized_tables(docx_path)
        has_standardized_answers = bool(answers['P1'] or answers['P2'] or answers['P3'])

        if has_standardized_answers:
            return convert_standardized_docx_to_tex(docx_path, tex_path)
        else:
            return convert_standard_docx_to_tex(docx_path, tex_path)
