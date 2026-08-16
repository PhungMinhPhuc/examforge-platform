import os
import re
import copy
import random
import csv
import io
from typing import List, Dict, Any
import xml.etree.ElementTree as ET
from doctree.adapt import content_len as _content_len
from doctree.figures import (
    A4_REFERENCE_WIDTH_PT,
    get_image_storage_root,
    resolve_image_file,
)  # noqa: F401 — giữ tên cũ cho word_exporter.py/pdf_html/renderer.py, ruột
   # thật nay ở doctree.figures (dùng chung được cho cả doctree/write/docx.py
   # mà không tạo vòng lặp import doctree<->exporters).


def fmt_points(x: float) -> str:
    """Định dạng điểm kiểu Việt Nam: 14.0 -> '14,0', 0.25 -> '0,25'. Bản dùng
    chung — `word_exporter.py` có bản riêng cùng logic (`_fmt_points`), chưa
    gộp lại vì bộ cũ giữ nguyên tới khi thay hẳn (xem kế hoạch port docx)."""
    s = f"{x:.2f}"
    if s.endswith('0'):
        s = s[:-1]
    return s.replace('.', ',')


def get_scoring_config(contest: dict) -> Dict[str, float]:
    """Đọc `contest['scoring_config']` (JSON, có thể là chuỗi hoặc dict) với
    giá trị mặc định — bản dùng chung, xem ghi chú ở `fmt_points`."""
    import json
    sc = contest.get('scoring_config') if isinstance(contest, dict) else None
    if isinstance(sc, str):
        try:
            sc = json.loads(sc)
        except Exception:
            sc = {}
    if not isinstance(sc, dict):
        sc = {}
    return {
        'mc': float(sc.get('mc', 0.25) or 0.25),
        'tf': float(sc.get('tf', 1.0) or 1.0),
        'sa': float(sc.get('sa', 0.5) or 0.5),
        'oe': float(sc.get('oe', 1.0) or 1.0),
    }


def fix_soft_newlines(text: str) -> str:
    if not text: return text
    # Split by LaTeX/Math blocks to protect them
    pattern = r'(\$\$[\s\S]*?\$\$|\$[^\$]*?\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\)|\\begin\{.*?\}[\s\S]*?\\end\{.*?\})'
    parts = re.split(pattern, text)
    for i in range(0, len(parts), 2):
        # Replace <br> and soft newlines with double newlines
        parts[i] = re.sub(r'<br\s*/?>', '\n\n', parts[i])
        # Replace \\ (double backslashes outside math) with \newline
        parts[i] = parts[i].replace('\\\\', '\\newline ')
    return "".join(parts)

def get_svg_native_width_inches(filepath: str, default_inches: float = 2.6) -> float:
    """Giữ tên cũ cho `word_exporter.py` — ruột thật nay ở `doctree.figures`,
    nơi cũng cần đọc kích thước gốc này khi `width` là NULL."""
    from doctree.figures import svg_native_width_in
    return svg_native_width_in(filepath, default_inches)

# Kích thước trang/chữ (pt) — A4 12pt, geometry top=1.2 bottom=2 left=1.5 right=1.2
LINE_PT = 16.5            # chiều cao 1 dòng (12pt × setstretch ~1.18)
TEXTWIDTH_PT = 520.0      # 18.3cm bề ngang chữ
CHARS_PER_LINE = 88


def _read_image_size_px(path: str):
    """Đọc (rộng, cao) pixel của ảnh từ file. Trả None nếu không đọc được."""
    try:
        if not path or not os.path.exists(path):
            return None
        ext = os.path.splitext(path)[1].lower()
        if ext == '.svg':
            try:
                tree = ET.parse(path)
                root = tree.getroot()
                vb = root.attrib.get('viewBox', '')
                if vb:
                    parts = vb.replace(',', ' ').split()
                    if len(parts) >= 4:
                        return float(parts[2]), float(parts[3])
                w = root.attrib.get('width', '')
                h = root.attrib.get('height', '')
                mw = re.search(r'([\d.]+)', w or '')
                mh = re.search(r'([\d.]+)', h or '')
                if mw and mh:
                    return float(mw.group(1)), float(mh.group(1))
            except Exception:
                return None
            return None
        # Ảnh bitmap: dùng Pillow nếu có
        try:
            from PIL import Image
            with Image.open(path) as im:
                return float(im.width), float(im.height)
        except Exception:
            pass
        # Fallback đọc header PNG thủ công
        if ext == '.png':
            with open(path, 'rb') as f:
                head = f.read(24)
            if len(head) >= 24 and head[12:16] == b'IHDR':
                import struct
                w, h = struct.unpack('>II', head[16:24])
                return float(w), float(h)
    except Exception:
        return None
    return None


