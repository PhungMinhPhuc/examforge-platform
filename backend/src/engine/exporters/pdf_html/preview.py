"""Shared HTML document renderer for both preview and HTML-to-PDF export.

Việc dịch MỘT câu (`_render_single_question` và bạn) sống ở `renderer.py`, cùng
bộ với bản xuất PDF — chỗ này chỉ IMPORT lại, không giữ bản sao thứ hai. Trước
đây hai file có gần 320 dòng trùng nhau từng chữ; cây tài liệu là dịp gộp lại,
để đúng như docstring gốc đã ghi: preview và bản xuất PHẢI ra cùng một HTML.
"""
import html as html_module
from typing import List, Dict, Any
from doctree import question_to_rec
from doctree.read.tex import to_doc as _tex_to_doc
from doctree.write.html import doc_to_html
from .renderer import (
    _html_figures,
    _math_fmt,
    _render_mc_options,
    _render_tf_options,
    _render_single_question,
    _section_label_html,
    _add_pdf_image_markers,
    _side_class,
    html_pdf_page_session_sync,
    _page_to_cropped_pdf_bytes,
    _stamp_section_footers,
    pagedjs_to_pdf_sync,
    native_html_to_pdf_bytes_sync,
    BUNDLED_FONT_FACE_CSS,
    BUNDLED_FONT_FAMILY,
)

# Client Chrome và Playwright Chromium có thể làm tròn tổng chiều cao dòng
# lệch dưới 1–2px. PDF đề gốc chừa đúng 2px ở đáy vùng nội dung để không nhận
# thêm một dòng mà preview phía client đã đẩy sang trang sau.
ORIGINAL_EXPORT_PAGINATION_SAFETY_PX = 2


def _general_info_html(text: str) -> str:
    """`general_info` là chuỗi LaTeX rời của đề (không thuộc jsonb câu hỏi) —
    parse tại chỗ bằng bộ đọc `.tex` rồi dựng qua cùng bộ ghi HTML, thay vì
    giữ một bộ quy tắc bóc LaTeX riêng chỉ cho một trường."""
    if not text or not text.strip():
        return ""
    return doc_to_html(_tex_to_doc(text), None, _math_fmt)


def _plain_html(text) -> str:
    """Đáp án câu trả lời ngắn — chuỗi trơn thật (không phải LaTeX), chỉ cần
    thoát HTML."""
    return html_module.escape(str(text or ""))


def _render_questions_body(questions: List[dict], section_labels: dict,
                           include_solution: bool, show_answers: bool,
                           id_prefix: str = "q-", pdf_markers: bool = False,
                           linked_image_assets: bool = False) -> str:
    """Render only the question area so the same layout can be reused in the
    clean exam and in the detailed-solution section.

    `id_prefix` — bản đề sạch và bản lời giải chi tiết render CÙNG một câu hỏi
    (cùng `q["id"]`) 2 lần trong CÙNG một tài liệu preview (dual-section) — nếu
    dùng chung "q-" thì trùng id giữa 2 khu vực khác hẳn nhau, làm việc dò
    ảnh-mồ-côi (so trang chứa ảnh vs trang bắt đầu đề bài, nhắm theo id) bị lẫn
    lộn dữ liệu của 2 khu vực. Bản lời giải dùng "qsol-" để tách hẳn."""
    body_html = []
    printed = {k: False for k in section_labels}
    q_counter = 1
    processed_ids = set()

    for q in questions:
        q_id = str(q.get('id', ''))
        if q_id in processed_ids:
            continue

        q_type = q.get('question_type')
        layout = q.get('layout_type', '') or ''
        eff_type = q_type
        if q_type == 'st':
            children = [c for c in questions if c.get('parent_id') == q['id']]
            if children:
                eff_type = children[0].get('question_type', 'mc')

        if eff_type in printed and not printed[eff_type]:
            body_html.append(
                f'<div class="section-header">{_section_label_html(section_labels[eff_type])}</div>'
            )
            printed[eff_type] = True
            q_counter = 1

        if q_type == 'st':
            children = [c for c in questions if c.get('parent_id') == q['id']]
            if children:
                prefix_text = f"Dựa vào thông tin dưới đây để trả lời các câu từ {q_counter} đến {q_counter + len(children) - 1}."
            else:
                prefix_text = "Dựa vào thông tin dưới đây:"

            rec = question_to_rec(q)
            figures = _html_figures(q.get('images') or [], linked_image_assets)
            content_html = doc_to_html(rec["content_doc"], figures, _math_fmt)
            cls = "question-content" + (" immini" if layout.startswith("immini") else "") \
                + _side_class(rec["content_doc"])
            stimulus_css_id = f'{id_prefix}{q_id}'
            if pdf_markers:
                content_html = _add_pdf_image_markers(content_html, stimulus_css_id)
            body_html.append(f'<div class="question stimulus" id="{stimulus_css_id}" style="margin-bottom: 5px;">')
            stimulus_marker = (
                f'<span class="pdf-question-marker">[[QID:{stimulus_css_id}]]</span>'
                if pdf_markers else ''
            )
            body_html.append(
                f'<div class="stimulus-prefix" style="margin-bottom: 5px;">'
                f'<p>{stimulus_marker}<em>{prefix_text}</em></p></div>'
            )
            body_html.append(f'<div class="{cls}">{content_html}</div>')
            body_html.append('</div>')

            for child in children:
                body_html.append(_render_single_question(
                    child, q_counter, include_solution, show_answers,
                    id_prefix=id_prefix, pdf_marker=pdf_markers,
                    linked_image_assets=linked_image_assets,
                ))
                processed_ids.add(str(child.get('id', '')))
                q_counter += 1
            processed_ids.add(q_id)
        elif not q.get('parent_id'):
            body_html.append(_render_single_question(
                q, q_counter, include_solution, show_answers,
                id_prefix=id_prefix, pdf_marker=pdf_markers,
                linked_image_assets=linked_image_assets,
            ))
            processed_ids.add(q_id)
            q_counter += 1

    return '\n'.join(body_html)


