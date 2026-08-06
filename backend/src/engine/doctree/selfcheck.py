"""Đo bộ đọc và bộ ghi trên toàn bộ `.tex` trong Sample/ — chạy được độc lập.

Bốn phép, chặt dần:

  1. ĐỌC ĐƯỢC     — không gặp lệnh lạ, không vỡ.
  2. HỢP LỆ       — cây khớp lược đồ ở schema.py.
  3. KHỚP CỘT     — nhãn `side` khớp cột `layout_type` (bất biến 6, mục 12).
  4. VÒNG TRÒN    — .tex → cây A → .tex' → cây B, và A phải bằng B từng nút.

Phép 4 mạnh nhất: nó **không** so cây với chuỗi gốc (so thế thì thua ngay, vì
thụt lề và mẹo căn dòng cố ý bị bỏ), mà bắt bộ ghi dựng lại rồi cho bộ đọc đọc
lần nữa. Đạt nghĩa là bộ đọc và bộ ghi hiểu nhau, không ai đánh rơi gì của ai.

    python backend/src/engine/doctree/selfcheck.py [thư-mục-tex]
"""
import collections
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from doctree import validate                       # noqa: E402
from doctree.read import tex as R               # noqa: E402
from doctree.schema import check_layout_consistency  # noqa: E402
from doctree.write import tex as W             # noqa: E402

DEFAULT_DIR = os.path.join(HERE, "..", "..", "..", "..", "Sample")


def signature(rec):
    """Chữ ký cấu trúc — thứ bất biến 5 đòi phải giữ nguyên qua vòng tròn."""
    return (rec["question_type"], rec["layout_type"], len(rec["options"]),
            tuple(o["is_correct"] for o in rec["options"]),
            bool(rec["solution_doc"]["content"]))


def run(folder):
    stats = collections.Counter()
    unknown = collections.Counter()
    samples = {}

    for path in sorted(glob.glob(os.path.join(folder, "*.tex"))):
        name = os.path.basename(path)
        with open(path, encoding="utf-8", errors="replace") as f:
            src = f.read()

        for idx, block in enumerate(R.RE_EX.findall(src)):
            stats["tổng"] += 1
            try:
                group, figs = R.read_tex_block(block)
            except R.UnknownCommand as e:
                stats["lệnh lạ"] += 1
                for tok in str(e).split(", "):
                    unknown[tok.split("×")[0]] += int(tok.split("×")[1])
                samples.setdefault("lệnh lạ", (name, idx, str(e)))
                continue
            except R.BadSource as e:
                stats["nguồn sai mẫu"] += 1
                samples.setdefault("nguồn sai mẫu", (name, idx, str(e)))
                continue
            except Exception as e:
                stats["vỡ"] += 1
                samples.setdefault("vỡ", (name, idx, f"{type(e).__name__}: {e}"))
                continue
            stats["đọc được"] += 1

            fig_ids = {f["id"] for f in figs.rows}
            bad = []
            for qi, r in enumerate(group):
                trees = ([("content", r["content_doc"]), ("solution", r["solution_doc"])]
                         + [(f"opt{i}", o["content_doc"]) for i, o in enumerate(r["options"])])
                for label, tree in trees:
                    bad += [f"q{qi}.{label}.{e}" for e in validate(tree, fig_ids)]
            if bad:
                stats["sai lược đồ"] += 1
                samples.setdefault("sai lược đồ", (name, idx, bad[0]))
                continue
            stats["hợp lệ"] += 1

            msg = check_layout_consistency(group[0]["layout_type"],
                                           group[0]["content_doc"].get("side", "center"))
            if msg:
                stats["lệch cột"] += 1
                samples.setdefault("lệch cột", (name, idx, msg))
                continue
            stats["khớp cột"] += 1

            try:
                tex2 = W.to_tex(group, figs.by_id())
                inner = R.RE_EX.findall(tex2)
                if not inner:
                    raise ValueError("bộ ghi không sinh ra \\begin{ex}")
                group2, _ = R.read_tex_block(inner[0], strict=False)
                if len(group2) != len(group):
                    raise ValueError(f"số câu đổi: {len(group)} -> {len(group2)}")
            except Exception as e:
                stats["ghi lại vỡ"] += 1
                samples.setdefault("ghi lại vỡ", (name, idx, f"{type(e).__name__}: {e}"))
                continue

            if [signature(r) for r in group] != [signature(r) for r in group2]:
                stats["lệch cấu trúc"] += 1
                samples.setdefault("lệch cấu trúc", (name, idx, "chữ ký khác"))
                continue
            if json.dumps([r["content_doc"] for r in group], sort_keys=True) != \
               json.dumps([r["content_doc"] for r in group2], sort_keys=True):
                stats["lệch cây"] += 1
                samples.setdefault("lệch cây", (name, idx, "content_doc khác"))
                continue
            stats["vòng tròn đạt"] += 1

    return stats, unknown, samples


def main(folder=None):
    folder = folder or DEFAULT_DIR
    stats, unknown, samples = run(folder)
    n = stats["tổng"]
    if not n:
        print(f"Không tìm thấy file .tex nào trong {folder}")
        return 1

    print(f"\n{'=' * 60}\nĐO TRÊN {n} KHỐI ex\n{'=' * 60}\n")
    for k in ("đọc được", "hợp lệ", "khớp cột", "vòng tròn đạt"):
        v = stats[k]
        print(f"  {k:<16} {v:>5}/{n}  {v / n * 100:5.1f}%  " + "█" * round(v / n * 36))

    rot = [(k, stats[k]) for k in ("lệnh lạ", "nguồn sai mẫu", "vỡ", "sai lược đồ",
                                   "lệch cột", "ghi lại vỡ", "lệch cấu trúc",
                                   "lệch cây") if stats[k]]
    if rot:
        print("\n  Rớt ở đâu:")
        for k, v in rot:
            print(f"    {k:<16} {v:>5}")
    if unknown:
        print("\n  Lệnh chưa dịch được:")
        for cmd, c in unknown.most_common(20):
            print(f"    {c:>5}×  \\{cmd}")
    for k, (f, i, msg) in samples.items():
        print(f"    [{k}] {f} #{i}: {msg[:90]}")
    print()
    return 0 if stats["vòng tròn đạt"] == n else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