def raster_native_width_pt(path: str, default_dpi: float = 96.0):
    """Bề rộng THẬT (pt) của một ảnh raster (PNG/JPG — không phải SVG), đọc
    DPI thật ghi trong file nếu có (ví dụ ảnh TikZ dựng bằng `pdftocairo -r
    300` sẽ tự khai 300dpi trong PNG). Không có DPI thì coi là 96dpi — quy ước
    ảnh web thường gặp, không phải phép đo. Trả `None` nếu không đọc được file.

    Cần vì nhúng PNG vào HTML không kèm `style="width:..."` thì trình duyệt
    LUÔN hiểu mỗi pixel là 1/96 inch, bất kể file thật sự ở DPI nào — ảnh dựng
    ở 300dpi mà không nói rõ bề rộng sẽ hiện to gấp 300/96 ≈ 3.1 lần kích
    thước thật.
    """
    try:
        from PIL import Image
        with Image.open(path) as im:
            dpi = im.info.get("dpi")
            dpi_x = float(dpi[0]) if dpi else default_dpi
            return im.width / dpi_x * 72.0
    except Exception:
        return None


def _image_height_pt(img: dict) -> float:
    """Chiều cao hiển thị (pt) của một ảnh trong đề, dựa trên kích thước thật.

    `width` NULL — chưa đặt tỉ lệ — ước lượng theo kích thước GỐC của ảnh
    (khớp cách write/tex.py, write/html.py, write/docx.py đều xuất khi gặp
    NULL), không còn giả định một tỉ lệ 0.4 bịa ra.
    """
    w_ratio = img.get('width')
    try:
        sc = float(w_ratio) if w_ratio is not None else None
    except (TypeError, ValueError):
        sc = None
    storage_path = img.get('storage_path', '') or ''
    resolved_path, _ = resolve_image_file(storage_path, [img])
    size = _read_image_size_px(resolved_path)
    if not size:
        # Không đọc được file: ước lượng thô (hơi cao cho an toàn)
        return 120.0 + (sc if sc is not None else 0.4) * 260.0
    w, h = size
    ext = os.path.splitext(storage_path)[1].lower()
    if ext == '.svg':
        # SVG do pdftocairo dựng ra ghi width/height theo POINT sẵn (kế thừa hệ
        # tọa độ PDF) — `h` đọc được đã là pt, không cần quy đổi gì thêm.
        native_h_pt = h
        return (sc * A4_REFERENCE_WIDTH_PT * (h / w)) if sc is not None and w else native_h_pt
    if sc is None:
        # Ảnh raster chưa đặt tỉ lệ: coi như xuất ở kích thước gốc (96dpi -> pt)
        return (h / 96.0) * 72.0
    # png/jpg: width = sc × textwidth → cao = rộng × (h/w)
    disp_w_pt = sc * A4_REFERENCE_WIDTH_PT
    return disp_w_pt * (h / w if w else 1.0)


def _estimate_unit_height(unit: List[dict]) -> float:
    """Ước lượng chiều cao (pt) của một câu (kèm câu con nếu 'st').

    Đọc kích thước thật của ảnh để tính chính xác; phần chữ ước lượng theo dòng.
    Thiên hơi cao cho an toàn (minipage luôn giữ câu trọn, sai số chỉ kém tối ưu).
    """
    total = 1.5 * LINE_PT  # khoảng cách giữa các câu
    for q in unit:
        qt = q.get('question_type')
        total += 1.4 * LINE_PT  # dòng "Câu N:" + nhãn
        total += max(1.0, _content_len(q.get('content')) / CHARS_PER_LINE) * LINE_PT

        for img in (q.get('images', []) or []):
            total += _image_height_pt(img) + 0.5 * LINE_PT

        opts = q.get('options', []) or []
        if qt == 'mc':
            maxlen = max((_content_len(o.get('content')) for o in opts), default=0)
            layout = str(q.get('layout_type', ''))
            if layout == '1' or maxlen > 35:
                rows = 4
            elif layout == '2' or maxlen > 12:
                rows = 2
            else:
                rows = 1
            total += (rows + 0.6) * LINE_PT
        elif qt == 'tf':
            for o in opts:
                total += max(1.0, _content_len(o.get('content')) / CHARS_PER_LINE) * LINE_PT
        elif qt == 'sa':
            total += 1.6 * LINE_PT
        elif qt == 'oe':
            total += 3.0 * LINE_PT
        total += 0.6 * LINE_PT
    return total