def _render_answer_key_html(contest: dict, questions: List[dict]) -> str:
    """Render the grading tables with the same structure as the Word export."""
    import json

    sections = []
    mc = [q for q in questions if q.get('question_type') == 'mc']
    tf = [q for q in questions if q.get('question_type') == 'tf']
    sa = [q for q in questions if q.get('question_type') == 'sa']
    oe = [q for q in questions if q.get('question_type') == 'oe']

    scoring = contest.get('scoring_config') if isinstance(contest, dict) else {}
    if isinstance(scoring, str):
        try:
            scoring = json.loads(scoring)
        except Exception:
            scoring = {}
    if not isinstance(scoring, dict):
        scoring = {}
    weights = {
        'mc': float(scoring.get('mc', 0.25) or 0.25),
        'tf': float(scoring.get('tf', 1.0) or 1.0),
        'sa': float(scoring.get('sa', 0.5) or 0.5),
        'oe': float(scoring.get('oe', 1.0) or 1.0),
    }

    def fmt(value: float) -> str:
        result = f'{value:.2f}'
        if result.endswith('0'):
            result = result[:-1]
        return result.replace('.', ',')

    def table(rows, cls=''):
        return '<div class="answer-table-wrap"><table class="answer-table"><tbody>' + ''.join(
            '<tr>' + ''.join(f'<td>{cell}</td>' for cell in row) + '</tr>' for row in rows
        ) + f'</tbody></table></div>'

    if mc:
        sections.append(f'<h3>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn: <span>Mỗi câu trả lời đúng thí sinh được {fmt(weights["mc"])} điểm.</span></h3>')
        rows = []
        for start in range(0, len(mc), 10):
            chunk = mc[start:start + 10]
            answers = []
            for q in chunk:
                answers.append(next((chr(65 + i) for i, o in enumerate(q.get('options', [])) if o.get('is_correct')), ''))
            padding = [''] * (10 - len(chunk))
            rows.append([str(start + i + 1) for i in range(len(chunk))] + padding)
            rows.append(answers + padding)
        sections.append(table(rows))

    if tf:
        sections.append('<h3>PHẦN II. Câu trắc nghiệm đúng sai.</h3>')
        sections.append(f'''<div class="tf-scoring-notes">
            <p>- Thí sinh chỉ lựa chọn chính xác 01 ý trong 1 câu hỏi được {fmt(0.1 * weights['tf'])} điểm.</p>
            <p>- Thí sinh chỉ lựa chọn chính xác 02 ý trong 1 câu hỏi được {fmt(0.25 * weights['tf'])} điểm.</p>
            <p>- Thí sinh chỉ lựa chọn chính xác 03 ý trong 1 câu hỏi được {fmt(0.5 * weights['tf'])} điểm.</p>
            <p>- Thí sinh lựa chọn chính xác cả 04 ý trong 1 câu hỏi được {fmt(weights['tf'])} điểm.</p>
        </div>''')
        rows_html = ['<tr><td>Câu</td><td>Lệnh hỏi</td><td>Đáp án</td><td>Câu</td><td>Lệnh hỏi</td><td>Đáp án</td></tr>']
        half = (len(tf) + 1) // 2
        for left_index in range(half):
            pair = [(left_index, tf[left_index])]
            right_index = left_index + half
            pair.append((right_index, tf[right_index]) if right_index < len(tf) else (None, None))
            for option_index in range(4):
                cells = []
                for q_index, q in pair:
                    if option_index == 0:
                        cells.append(f'<td rowspan="4">{q_index + 1 if q_index is not None else ""}</td>')
                    options = q.get('options', []) if q else []
                    option = options[option_index] if option_index < len(options) else None
                    cells.append(f'<td>{chr(97 + option_index)})</td>')
                    cells.append(f'<td>{"Đúng" if option and option.get("is_correct") else "Sai" if option else ""}</td>')
                rows_html.append('<tr>' + ''.join(cells) + '</tr>')
        sections.append('<div class="answer-table-wrap"><table class="answer-table tf-answer-table"><tbody>' + ''.join(rows_html) + '</tbody></table></div>')

    if sa:
        sections.append(f'<h3>PHẦN III. Câu trắc nghiệm trả lời ngắn: <span>Mỗi câu trả lời đúng thí sinh được {fmt(weights["sa"])} điểm.</span></h3>')
        ncol = min(10, len(sa))
        rows = []
        for start in range(0, len(sa), ncol):
            chunk = sa[start:start + ncol]
            nums = [f'<strong>{start + i + 1}</strong>' for i in range(len(chunk))]
            answers = [_plain_html(q.get('options', [{}])[0].get('content', ''))
                      if q.get('options') else '' for q in chunk]
            padding = [''] * (ncol - len(chunk))
            rows.append(['Câu'] + nums + padding)
            rows.append(['Đáp án'] + answers + padding)
        sections.append(table(rows))

    if oe:
        sections.append(f'<h3>PHẦN IV. Câu tự luận: <span>{fmt(len(oe) * weights["oe"])} điểm.</span></h3>')

    return '\n'.join(sections) or '<p>Đề chưa có đáp án để hiển thị.</p>'

def render_exam_preview_html(
    contest: dict,
    questions: List[dict],
    exam_title: str = "",
    department: str = "",
    exam_type: str = "",
    subject: str = "",
    duration: int = 50,
    general_info: str = "",
    code: str = "000",
    include_solution: bool = True,
    show_answers: bool = True,
    font_family: str = BUNDLED_FONT_FAMILY,
    math_font: str = "",
    exam_pages: int = None,
    answer_pages: int = None,
    paginate_client: bool = False,
    orphan_fix_ids: List[str] = None,
    pdf_question_markers: bool = False,
    atomic_questions: bool = False,
    linked_image_assets: bool = False,
    pagination_safety_px: int = 0,
) -> str:
    """`exam_pages`/`answer_pages` — số trang THẬT của phần đề/phần đáp án,
    hiện vào dòng "(Đề thi có X trang)"/"(Đáp án có Y trang)". Dùng cho bản in
    PDF thật (`render_exam_pdf`, Chromium, `paginate_client=False`): không
    biết trước được lúc dựng HTML lần đầu (phải in thử ra PDF mới đếm được
    trang thật) — truyền `None` thì hiện "..." tạm, bên gọi tự làm 2 lượt.

    `paginate_client=True` — bản xem trước hiển thị trong trình duyệt người
    dùng (iframe ở `ExportContestModal.tsx`): nhúng Paged.js, tự phân trang
    VÀ tự đếm trang NGAY TRONG trình duyệt (không cần lượt in-thử phía server
    như Chromium) — nhanh, không tốn server, nhưng khác thư viện phân trang
    với bản PDF thật nên cần dò-mồ-côi VÀ tự sửa riêng phía JS (xem
    `docs/phan-trang-anh-troi.md` mục 3.2) — cơ chế khác hẳn 2 lượt server-side
    của `render_exam_pdf` vì Paged.js không cho gọi `preview()` lần 2 tại chỗ,
    phải tải lại (`location.reload()`) toàn trang cho lượt sửa.

    `atomic_questions=True` — chế độ đề đảo: mỗi `.question` đã là một block
    không ngắt và thứ tự đã được `shuffle_contest(pack=True)` xếp theo số
    trang tối thiểu. Paged.js chỉ phân trang đúng một lượt; không tạo marker,
    không dò ảnh mồ côi và không reload để sửa.

    `orphan_fix_ids` — danh sách id css (`"q-235"`) các câu ĐÃ được lượt nháp
    của `render_exam_pdf` phát hiện là mồ côi (ảnh trôi bị tách trang khỏi đề
    bài) — chỉ khoá `page-break-inside:avoid` ĐÚNG các câu này ở lượt in cuối,
    không khoá tràn lan (xem `_detect_orphaned_questions` + mục 3 của
    `docs/phan-trang-anh-troi.md`).
    """
    total_mc = sum(1 for q in questions if q.get('question_type') == 'mc')
    total_tf = sum(1 for q in questions if q.get('question_type') == 'tf')
    total_sa = sum(1 for q in questions if q.get('question_type') == 'sa')
    total_oe = sum(1 for q in questions if q.get('question_type') == 'oe')

    section_labels = {
        'mc': f'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu {total_mc}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.',
        'tf': f'PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu {total_tf}. Trong mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.',
        'sa': f'PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu {total_sa}.',
        'oe': f'PHẦN IV. Câu tự luận. Thí sinh trả lời từ câu 1 đến câu {total_oe}.',
    }

    exam_pages_text = str(exam_pages).zfill(2) if exam_pages is not None else "..."
    answer_pages_text = str(answer_pages).zfill(2) if answer_pages is not None else "..."

    orphan_fix_style = ""
    if orphan_fix_ids:
        rules = "".join(
            f'#{html_module.escape(qid)} {{ page-break-inside: avoid; break-inside: avoid; }}\n'
            for qid in orphan_fix_ids
        )
        orphan_fix_style = f'<style id="orphan-fix">\n{rules}</style>'

    orphan_fix_prelude = ""
    pagedjs_head_scripts = ""
    pagedjs_loader_div = ""
    if paginate_client:
        # Chạy NGAY ĐẦU <head>, trước khi Paged.js/body kịp phân tích — nếu lượt
        # trước đó (cùng document, đã tự location.reload()) phát hiện câu mồ côi
        # thì đọc lại danh sách id đã lưu và document.write() thêm CSS khoá đúng
        # những id đó TRƯỚC khi Paged.js chạy, để chỉ cần phân trang lại 1 lần
        # duy nhất là ra đúng kết quả (xem docs/phan-trang-anh-troi.md mục 3.2).
        orphan_fix_prelude = "" if atomic_questions else """<script>
(function() {
    try {
        var raw = sessionStorage.getItem('examPreviewOrphanFixIds');
        if (raw) {
            sessionStorage.removeItem('examPreviewOrphanFixIds');
            var ids = JSON.parse(raw);
            var css = ids.map(function(id) {
                return '#' + id + ' { page-break-inside: avoid; break-inside: avoid; }';
            }).join('');
            document.write('<style id="orphan-fix">' + css + '</style>');
            window.__examPreviewAppliedFixIds = ids;
        }
    } catch (e) {}
})();
</script>"""
        pagedjs_head_scripts = """<script>window.PagedConfig = { auto: false };</script>
<script src="https://cdn.jsdelivr.net/npm/pagedjs/dist/paged.polyfill.js"></script>"""
        pagedjs_loader_div = """<div id="pagedjs-loader" data-pagedjs-ignore="true" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #fff; z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; color: #555;">
    <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
    <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    <div style="font-size: 16px; font-weight: 500;">Đang xử lý phân trang A4...</div>
</div>"""
        # Dò-mồ-côi TỔNG QUÁT cho mọi câu có ảnh trôi (không riêng mc): so trang
        # chứa `.doc-figure-block` (ảnh) vs trang xuất hiện ĐẦU TIÊN của chính
        # phần tử `[id^="q-"]`/`[id^="qsol-"]` chứa nó (= nơi đề bài/ảnh bắt
        # đầu, vì ảnh luôn là node đầu tiên trong content khi có "side" — xem
        # doctree/write/html.py) — khác trang nhau tức ảnh đã bị đẩy đi một
        # mình, "mồ côi" khỏi đề bài.
        #
        # Bản lời giải chi tiết (`id="qsol-N"`) render lại CÙNG câu hỏi lần 2
        # trong cùng tài liệu (xem docstring `_render_questions_body`) — ẢNH
        # CŨNG BỊ RENDER LẠI, nên CŨNG phải dò riêng ở khu vực đó, không chỉ
        # bản đề sạch (`q-N`) — bug thật đã gặp phía Chromium (2 lượt server,
        # `_questions_with_side_image`/`_detect_orphaned_questions`): trước
        # đây chỉ dò "q-" nên câu mồ côi Ở PHẦN LỜI GIẢI lọt lưới hoàn toàn.
        # `[id^="q-"]` và `[id^="qsol-"]` không đụng nhau ("qsol-N" không khớp
        # tiền tố "q-" vì ký tự thứ 2 là "s" chứ không phải "-"), 2 khu vực vẫn
        # tách biệt hoàn toàn, chỉ là quét CẢ HAI thay vì chỉ một.
        #
        # Paged.js KHÔNG cho gọi `PagedPolyfill.preview()` lần 2 tại chỗ (crash
        # nội bộ) nên lượt sửa phải `location.reload()` toàn trang thật, mang
        # danh sách id mồ côi qua bằng `sessionStorage` — script ở đầu <head>
        # (biến `orphan_fix_prelude` ở trên) đọc lại và bơm CSS TRƯỚC khi
        # Paged.js chạy ở lượt tải lại, nên chỉ cần đúng 1 lượt sửa là xong.
        pagination_invoke_script = """<script>
const atomicQuestions = __ATOMIC_QUESTIONS__;
window.__examAtomicQuestions = atomicQuestions;
function detectOrphanQuestions() {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
    const imgPageOf = {};
    const invalidImageOf = {};
    const stemPageOf = {};
    pages.forEach((page, i) => {
        page.querySelectorAll('.doc-figure-block[data-preview-question-id]').forEach(function(fig) {
            var id = fig.dataset.previewQuestionId;
            if (!id || id in imgPageOf) return;
            imgPageOf[id] = i;

            // Paged.js có thể giữ figure ở đúng `.pagedjs_page` nhưng đẩy
            // nó ra xa theo trục X (đã đo được x≈2442px trên trang 691px).
            // So bounding box thật, không chỉ so chỉ số trang.
            const content = page.querySelector('.pagedjs_page_content') || page;
            const imageRect = fig.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();
            const tolerance = 1;
            invalidImageOf[id] = (
                imageRect.width <= tolerance || imageRect.height <= tolerance ||
                imageRect.left < contentRect.left - tolerance ||
                imageRect.right > contentRect.right + tolerance ||
                imageRect.top < contentRect.top - tolerance ||
                imageRect.bottom > contentRect.bottom + tolerance
            );
        });
        page.querySelectorAll('[data-preview-question-stem]').forEach(function(marker) {
            var id = marker.dataset.previewQuestionStem;
            if (id && !(id in stemPageOf)) stemPageOf[id] = i;
        });
    });
    const orphaned = [];
    (window.__examPreviewExpectedSideImageQuestions || []).forEach(function(id) {
        // Nếu Paged.js xóa hẳn figure thì `imgPageOf[id]` không tồn tại;
        // vẫn phải coi là mồ côi để kéo cả câu và phân trang lại.
        if (imgPageOf[id] === undefined || invalidImageOf[id] ||
            (stemPageOf[id] !== undefined && imgPageOf[id] !== stemPageOf[id])) {
            orphaned.push(id);
        }
    });
    return orphaned;
}

let pagedjsAttempts = 0;
function runPagedJS() {
    if (window.PagedPolyfill) {
        sizeOptionColumns();
        if (!atomicQuestions) {
            const qSelector = '[id^="q-"], [id^="qsol-"]';
            const expected = [];
            document.querySelectorAll(qSelector).forEach(function(q) {
                const content = q.querySelector(
                    '.question-content.doc-side-left, .question-content.doc-side-right'
                );
                const figures = content ? content.querySelectorAll('.doc-figure-block') : [];
                if (!figures.length) return;
                expected.push(q.id);

                // Paged.js có thể bỏ wrapper `.question[id]` khi chia câu thành
                // nhiều fragment. Marker con và data gắn thẳng vào figure vẫn
                // được clone sang trang tương ứng, nên không còn phụ thuộc closest().
                const stem = document.createElement('span');
                stem.dataset.previewQuestionStem = q.id;
                stem.className = 'preview-question-stem';
                q.insertBefore(stem, q.firstChild);
                figures.forEach(function(fig) {
                    fig.dataset.previewQuestionId = q.id;
                });
            });
            window.__examPreviewExpectedSideImageQuestions = expected.filter(function(id, index, all) {
                return id && all.indexOf(id) === index;
            });
        }
        const imagesReady = Array.from(document.images).map(function(img) {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            if (typeof img.decode === 'function') {
                return img.decode().catch(function() {});
            }
            return new Promise(function(resolve) {
                img.addEventListener('load', resolve, {once: true});
                img.addEventListener('error', resolve, {once: true});
            });
        });
        Promise.all([document.fonts.ready].concat(imagesReady))
        .then(() => window.PagedPolyfill.preview()).then(() => {
            const orphaned = atomicQuestions ? [] : detectOrphanQuestions();
            if (orphaned.length > 0 && !window.__examPreviewAppliedFixIds) {
                sessionStorage.setItem('examPreviewOrphanFixIds', JSON.stringify(orphaned));
                location.reload();
                return;
            }

            const loader = document.getElementById('pagedjs-loader');
            if (loader) loader.remove();

            const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
            const combinedSections = document.querySelectorAll(
                '.pagedjs_page [data-combined-exam-code]'
            );
            if (combinedSections.length) {
                const ranges = [];
                pages.forEach(function(page, index) {
                    const section = page.querySelector('[data-combined-exam-code]');
                    const code = section?.dataset.combinedExamCode;
                    if (!code) return;
                    let range = ranges[ranges.length - 1];
                    if (!range || range.code !== code) {
                        range = {code: code, start: index, count: 0};
                        ranges.push(range);
                    }
                    range.count++;
                });
                ranges.forEach(function(range) {
                    for (let index = range.start; index < range.start + range.count; index++) {
                        const page = pages[index];
                        page.querySelectorAll('.total-pages-placeholder').forEach(
                            el => el.textContent = range.count.toString().padStart(2, '0')
                        );
                        const marginBox = page.querySelector('.pagedjs_margin-bottom-right');
                        const marginContent = marginBox && (
                            marginBox.querySelector('.pagedjs_margin-content') || marginBox
                        );
                        if (marginContent) {
                            marginContent.classList.add('section-footer-content');
                            marginContent.textContent = `Trang ${index - range.start + 1}/${range.count} - Mã đề thi ${range.code}`;
                        }
                    }
                });
                window.__combinedExamRanges = ranges;
            }
            const answerSection = document.querySelector('.pagedjs_page .answer-key-section');
            const firstAnswerPage = answerSection ? pages.indexOf(answerSection.closest('.pagedjs_page')) : -1;
            const examPagesCount = firstAnswerPage >= 0 ? firstAnswerPage : pages.length;
            if (!combinedSections.length) {
                document.querySelectorAll('.total-pages-placeholder').forEach(el => el.textContent = examPagesCount.toString().padStart(2, '0'));
            }
            const answerPages = Math.max(0, pages.length - examPagesCount);
            document.querySelectorAll('.answer-pages-placeholder').forEach(el => el.textContent = answerPages.toString().padStart(2, '0'));

            // `counter(pages)` của Paged.js luôn tính toàn tài liệu. Ghi lại
            // nội dung margin box sau khi đã biết ranh giới đề/đáp án để hai
            // khu vực có bộ đếm độc lập, giống PDF xuất thật.
            const footerExamCode = document.getElementById('preview-code')?.textContent || '000';
            if (!combinedSections.length) pages.forEach(function(page, index) {
                const inExam = index < examPagesCount;
                const localPage = inExam ? index + 1 : index - examPagesCount + 1;
                const localTotal = inExam ? examPagesCount : answerPages;
                const marginBox = page.querySelector('.pagedjs_margin-bottom-right');
                const marginContent = marginBox && (
                    marginBox.querySelector('.pagedjs_margin-content') || marginBox
                );
                if (marginContent) {
                    marginContent.classList.add('section-footer-content');
                    marginContent.textContent = `Trang ${localPage}/${localTotal} - Mã đề thi ${footerExamCode}`;
                }
            });

            const style = document.createElement('style');
            style.textContent = `
                body { background-color: #e5e7eb !important; margin: 0 !important; padding: 0 !important; }
                .pagedjs_pages {
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  background-color: #e5e7eb !important;
                  padding: 30px 0 !important;
                }
                .pagedjs_page {
                  margin: 0 auto 40px auto !important;
                  background: transparent !important;
                  border: none !important;
                  box-shadow: none !important;
                  flex-shrink: 0 !important;
                }
                .pagedjs_sheet {
                  background-color: white !important;
                  box-shadow: 0 10px 20px rgba(0,0,0,0.2) !important;
                  border: 1px solid #999 !important;
                }
                /* Footer gốc của Paged.js nằm ở pseudo-element. Tắt cả hai
                   pseudo-element và dùng text node đã ghi phía trên, nếu
                   không hai footer sẽ xuất hiện chồng thành hai dòng. */
                .section-footer-content::before,
                .section-footer-content::after {
                  content: none !important;
                }
            `;
            document.head.appendChild(style);

            window.parent.postMessage({ type: 'PAGEDJS_READY' }, '*');
        }).catch(err => {
            console.error("Paged.js error:", err);
            document.body.innerHTML = '<div style="color:red; padding: 20px;">Lỗi xử lý PagedJS: ' + err.message + '</div>' + document.body.innerHTML;
        });
    } else {
        pagedjsAttempts++;
        if (pagedjsAttempts < 50) {
            setTimeout(runPagedJS, 100);
        } else {
            document.body.innerHTML = '<div style="color:red; padding: 20px;">Lỗi: Không tải được thư viện Paged.js từ mạng.</div>' + document.body.innerHTML;
        }
    }
}
setTimeout(runPagedJS, 300);
</script>"""
        pagination_invoke_script = pagination_invoke_script.replace(
            "__ATOMIC_QUESTIONS__", "true" if atomic_questions else "false"
        )
    else:
        pagination_invoke_script = '<script>document.addEventListener("DOMContentLoaded", sizeOptionColumns);</script>'

    # The original copy follows the Word export: clean exam, answer tables, then
    # detailed solutions. Shuffled copies still contain only the clean exam.
    if include_solution and show_answers:
        clean_body = _render_questions_body(
            questions, section_labels, False, False,
            pdf_markers=pdf_question_markers,
            linked_image_assets=linked_image_assets,
        )
        solution_body = _render_questions_body(
            questions, section_labels, True, True, id_prefix="qsol-",
            pdf_markers=pdf_question_markers,
            linked_image_assets=linked_image_assets,
        )
        body_content = clean_body
        trailing_content = f'''
        <section class="document-section answer-key-section">
            <div class="answer-page-header exam-header">
              <table class="header-table">
                <tr>
                  <td class="header-left" style="width: 33.33%; text-align: center; vertical-align: top; line-height: 1.25;">
                    <strong id="preview-answer-department">{html_module.escape(department or 'BỘ GIÁO DỤC VÀ ĐÀO TẠO')}</strong><br>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 70%;"></div>
                    <span id="preview-answer-exam-type">{html_module.escape(exam_type or 'ĐỀ THI CHÍNH THỨC')}</span><br>
                    <em>(Đáp án có <span class="answer-pages-placeholder">{answer_pages_text}</span> trang)</em>
                  </td>
                  <td class="header-right" style="width: 66.67%; text-align: center; vertical-align: top; line-height: 1.25;">
                    <strong id="preview-answer-exam-title">{html_module.escape(exam_title)}</strong><br>
                    <strong>Môn thi: <span id="preview-answer-subject">{html_module.escape(subject or '...')}</span></strong><br>
                    <em>Thời gian làm bài: <span id="preview-answer-duration">{duration}</span> phút, không kể thời gian phát đề</em>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 55%;"></div>
                  </td>
                </tr>
              </table>
              <table class="header-table info-table" style="margin-top: 16px;">
                <tr>
                  <td class="info-left answer-candidate-spacer" style="width: 60%; vertical-align: bottom; line-height: 1.25; text-align: left;">
                    <strong>Họ, tên thí sinh: ....................................................................</strong><br>
                    <strong>Số báo danh: .........................................................................</strong>
                  </td>
                  <td class="info-right" style="width: 40%; text-align: right; vertical-align: middle;">
                    <div class="code-box" style="display: inline-flex; align-items: center; justify-content: center; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; height: 24px;"><strong>Mã đề: <span id="preview-answer-code">{html_module.escape(code)}</span></strong></div>
                  </td>
                </tr>
              </table>
            </div>
            <div class="questions answer-key-content">{_render_answer_key_html(contest, questions)}</div>
        </section>
        <section class="document-section detailed-solution-section">
            <h2>LỜI GIẢI CHI TIẾT</h2>
            <div class="questions">{solution_body}</div>
        </section>'''
    else:
        body_content = _render_questions_body(
            questions, section_labels, include_solution, show_answers,
            pdf_markers=pdf_question_markers,
            linked_image_assets=linked_image_assets,
        )
        trailing_content = ''

    # Kiểu chữ đã nằm trong TreeDoc/LaTeX (`\textit`, `\textbf`, ...).
    # Không ép nghiêng cả khối ở đây, nếu không thao tác bỏ nghiêng trong
    # RichLatexEditor vẫn bị CSS của preview ghi đè.
    gi_html = f'<div id="preview-general-info" class="general-info" style="margin-top: 4px;">{_general_info_html(general_info)}</div>' if general_info else ''

    safety_px = max(0, int(pagination_safety_px))
    safe_bottom_margin = (
        "2cm" if safety_px == 0 else f"calc(2cm + {safety_px}px)"
    )

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
{orphan_fix_prelude}
{orphan_fix_style}
<title>{html_module.escape(exam_title)}</title>
<style>
{BUNDLED_FONT_FACE_CSS}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
    font-family: {BUNDLED_FONT_FAMILY};
    font-size: 12pt;
    line-height: 1.25;
    color: #000;
    orphans: 1;
    widows: 1;
    background: #fff;
    /* Công thức toán dài hơn cột nội dung (kể cả khi đã tự xuống dòng riêng)
       không thu nhỏ chữ, không cắt bớt chữ — cho tràn ra tự nhiên, tới đây
       (mép <body>, trùng mép trang giấy) mới chặn, phần tràn thêm bị mất chứ
       không hiện ra ngoài trang. Quan trọng hơn: KHÔNG chặn ở <body> thì phần
       tràn lan lên tới đây khiến Chromium coi cả trang không vừa khổ giấy và
       tự CO NHỎ TOÀN BỘ chữ trong trang để vừa (đã đo được thật: 1 công thức
       tràn ~43px kéo theo toàn trang co còn ~94%) — chặn tràn ở đúng mép
       ngoài cùng này để không xảy ra chuyện đó, mà vẫn không đụng gì tới
       cách công thức tự hiển thị/tự xuống dòng bên trong. */
    overflow-x: hidden;
}}
div.math.display math {{
    display: block !important;
    margin: 3px auto !important;
    text-align: center !important;
    text-align-last: center !important;
}}
span.math {{
    display: inline-block;
    padding-top: 3px;
    padding-bottom: 3px;
    margin-inline: 0.045em;
    vertical-align: baseline;
}}
/* Baseline nội bộ của MathML/Temml thấp hơn Times New Roman một chút. Chỉ
   hiệu chỉnh trong ghi chú để công thức inline nằm cùng chân chữ xung quanh. */