def group_units(questions: List[dict]) -> List[List[dict]]:
    """Gom danh sách câu thành các 'đơn vị': câu cấp cao + câu con (nếu là 'st')."""
    units: List[List[dict]] = []
    cur = None
    for q in questions:
        if not q.get('parent_id'):
            cur = [q]
            units.append(cur)
        elif cur is not None:
            cur.append(q)
        else:
            units.append([q])
    return units


def _pack_with_count(shuffled_questions: List[dict], heights: dict = None, page_capacity: float = 700.0, first_page_capacity: float = 550.0, ffd: bool = False) -> tuple:
    """Xếp câu lấp đầy trang. Trả (thứ tự câu, số trang).

    Giữ câu trọn vẹn, cụm 'st' nguyên khối, thứ tự phần mc->tf->sa->oe->st.
    ffd=True: xếp tối ưu (First-Fit-Decreasing) để ra SỐ TRANG TỐI THIỂU (target).
    ffd=False: lấp-đầy theo thứ tự ngẫu nhiên hiện có (giữ tính đảo đề).
    """
    units = group_units(shuffled_questions)
    geom = heights or {}
    # Dùng hình học ĐO THẬT nếu có (khớp thực tế hơn nhiều)
    page_capacity = geom.get('__PAGE__', page_capacity)
    first_page_capacity = geom.get('__FIRST__', first_page_capacity)

    def part_height(t: str) -> float:
        return geom.get('__PART_' + t + '__', 1.8 * LINE_PT)

    def unit_height(u: List[dict]) -> float:
        if heights:
            is_html = '__PAGE__' in heights
            if is_html:
                # HTML: đo rời rạc từng câu (câu dẫn riêng, câu hỏi con riêng)
                total_h = 0.0
                all_found = True
                for q in u:
                    q_id = q.get('id')
                    hh = heights.get(q_id) if heights.get(q_id) is not None else heights.get(str(q_id))
                    if hh is not None:
                        # Bộ đo HTML đã trả cả margin thực từ computed style.
                        total_h += hh
                    else:
                        all_found = False
                        break
                if all_found:
                    return total_h
            else:
                # LaTeX: đo dính chùm toàn bộ khối (lưu dưới id câu dẫn đầu tiên)
                q_id = u[0].get('id')
                hh = heights.get(q_id) if heights.get(q_id) is not None else heights.get(str(q_id))
                if hh is not None:
                    return hh + (1.6 * LINE_PT)
        return _estimate_unit_height(u)

    def eff_type(u: List[dict]) -> str:
        q0 = u[0]
        if q0.get('question_type') == 'st':
            return u[1].get('question_type') if len(u) > 1 else 'st'
        return q0.get('question_type')

    type_order = ['mc', 'tf', 'sa', 'oe', 'st']
    groups: Dict[str, list] = {t: [] for t in type_order}
    for u in units:
        groups.setdefault(eff_type(u), []).append(u)

    result: List[dict] = []
    pages = 1
    used = 0.0
    page_cap = first_page_capacity
    for t in type_order:
        gus = groups.get(t) or []
        if not gus:
            continue
        # tiêu đề PHẦN (chiều cao đo thật theo từng phần)
        PART = part_height(t)
        
        def movable(u):
            return u[0].get('is_shufflable', True)

        rem = [[u, unit_height(u)] for u in gus]

        def best_page_subset(items, capacity):
            """Chọn tổ hợp lấp trang tốt nhất (subset-sum theo 0.5px).

            Sắp giảm dần rồi xuất tuần tự chỉ là Next-Fit-Decreasing, không phải
            First-Fit-Decreasing và có thể tốn thêm một trang.  DP này chọn cả
            tổ hợp câu cho trang hiện tại, sau đó mới chuyển sang trang kế.
            """
            scale = 2
            cap = max(0, int(capacity * scale + 1e-6))
            states = {0: ()}
            for i, (_u, h) in enumerate(items):
                weight = max(1, int(h * scale + 0.999999))
                additions = {}
                for used_w, chosen in tuple(states.items()):
                    new_w = used_w + weight
                    if new_w <= cap and new_w not in states:
                        additions[new_w] = chosen + (i,)
                states.update(additions)
            return states[max(states)] if states else ()
            
        if page_cap - used < PART:
            pages += 1; used = 0.0; page_cap = page_capacity
        used += PART
        while rem:
            # Với toàn bộ câu có thể đảo, chọn nguyên một tổ hợp tốt nhất cho
            # phần trống còn lại. Đây mới là nhánh dùng để tính min_pages.
            if ffd and all(movable(u) for u, _h in rem):
                chosen = best_page_subset(rem, page_cap - used)
                if chosen:
                    chosen_set = set(chosen)
                    selected = [item for i, item in enumerate(rem) if i in chosen_set]
                    rem = [item for i, item in enumerate(rem) if i not in chosen_set]
                    for u, h in selected:
                        result.extend(u)
                        used += h
                    continue
                # Một câu cao hơn cả trang: vẫn đặt nó để trình phân trang xử
                # lý, tránh lặp vô hạn trong trường hợp dữ liệu bất thường.
                if used == 0.0 and rem:
                    u, h = rem.pop(0)
                    result.extend(u)
                    used = h
                    continue
                pages += 1; used = 0.0; page_cap = page_capacity
                continue

            u0, h0 = rem[0]
            
            # Tính chiều cao phần không thể chia tách (Bây giờ chỉ là Câu dẫn độc lập)
            def get_indivisible_h(u):
                return unit_height([u[0]])

            def simulate_flow(u, start_used, cap):
                # Mô phỏng việc Paged.js ngắt trang cho cụm u
                p = 0
                usd = start_used
                i = 0
                while i < len(u):
                    h = unit_height([u[i]])
                    if h > cap - usd:
                        p += 1; usd = h; cap = page_capacity
                    else:
                        usd += h
                    i += 1
                return p, usd, cap

            h_indiv = get_indivisible_h(u0)
            
            if h_indiv <= page_cap - used:
                # Đủ chỗ cho phần không thể tách -> Nhét luôn cụm này (nó có thể tràn sang trang sau một cách tự nhiên)
                rem.pop(0)
                result.extend(u0)
                added_pages, used, page_cap = simulate_flow(u0, used, page_cap)
                pages += added_pages
            elif not movable(u0):
                # câu cố định không vừa -> sang trang, đặt nó (không được dời)
                pages += 1; used = 0.0; page_cap = page_capacity
                rem.pop(0)
                result.extend(u0)
                added_pages, used, page_cap = simulate_flow(u0, used, page_cap)
                pages += added_pages
            else:
                # Tìm câu MOVABLE phía sau (không vượt câu cố định) có phần indivisible lấp vừa
                idx = None
                for i, (u, h) in enumerate(rem):
                    if not movable(u):
                        break
                    if get_indivisible_h(u) <= page_cap - used:
                        idx = i; break
                
                if idx is None:
                    # Không có câu nào vừa -> qua trang mới
                    pages += 1; used = 0.0; page_cap = page_capacity
                    rem.pop(0)
                    result.extend(u0)
                    added_pages, used, page_cap = simulate_flow(u0, used, page_cap)
                    pages += added_pages
                else:
                    u, h = rem.pop(idx)
                    result.extend(u)
                    added_pages, used, page_cap = simulate_flow(u, used, page_cap)
                    pages += added_pages
                    
    return result, pages