.general-info span.math {{
    vertical-align: 0.04em;
}}
math {{
    font-family: "Exam Cambria Math", math, serif;
}}
msqrt > mrow.sqrt-radicand {{
    transform: translateY(0.08em);
}}
math mtext {{
    font-family: "Exam Cambria", "Exam Times New Roman", serif;
}}
@page {{
  size: A4;
  margin-top: 1.15cm;
  margin-bottom: {safe_bottom_margin};
  margin-left: 1.5cm;
  margin-right: 1.2cm;
  @bottom-right {{
    content: "Trang " counter(page) "/" counter(pages) " - Mã đề thi {code}";
    font-family: 'Exam Times New Roman', serif;
    font-size: 12pt;
  }}
}}
@media print {{
  body {{ background-color: white !important; padding: 0 !important; }}
}}
.header-table {{ width: 100%; border-collapse: collapse; margin-bottom: 4px; }}
.header-left  {{ width: 35%; text-align: center; vertical-align: top; line-height: 1.25; padding-right: 8px; }}
.header-right {{ width: 65%; text-align: center; vertical-align: top; line-height: 1.25; }}
.info-table   {{ margin-top: 8px; }}
.info-left    {{ width: 60%; vertical-align: bottom; line-height: 1.25; }}
.info-right   {{ width: 40%; text-align: right; vertical-align: middle; }}
.code-box     {{ display: inline-block; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; }}
.general-info {{ margin-top: 8px; margin-bottom: 8px; }}
.section-header {{ margin-top: 6px; margin-bottom: 4px; text-align: justify; page-break-inside: avoid; break-inside: avoid; }}
.questions    {{ margin-top: 4px; }}
.question     {{ margin-bottom: 4px; {'' if include_solution else 'page-break-inside: avoid; break-inside: avoid;'} }}
.pdf-question-marker {{
    display: inline-block; width: 0; max-width: 0; overflow: visible;
    white-space: nowrap; font-size: 1px; line-height: 1; color: #fff;
    vertical-align: top;
}}
.pdf-image-marker {{ position: absolute; font-size: 1px; line-height: 1; color: #fff; }}
.preview-question-stem {{ position: absolute; width: 0; height: 0; overflow: hidden; }}
.question-content {{ text-align: justify; line-height: 1.25; }}
.question-content p {{ margin: 0; }}
.latex-table-wrap {{ overflow-x: auto; margin: 8px 0; display: flex; justify-content: center; }}
.latex-table {{ border-collapse: collapse; width: auto; max-width: 100%; font-size: 0.95em; }}
.latex-table td {{ border: 1px solid #000; padding: 4px 7px; text-align: center; vertical-align: middle; }}
.doc-table {{ border-collapse: collapse; margin: 6px auto; width: 100%; table-layout: fixed; font-size: 0.95em; break-inside: avoid; page-break-inside: avoid; }}
.doc-table td {{ border: 1px solid #000; padding: 4px 7px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }}
.question ul, .question ol {{ margin: 3px 0 3px 1.25em; padding-left: 1.1em; }}
.question ul {{ list-style-type: disc; }}
.question ul ul {{ list-style-type: circle; }}
.question ol {{ list-style-type: decimal; }}
.question li {{ margin: 1px 0; }}
.immini::after {{
    content: "";
    display: table;
    clear: both;
}}
.immini .immini-img {{
    float: right;
    margin-left: 12px;
    margin-bottom: 6px;
}}
.immini .immini-img img {{ display: block; max-width: 100%; }}
.options {{ display: flex; flex-wrap: wrap; margin-top: 1px; margin-bottom: 1px; line-height: 1.25; padding-left: 0.5cm; }}
.options .option {{
    padding: 1px 12px 1px 0;
    break-inside: avoid;
    page-break-inside: avoid;
}}
.options .option > .doc-figure-block {{
    display: inline-block;
    width: auto;
    margin: 0 0 0 4px;
    vertical-align: middle;
    text-align: left;
}}
.options.cols-4 .option {{ width: 25%; }}
.options.cols-2 .option {{ width: 50%; }}
.options.cols-1 .option {{ width: 100%; }}
.question-content.doc-side-left > .options.cols-1:not(.has-image),
.question-content.doc-side-right > .options.cols-1:not(.has-image) {{
    display: block;
}}
.question-content.doc-side-left > .options.cols-1:not(.has-image) > .option,
.question-content.doc-side-right > .options.cols-1:not(.has-image) > .option {{
    display: block;
    width: auto;
}}
.correct-label {{ color: #d32f2f; text-decoration: underline; font-weight: bold; }}
.tf-options {{ margin-top: 1px; line-height: 1.25; padding-left: 0.5cm; }}
.tf-item    {{ margin-bottom: 1px; }}
.short-answer {{ margin-top: 2px; }}
.answer-box   {{ font-weight: bold; text-decoration: underline; }}
.solution {{ margin-top: 2px; margin-bottom: 2px; line-height: 1.25; }}
.solution p {{ margin: 0; }}
.solution-header {{
    font-weight: bold;
    text-align: center;
    text-align-last: center;
    margin-bottom: 2px;
}}
.exam-footer {{ text-align: center; text-align-last: center; margin-top: 16px; }}
.answer-key-section {{ break-before: page; page-break-before: always; }}
.detailed-solution-section {{ margin-top: 24px; }}
.document-section > h2 {{ font-size: 14pt; text-align: center; margin: 0 0 12px; }}
.answer-key-section h3 {{ font-size: 12pt; margin: 10px 0 3px; }}
.answer-key-content > h3:first-child {{ margin-top: 0; }}
.answer-candidate-spacer {{ visibility: hidden; }}
.answer-key-section h3 span {{ font-weight: normal; }}
.tf-scoring-notes {{ line-height: 1.25; margin: 2px 0 4px; }}
.answer-table-wrap {{ display: flex; justify-content: center; margin: 3px 0 10px; break-inside: avoid; page-break-inside: avoid; }}
.answer-table {{ border-collapse: collapse; width: 100%; table-layout: fixed; }}
.answer-table td {{ border: 1px solid #000; padding: 2px 5px; text-align: center; vertical-align: middle; line-height: 1.25; }}
.tf-answer-table td {{ width: 16.666%; }}
.question img {{ max-width: 100%; height: auto; }}
/* Ảnh trôi cạnh chữ (doctree "side": left/right) — thiếu hẳn ở bản preview
   cũ (chỉ có ở renderer.py::render_exam_html, không dùng trong production),
   nên ảnh luôn rơi lên TRÊN đoạn văn thay vì trôi bên cạnh. Port nguyên xi
   từ renderer.py để preview và export PDF (cùng dùng file này) ra đúng. */
.question-content.doc-side-left::after,
.question-content.doc-side-right::after,
.solution.doc-side-left::after,
.solution.doc-side-right::after {{
    content: "";
    display: table;
    clear: both;
}}
.doc-side-right .doc-figure-block {{
    float: right; margin: 0 0 6px 12px; page-break-inside: avoid;
}}
.doc-side-left .doc-figure-block {{
    float: left; margin: 0 12px 6px 0; page-break-inside: avoid;
}}
.doc-figure-block {{ text-align: center; page-break-inside: avoid; }}
.doc-figure-block img, .doc-figure {{ display: inline-block; height: auto; }}
.doc-figure-inline {{ vertical-align: middle; }}
.doc-figure.is-missing, .doc-figure-inline.is-missing {{
    display: inline-block; color: #b91c1c; font-style: italic; font-size: 0.85em;
}}
/* SVG nhúng thẳng thẻ <svg> (không qua <img src="data:...">) — xem
   doctree/write/html.py::_img() và ghi chú ở renderer.py::_html_figures.
   svg co theo khung bọc nhờ CSS đè lên width/height gốc của chính nó. */
.doc-figure-svg svg {{ display: block; width: 100%; height: auto; }}
.doc-figure-svg.doc-figure-inline {{ display: inline-block; vertical-align: middle; }}
.doc-figure-svg.doc-figure-inline svg {{ display: block; width: 100%; height: auto; }}
.stimulus > .question-content {{
    font-style: normal;
    margin-bottom: 6px;
    padding-bottom: 4px;
}}

/* Fix: Prevent Paged.js from stretching the last line of a broken paragraph
   while preserving text-align: center for images, tables, and headers */
[data-split-to] {{ text-align-last: auto !important; }}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/Temml-Local.css">
<script src="https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/temml.min.js"></script>
{pagedjs_head_scripts}
<script>
document.addEventListener("DOMContentLoaded", function() {{
    let mathElems = document.querySelectorAll(".math");
    mathElems.forEach(function(el) {{
        let tex = el.textContent;
        try {{
            let isDisplay = el.classList.contains("display");
            tex = "\\\\displaystyle " + tex;
            temml.render(tex, el, {{ 
                displayMode: isDisplay,
                macros: {{
                    "\\\\hoac": "\\\\left[\\\\begin{{aligned}}#1\\\\end{{aligned}}\\\\right.",
                    "\\\\heva": "\\\\left\\\\{{\\\\begin{{aligned}}#1\\\\end{{aligned}}\\\\right."
                }}
            }});
        }} catch (e) {{
            console.error("Temml error:", e);
        }}
    }});
    
    var MML_NS = "http://www.w3.org/1998/Math/MathML";
    document.querySelectorAll("msqrt").forEach(function(sq) {{
        var row = document.createElementNS(MML_NS, "mrow");
        row.classList.add("sqrt-radicand");
        while (sq.firstChild) row.appendChild(sq.firstChild);
        sq.appendChild(row);
    }});

    document.querySelectorAll("mfrac").forEach(function(f) {{
        f.setAttribute("linethickness", "1px");
    }});
    document.body.setAttribute('data-math-ready', 'true');
}});
</script>
</head>
<body>
{pagedjs_loader_div}
<div class="page">
    <div class="exam-header">
        <table class="header-table">
            <tr>
                <td class="header-left" style="width: 33.33%; text-align: center; vertical-align: top; line-height: 1.25;">
                    <strong id="preview-department">{html_module.escape(department or 'BỘ GIÁO DỤC VÀ ĐÀO TẠO')}</strong>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 70%;"></div>
                    <span id="preview-exam-type">{html_module.escape(exam_type or 'ĐỀ THI CHÍNH THỨC')}</span><br>
                    <em>(Đề thi có <span class="total-pages-placeholder">{exam_pages_text}</span> trang)</em>
                </td>
                <td class="header-right" style="width: 66.67%; text-align: center; vertical-align: top; line-height: 1.25;">
                    <strong id="preview-exam-title">{html_module.escape(exam_title)}</strong><br>
                    <strong>Môn thi: <span id="preview-subject">{html_module.escape(subject or '...')}</span></strong><br>
                    <em>Thời gian làm bài: <span id="preview-duration">{duration}</span> phút, không kể thời gian phát đề</em>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 55%;"></div>
                </td>
            </tr>
        </table>
        <table class="header-table info-table" style="margin-top: 16px;">
            <tr>
                <td class="info-left" style="width: 60%; vertical-align: bottom; line-height: 1.25; text-align: left;">
                    <strong>Họ, tên thí sinh: ....................................................................</strong><br>
                    <strong>Số báo danh: .........................................................................</strong>
                </td>
                <td class="info-right" style="width: 40%; text-align: right; vertical-align: middle;">
                    <div class="code-box" style="display: inline-flex; align-items: center; justify-content: center; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; height: 24px;"><strong>Mã đề: <span id="preview-code">{html_module.escape(code)}</span></strong></div>
                </td>
            </tr>
        </table>
    </div>

    {gi_html}

    <div class="questions">
        {body_content}
    </div>

    <div class="exam-footer">
        <strong>{'-' * 24} HẾT {'-' * 24}</strong>
    </div>
</div>
{trailing_content}
<script>
// Đo và chọn số cột (1/2/4) cho các lưới phương án co giãn theo bề rộng thật,
// không còn phụ thuộc Paged.js — chạy thẳng khi DOM đã nạp xong. Việc phân
// trang thật (đếm .total-pages-placeholder/.answer-pages-placeholder) giờ do
// Chromium in-to-PDF đảm nhiệm, giá trị đã được server bơm sẵn vào HTML này
// (xem tham số exam_pages/answer_pages) qua 1 lượt in-thử trước đó.
function sizeOptionColumns() {{
    const originalBodyWidth = document.body.style.width;
    document.body.style.width = '691px';

    document.querySelectorAll('.options.cols-auto').forEach(grid => {{
        const opts = grid.querySelectorAll('.option');
        opts.forEach(opt => opt.style.display = 'none');

        grid.style.display = 'flex';
        let containerW = grid.offsetWidth || 691;

        let maxW = 0;
        opts.forEach(opt => {{
            opt.style.display = 'inline-block';
            opt.style.width = 'auto';
            opt.style.whiteSpace = 'nowrap';
            maxW = Math.max(maxW, opt.getBoundingClientRect().width);
        }});

        let cols = 4;
        if (maxW > containerW * 0.48) {{
            cols = 1;
        }} else if (maxW > containerW * 0.23) {{
            cols = 2;
        }}

        grid.style.display = '';
        opts.forEach(opt => {{
            opt.style.display = '';
            opt.style.width = '';
            opt.style.whiteSpace = '';
        }});
        const imageClass = grid.classList.contains('has-image') ? ' has-image' : '';
        grid.className = `options cols-${{cols}}${{imageClass}}`;
    }});

    document.body.style.width = originalBodyWidth;
}}
</script>
{pagination_invoke_script}
</body>
</html>"""


def _has_side_image(doc: dict) -> bool:
    """`doc` là `content`/`solution` của MỘT câu — có ảnh trôi cạnh chữ hay
    không (`side: left/right` + ít nhất 1 node "image"/"image_inline")."""
    if not doc or doc.get('side') not in ('left', 'right'):
        return False
    return any(n.get('type') in ('image', 'image_inline') for n in (doc.get('content') or []))


def _compute_display_numbers(questions: List[dict]) -> Dict[str, int]:
    """`{q_id: "Câu N"}` theo ĐÚNG luật đánh số dùng trong
    `_render_questions_body` (reset về 1 mỗi khi đổi loại câu mc/tf/sa/oe, câu
    con của 'st' đánh số nối tiếp) — PHẢI khớp `_render_questions_body`, tách
    riêng ở đây để dò-mồ-côi (`render_exam_pdf`) không cần dựng lại HTML chỉ
    để biết câu nào ứng với "Câu mấy" trên trang in."""
    printed = {'mc': False, 'tf': False, 'sa': False, 'oe': False}
    q_counter = 1
    processed_ids = set()
    numbers: Dict[str, int] = {}
    for q in questions:
        q_id = str(q.get('id', ''))
        if q_id in processed_ids:
            continue
        q_type = q.get('question_type')
        eff_type = q_type
        if q_type == 'st':
            children = [c for c in questions if c.get('parent_id') == q['id']]
            if children:
                eff_type = children[0].get('question_type', 'mc')
        if eff_type in printed and not printed[eff_type]:
            printed[eff_type] = True
            q_counter = 1
        if q_type == 'st':
            for child in [c for c in questions if c.get('parent_id') == q['id']]:
                numbers[str(child.get('id', ''))] = q_counter
                processed_ids.add(str(child.get('id', '')))
                q_counter += 1
            processed_ids.add(q_id)
        elif not q.get('parent_id'):
            numbers[q_id] = q_counter
            processed_ids.add(q_id)
            q_counter += 1
    return numbers


def _questions_with_side_image(questions: List[dict], include_solution: bool = False) -> List[tuple]:
    """`[(id_css, display_number, figure_id), ...]` theo đúng thứ tự xuất hiện trong tài
    liệu — chỉ những câu THẬT SỰ có ảnh trôi. Câu dẫn `st` không có số hiển
    thị riêng nhưng vẫn có marker ID `q-{id}`/`qsol-{id}`, nên được dò giống
    hệt các loại câu còn lại.

    `include_solution=True` — tài liệu có CẢ bản đề sạch (`id="q-N"`) LẪN bản
    lời giải chi tiết (`id="qsol-N"`, dựng lại CÙNG câu hỏi lần 2, xem
    `_render_questions_body`) — ảnh trôi trong `content_doc` của câu hỏi bị
    render lại y hệt ở CẢ 2 chỗ, nên phải trả về CẢ 2 id để dò-mồ-côi ở CẢ 2
    khu vực, không chỉ riêng bản đề sạch (bug thật đã gặp: bản đề sạch không
    mồ côi nhưng bản lời giải mồ côi, vì trước đây chỉ dò mỗi "q-")."""
    numbers = _compute_display_numbers(questions)
    out = []

    for q in questions:
        q_id = str(q.get('id', ''))
        content = q.get('content') or {}
        if _has_side_image(content):
            n = numbers.get(q_id)
            figure_ids = [
                node.get('figure_id') for node in (content.get('content') or [])
                if node.get('type') in ('image', 'image_inline')
                and node.get('figure_id') is not None
            ]
            for figure_id in figure_ids:
                out.append((f"q-{q_id}", n, str(figure_id)))
                if include_solution:
                    out.append((f"qsol-{q_id}", n, str(figure_id)))
    return out


def _detect_orphaned_questions(pdf_source, image_questions: List[tuple],
                                page_start: int = 0, page_end: int = None) -> List[str]:
    """So trang chứa ẢNH vs trang bắt đầu ĐỀ BÀI (marker ID duy nhất) cho từng
    câu có ảnh trôi — khác trang nhau tức ảnh bị mồ côi. Trả về list id css
    (`"q-235"`) cần khoá `page-break-inside:avoid` ở lượt in cuối.

    Marker `[[QID:q-235]]` được render inline bằng chữ trắng 1px trong span
    rộng 0: PyMuPDF vẫn đọc được nhưng nó không chiếm chỗ và không hiện trên giấy.
    Nhờ vậy `q-` và `qsol-` cũng được phân biệt trực tiếp, không phụ thuộc số
    hiển thị vốn reset và lặp lại giữa các phần mc/tf/sa/oe.

    Không suy đoán qua `get_drawings()` vì công thức và ảnh TikZ đều tạo ra
    nhiều nét vector giống nhau. HTML nháp gắn marker riêng
    `[[IMGQID:q-235:78]]` ngay trong figure; chỉ cần so trang của marker câu
    với đúng marker ảnh tương ứng. Marker ảnh mất hoặc khác trang đều là lỗi.

    `page_start`/`page_end` vẫn giới hạn vùng đề sạch/lời giải để giảm lượng
    trang phải quét; tính đúng đắn không còn phụ thuộc giới hạn này vì marker
    của hai vùng đã có prefix riêng."""
    import fitz
    doc = (
        fitz.open(stream=pdf_source, filetype='pdf')
        if isinstance(pdf_source, (bytes, bytearray, memoryview))
        else fitz.open(pdf_source)
    )
    page_end = len(doc) if page_end is None else page_end
    orphaned = []
    for id_css, _display_number, figure_id in image_questions:
        marker = f"[[QID:{id_css}]]"
        stem_page = None
        for i in range(page_start, page_end):
            page = doc[i]
            hits = page.search_for(marker)
            if hits:
                stem_page = i
                break
        if stem_page is None:
            continue

        image_marker = f"[[IMGQID:{id_css}:{figure_id}]]"
        image_page = None
        for i in range(page_start, page_end):
            if doc[i].search_for(image_marker):
                image_page = i
                break
        if image_page != stem_page:
            orphaned.append(id_css)
    doc.close()
    return orphaned


def _render_exam_pdf_native(output_path: str, code: str = "000", html_output_path: str = None, **html_kwargs) -> str:
    """In đề thi ra PDF thật, phân trang bằng Chromium (không Paged.js), với số
    trang THẬT hiện đúng ở dòng "(Đề thi có X trang)" / "(Đáp án có Y trang)".

    Dựng lặp tới khi cả số trang và tập câu cần chống ngắt đều hội tụ. Lượt
    đầu dùng placeholder ("..."); mỗi lượt sau dùng đúng số trang vừa đo và
    giữ cộng dồn các câu đã phát hiện mồ côi. Việc lặp là cần thiết vì thay
    placeholder bằng số thật, hoặc chống ngắt một câu, đều có thể làm dịch
    điểm ngắt và tạo ra một trường hợp mồ côi mới ở lượt kế tiếp.

    `html_kwargs` chuyển thẳng vào `render_exam_preview_html` (contest,
    questions, exam_title, ...). Trả về HTML cuối cùng đã dùng để in.

    Mỗi PDF thăm dò đều được dò-mồ-côi (xem
    `docs/phan-trang-anh-troi.md`). PDF cuối chỉ được in sau khi không còn số
    trang mới và không còn id mồ côi mới.
    """
    import fitz

    # `include_solution`/`show_answers` mặc định True/True khớp
    # `render_exam_preview_html` — CẢ HAI cùng True mới thật sự render bản
    # lời giải chi tiết (`dual_section`, xem điều kiện y hệt bên dưới của hàm
    # đó); chỉ khi đó câu có ảnh mới bị render lại LẦN HAI (`qsol-{id}`, xem
    # `_render_questions_body`) cần dò-mồ-côi RIÊNG cho khu vực đó.
    dual_section = html_kwargs.get('include_solution', True) and html_kwargs.get('show_answers', True)
    image_questions = _questions_with_side_image(html_kwargs.get('questions') or [], include_solution=dual_section)

    exam_ids = [t for t in image_questions if t[0].startswith('q-')]
    sol_ids = [t for t in image_questions if t[0].startswith('qsol-')]

    initial_html = render_exam_preview_html(
        code=code, pdf_question_markers=True, **html_kwargs,
    )
    # Mỗi lượt gây thay đổi phải thêm ít nhất một id mới hoặc cập nhật
    # số trang để lượt kế tiếp xác nhận lại đúng layout đó. Vì tập id chỉ tăng,
    # giới hạn theo số câu có ảnh vừa đủ để chặn vòng lặp bất thường mà không
    # cắt cụt một chuỗi mồ-côi lan dần qua nhiều câu.
    max_iterations = max(8, len({item[0] for item in image_questions}) + 4)
    async def converge_in_one_page(page):
        exam_pages = None
        answer_pages = None
        orphan_fix_ids = []
        converged = False

        for _ in range(max_iterations):
            probe_pdf = await _page_to_cropped_pdf_bytes(page)
            doc = fitz.open(stream=probe_pdf, filetype='pdf')
            try:
                total_pages = len(doc)
                measured_exam_pages = total_pages
                measured_answer_pages = 0
                for i in range(total_pages):
                    if "LỜI GIẢI CHI TIẾT" in doc[i].get_text():
                        measured_exam_pages = i
                        measured_answer_pages = total_pages - i
                        break
            finally:
                doc.close()

            detected_ids = []
            if exam_ids:
                detected_ids += _detect_orphaned_questions(
                    probe_pdf, exam_ids, 0, measured_exam_pages,
                )
            if sol_ids and measured_answer_pages > 0:
                detected_ids += _detect_orphaned_questions(
                    probe_pdf, sol_ids, measured_exam_pages, total_pages,
                )

            new_ids = [qid for qid in detected_ids if qid not in orphan_fix_ids]
            counts_changed = (
                measured_exam_pages != exam_pages
                or measured_answer_pages != answer_pages
            )
            exam_pages = measured_exam_pages
            answer_pages = measured_answer_pages
            orphan_fix_ids.extend(new_ids)
            if not counts_changed and not new_ids:
                converged = True
                break

            # Temml/font/ảnh giữ nguyên; chỉ hai con số và tập CSS này làm
            # thay đổi layout giữa các lượt hội tụ.
            await page.evaluate(
                """({examPages, answerPages, fixIds}) => {
                    document.querySelectorAll('.total-pages-placeholder').forEach(
                        el => el.textContent = String(examPages).padStart(2, '0'));
                    document.querySelectorAll('.answer-pages-placeholder').forEach(
                        el => el.textContent = String(answerPages).padStart(2, '0'));
                    let style = document.getElementById('orphan-fix');
                    if (!style) {
                        style = document.createElement('style');
                        style.id = 'orphan-fix';
                        document.head.appendChild(style);
                    }
                    style.textContent = fixIds.map(id =>
                        `#${CSS.escape(id)} { page-break-inside: avoid; break-inside: avoid; }`
                    ).join('\\n');
                }""",
                {
                    'examPages': exam_pages,
                    'answerPages': answer_pages,
                    'fixIds': orphan_fix_ids,
                },
            )

        if not converged:
            raise RuntimeError(
                f"PDF pagination did not converge after {max_iterations} iterations"
            )

        # Marker chỉ phục vụ các lượt dò. Xoá trước khi in bản giao; chúng có
        # bề rộng 0 nên thao tác này không làm đổi bố cục đã hội tụ.
        await page.evaluate(
            """document.querySelectorAll(
                '.pdf-question-marker,.pdf-image-marker'
            ).forEach(el => el.remove());
            const footerStyle = document.createElement('style');
            footerStyle.id = 'section-footer-overlay';
            footerStyle.textContent = `@page {
                @bottom-right { content: none !important; }
            }`;
            document.head.appendChild(footerStyle);"""
        )
        final_pdf = await _page_to_cropped_pdf_bytes(page)
        final_pdf = _stamp_section_footers(
            final_pdf, exam_pages, answer_pages, code,
        )
        with open(output_path, 'wb') as output_file:
            output_file.write(final_pdf)

        if html_output_path:
            await page.evaluate(
                """document.querySelectorAll('script').forEach(s => s.remove());
                document.getElementById('pdf-print-overflow-fix')?.remove();"""
            )
            rendered_html = await page.content()
            with open(html_output_path, 'w', encoding='utf-8') as output_file:
                output_file.write(rendered_html)

        return exam_pages, answer_pages, orphan_fix_ids

    exam_pages, answer_pages, orphan_fix_ids = html_pdf_page_session_sync(
        initial_html, converge_in_one_page,
    )

    final_html = render_exam_preview_html(
        code=code, exam_pages=exam_pages, answer_pages=answer_pages,
        orphan_fix_ids=orphan_fix_ids, **html_kwargs,
    )
    print(f"PDF saved to: {output_path}")
    return final_html


def render_exam_pdf(output_path: str, code: str = "000",
                    html_output_path: str = None, **html_kwargs) -> str:
    """Xuất đúng các sheet A4 mà Paged.js dùng cho preview.

    Paged.js quyết định ranh giới trang đúng một lần cho toàn tài liệu; bước
    PDF chỉ lần lượt in từng sheet đã phân trang và ghép chúng trong bộ nhớ.
    Vì vậy preview và PDF không còn lệch một dòng do Chromium phân trang lại.
    """
    pdf_html_kwargs = dict(html_kwargs)
    pdf_html_kwargs.setdefault(
        "pagination_safety_px", ORIGINAL_EXPORT_PAGINATION_SAFETY_PX
    )
    preview_html = render_exam_preview_html(
        code=code, paginate_client=True, linked_image_assets=True,
        **pdf_html_kwargs,
    )
    result = pagedjs_to_pdf_sync(
        preview_html, capture_html=bool(html_output_path),
    )

    with open(output_path, 'wb') as output_file:
        output_file.write(result['pdf'])
    if html_output_path:
        with open(html_output_path, 'w', encoding='utf-8') as output_file:
            output_file.write(result['html'])

    # Trả HTML nguồn với số trang đúng cho các caller đang dùng giá trị trả
    # về; file PDF vẫn lấy trực tiếp từ DOM Paged.js ở trên.
    final_html = render_exam_preview_html(
        code=code,
        exam_pages=result['exam_pages'],
        answer_pages=result['answer_pages'],
        **html_kwargs,
    )
    print(f"PDF saved to: {output_path}")
    return final_html


def render_shuffled_pdf_batch(codes_data, expected_pages=None, **html_kwargs):
    """In native một lô đề đảo và trả từng PDF con đã đóng header/footer."""
    import fitz

    if not codes_data:
        return {}

    fragments = []
    base_html = None
    first_fragment = None
    fragment_end_marker = "\n<script>\n// Đo"
    for code, questions in codes_data:
        rendered = render_exam_preview_html(
            questions=questions,
            code=code,
            include_solution=False,
            show_answers=False,
            exam_pages=expected_pages,
            paginate_client=False,
            atomic_questions=True,
            linked_image_assets=True,
            **html_kwargs,
        )
        start = rendered.find('<div class="page">')
        end = rendered.find(fragment_end_marker, start)
        if start < 0 or end < 0:
            raise RuntimeError(f"Không tách được HTML native của mã đề {code}")
        fragment = rendered[start:end]
        marker = (
            f'<span class="combined-code-marker">'
            f'[[EXAM_CODE_START:{html_module.escape(str(code))}]]</span>'
        )
        wrapped = (
            f'<section class="combined-exam-section" '
            f'data-combined-exam-code="{html_module.escape(str(code))}">'
            f'{marker}{fragment}</section>'
        )
        fragments.append(wrapped)
        if base_html is None:
            base_html = rendered
            first_fragment = fragment

    combined_html = base_html.replace(first_fragment, "\n".join(fragments), 1)
    combined_html = combined_html.replace(
        "</head>",
        """<style>
@page { @bottom-right { content: none !important; } }
.combined-exam-section { break-before: page; page-break-before: always; }
.combined-exam-section:first-of-type { break-before: auto; page-break-before: auto; }
.combined-code-marker {
  position: absolute; width: 0; height: 0; overflow: visible;
  white-space: nowrap; color: #fff; font-size: 1px; line-height: 1;
}
</style>
</head>""",
        1,
    )
    batch_pdf = native_html_to_pdf_bytes_sync(combined_html)
    source = fitz.open(stream=batch_pdf, filetype="pdf")
    try:
        starts = []
        for code, _questions in codes_data:
            needle = f"[[EXAM_CODE_START:{code}]]"
            found = [i for i, page in enumerate(source) if page.search_for(needle)]
            if len(found) != 1:
                raise RuntimeError(
                    f"Marker mã {code} xuất hiện trên {len(found)} trang: {found}"
                )
            starts.append(found[0])
        if starts != sorted(starts) or len(set(starts)) != len(starts):
            raise RuntimeError(f"Ranh giới mã đề không hợp lệ: {starts}")

        children = {}
        for index, (code, _questions) in enumerate(codes_data):
            start = starts[index]
            end = starts[index + 1] - 1 if index + 1 < len(starts) else len(source) - 1
            child = fitz.open()
            try:
                child.insert_pdf(source, from_page=start, to_page=end)
                data = child.tobytes(garbage=4, deflate=True)
            finally:
                child.close()
            page_count = end - start + 1
            if expected_pages is not None and page_count != expected_pages:
                print(
                    f"Warning: mã {code} native có {page_count} trang, "
                    f"khác target {expected_pages} trang"
                )
            data = _stamp_section_footers(data, page_count, 0, str(code))
            children[str(code)] = data
        return children
    finally:
        source.close()