def reorder_for_packing(shuffled_questions: List[dict], page_capacity: float = 740.0, first_page_capacity: float = 600.0, heights: dict = None) -> List[dict]:
    """Wrapper: chỉ trả thứ tự câu sau khi xếp lấp đầy trang."""
    return _pack_with_count(shuffled_questions, heights, page_capacity, first_page_capacity)[0]


def min_pages(questions: List[dict], heights: dict = None) -> int:
    """Số trang TỐI THIỂU (target) cho bộ câu — thử đảo ngẫu nhiên nhiều lần để tìm ra mốc nhỏ nhất."""
    best_pages = _pack_with_count(questions, heights, ffd=True)[1]
    for _ in range(50):
        sq = _do_shuffle(questions)
        pages = _pack_with_count(sq, heights)[1]
        if pages < best_pages:
            best_pages = pages
    return best_pages


def _build_answer_key(shuffled_questions: List[dict]) -> dict:
    answer_key = {}
    q_counter = 1
    for q in shuffled_questions:
        if q['question_type'] == 'st':
            continue
        q_type = q['question_type']
        ans_str = ""
        if q_type == 'mc':
            for idx, opt in enumerate(q['options']):
                if opt.get('is_correct'):
                    ans_str = chr(65 + idx)
                    break
        elif q_type == 'tf':
            ans_str = ",".join("D" if opt.get('is_correct') else "S" for opt in q['options'])
        elif q_type == 'sa':
            ans_str = q['options'][0].get('content', '') if q['options'] else ''
        answer_key[q_counter] = ans_str
        q_counter += 1
    return answer_key


def _do_shuffle(questions: List[dict], shuffle_order: bool = True, shuffle_options: bool = True) -> List[dict]:
    """Đảo đề.

    shuffle_order: đảo thứ tự câu hỏi (đảo đề).
    shuffle_options: đảo phương án/mệnh đề trong câu — áp dụng cho cả MC và ĐÚNG/SAI.
    Câu/phương án có is_shufflable=False luôn giữ nguyên (dù bật đảo).
    """
    # We group by type: mc, tf, sa, oe
    groups = {'mc': [], 'tf': [], 'sa': [], 'oe': [], 'st': []}
    
    # Find all top-level questions
    top_level = [q for q in questions if not q.get('parent_id')]
    children = {q['id']: [] for q in questions if q.get('question_type') == 'st'}
    for q in questions:
        if q.get('parent_id'):
            if q['parent_id'] in children:
                children[q['parent_id']].append(q)
                
    for q in top_level:
        if q.get('question_type') == 'st':
            ch_list = children.get(q['id'], [])
            if ch_list:
                eff_type = ch_list[0].get('question_type', 'st')
                if eff_type in groups:
                    groups[eff_type].append(q)
                else:
                    groups['st'].append(q)
            else:
                groups['st'].append(q)
        else:
            q_type = q.get('question_type')
            if q_type in groups:
                groups[q_type].append(q)
            else:
                groups['mc'].append(q)
        
    shuffled_questions = []
    
    # The order must be MC -> TF -> SA -> OE. (ST can contain these too, usually ST are kept together but we just append them where they belong or at the end).
    # For now, let's keep ST at the end or intermixed? Usually ST is separate. Let's append ST at the end.
    
    type_order = ['mc', 'tf', 'sa', 'oe', 'st']

    def complexity_band(q):
        """Hai cụm mềm: NB+TH và VD+VDC; dữ liệu lỗi về cụm cơ bản."""
        value = q.get('complexity')
        try:
            level = int(value)
        except (TypeError, ValueError):
            level = 1
        return 0 if level <= 2 else 1

    def shuffle_unlocked(items):
        """Giữ phần tử khóa đúng slot, chỉ đảo phần tử mở theo hai cụm."""
        values = list(items)
        fixed = {
            i: item for i, item in enumerate(values)
            if not item.get('is_shufflable', True)
        }
        movable = [item for i, item in enumerate(values) if i not in fixed]
        basic = [item for item in movable if complexity_band(item) == 0]
        applied = [item for item in movable if complexity_band(item) == 1]
        random.shuffle(basic)
        random.shuffle(applied)
        movable = basic + applied
        result, movable_index = [], 0
        for i in range(len(values)):
            if i in fixed:
                result.append(fixed[i])
            else:
                result.append(movable[movable_index])
                movable_index += 1
        return result

    def order_group(group_qs):
        qs = list(group_qs)
        if not shuffle_order:
            return qs
        return shuffle_unlocked(qs)

    def maybe_shuffle_opts(q):
        # Cờ của từng option độc lập với cờ đổi vị trí của câu. Option khóa
        # luôn giữ đúng slot, chỉ các option còn lại mới được random.
        if shuffle_options and q.get('question_type') in ('mc', 'tf'):
            opts = list(q.get('options', []))
            fixed = {
                i: opt for i, opt in enumerate(opts)
                if not opt.get('is_shufflable', True)
            }
            movable = [opt for i, opt in enumerate(opts) if i not in fixed]
            random.shuffle(movable)
            rebuilt, movable_index = [], 0
            for i in range(len(opts)):
                if i in fixed:
                    rebuilt.append(fixed[i])
                else:
                    rebuilt.append(movable[movable_index])
                    movable_index += 1
            q['options'] = rebuilt

    for t in type_order:
        for q in order_group(groups[t]):
            new_q = copy.deepcopy(q)
            maybe_shuffle_opts(new_q)
            shuffled_questions.append(new_q)
            # if it's ST, append its children
            if new_q['id'] in children:
                ch_list = copy.deepcopy(children[new_q['id']])
                if shuffle_order:
                    ch_list = shuffle_unlocked(ch_list)
                for ch in ch_list:
                    maybe_shuffle_opts(ch)
                    shuffled_questions.append(ch)

    return shuffled_questions


def shuffle_contest(questions: List[dict], pack: bool = False, heights: dict = None, target_pages: int = None, max_tries: int = 300, shuffle_order: bool = True, shuffle_options: bool = True) -> tuple[List[dict], dict]:
    """Đảo đề. Nếu pack=True: xếp câu lấp đầy trang + đồng bộ số trang.

    shuffle_order/shuffle_options: chế độ đảo (xem _do_shuffle).
    target_pages: nếu đặt, thử nhiều thứ tự đến khi vừa ĐÚNG số trang đó (đồng bộ
    giữa các mã); không đạt thì dùng FFD để vẫn đảm bảo đúng target_pages.
    """
    opts = dict(shuffle_order=shuffle_order, shuffle_options=shuffle_options)
    if not pack:
        sq = _do_shuffle(questions, **opts)
        return sq, _build_answer_key(sq)

    best = None
    best_pages = None
    tries = max_tries if target_pages else 1
    for _ in range(tries):
        sq = _do_shuffle(questions, **opts)
        ordered, pages = _pack_with_count(sq, heights=heights)
        if target_pages is None or pages == target_pages:
            best = ordered
            break
        if best is None or pages < best_pages:
            best, best_pages = ordered, pages
    else:
        # Không thứ tự ngẫu nhiên nào vừa target -> dùng FFD (đảm bảo target_pages)
        if target_pages is not None:
            sq = _do_shuffle(questions, **opts)
            best = _pack_with_count(sq, heights=heights, ffd=True)[0]

    return best, _build_answer_key(best)

def generate_answer_key_excel(answer_keys: Dict[str, Dict[int, str]]) -> bytes:
    if not answer_keys: return b""
    import openpyxl
    from openpyxl.styles import Alignment
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Đáp Án"
    
    max_q = 0
    for k, v in answer_keys.items():
        if v: max_q = max(max_q, max(v.keys()))
        
    header = ["Câu/Mã đề"] + list(answer_keys.keys())
    ws.append(header)
    
    for i in range(1, max_q + 1):
        row = [str(i)]
        for code in answer_keys.keys():
            row.append(str(answer_keys[code].get(i, '')))
        ws.append(row)
        
    center_align = Alignment(horizontal='center', vertical='center')
    for row in ws.iter_rows():
        for cell in row:
            cell.alignment = center_align
            cell.number_format = '@'
            
    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


def balance_latex_braces(text: str) -> str:
    if not text: return text
    escaped = False
    depth = 0
    res = []
    for char in text:
        if escaped:
            res.append(char)
            escaped = False
            continue
        if char == '\\':
            escaped = True
            res.append(char)
        elif char == '{':
            depth += 1
            res.append(char)
        elif char == '}':
            if depth > 0:
                depth -= 1
                res.append(char)
            else:
                res.append('\\}')
        else:
            res.append(char)
    while depth > 0:
        res.append('}')
        depth -= 1
    return "".join(res)


def sanitize_general_info_for_pandoc(text: str) -> str:
    """Sanitize general_info LaTeX so Pandoc can parse it without errors.

    Pandoc's LaTeX reader chokes on certain constructs commonly found in
    Vietnamese exam general_info strings (e.g. ``{,}`` decimal commas,
    ``\\,`` thin spaces, ``\\mathrm``).  This function normalises them to
    Pandoc-safe equivalents that preserve visual appearance in Word output.
    """
    if not text:
        return text
    # 1. Fix bare ^\circ -> ^{\circ}
    text = text.replace(r'^\circ', r'^{\circ}')
    # 2. Replace {,} (Vietnamese decimal comma) -> plain comma
    text = text.replace('{,}', ',')
    # 3. Replace \, (thin space) -> ~ (non-breaking space, Pandoc-safe)
    text = text.replace(r'\,', '~')
    # 4. Replace \mathrm{...} -> \text{...} (Pandoc handles \text better)
    text = re.sub(r'\\mathrm\{([^}]*)\}', r'\\text{\1}', text)

    return text

