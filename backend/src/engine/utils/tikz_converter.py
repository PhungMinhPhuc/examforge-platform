import os
import subprocess
import tempfile
import shutil

from font_assets import DOCUMENT_FONT_DIR, MATH_FONT_DIR, latex_font_path

# TikZ được đặt cạnh nội dung đề 12pt. Phải khai báo cùng cỡ ngay từ lúc
# biên dịch thay vì phóng SVG ở bộ xuất, nếu không chữ trong hình vẫn là 10pt
# mặc định của lớp standalone và nhìn nhỏ hơn chữ xung quanh.
TIKZ_DOCUMENT_FONT_SIZE_PT = 12


def tikz_to_svg(tikz_code, output_path):
    latex_template = r"""
\documentclass[__TIKZ_FONT_SIZE__pt,tikz,border=2pt]{standalone}
\usepackage{amsmath,amssymb,fancyhdr}
\usepackage{fontspec}
\setmainfont{times.ttf}[Path=__DOCUMENT_FONT_PATH__,BoldFont=timesbd.ttf,ItalicFont=timesi.ttf,BoldItalicFont=timesbi.ttf]
\usepackage{unicode-math}
\setmathfont{CambriaMath.ttf}[Path=__MATH_FONT_PATH__]
\setmathrm{CambriaMath.ttf}[Path=__MATH_FONT_PATH__]
\setmathfont{XITS Math}[range={cal,bfcal}]
\usepackage{tikz,tikz-3dplot,tkz-tab}
\usetikzlibrary{arrows,calc,intersections,patterns,angles,shapes.geometric,arrows.meta,shapes.symbols,quotes,decorations.markings,decorations.pathmorphing}
\usepackage{graphicx}
\usepackage{fontawesome5}
\usepackage{setspace}
\tikzset{arrow style/.append style = {>={Stealth[length=8pt, width=6pt]}}}
\usepackage{scrextend}
\sloppy
\usepackage{xcolor}
\setlength{\fboxrule}{0.75pt}
\renewenvironment{center}{\par\centering}{\par}
\usepackage{ifsym}

% Custom macros from user
\newcommand{\hoac}[1]{\left[\begin{aligned}#1\end{aligned}\right.}
\newcommand{\heva}[1]{\left\{\begin{aligned}#1\end{aligned}\right.}
\everymath{\displaystyle}

\begin{document}
""" + tikz_code + r"""
\end{document}
"""
    latex_template = latex_template.replace(
        "__TIKZ_FONT_SIZE__", str(TIKZ_DOCUMENT_FONT_SIZE_PT), 1
    )
    latex_template = latex_template.replace(
        "__DOCUMENT_FONT_PATH__", latex_font_path(DOCUMENT_FONT_DIR) + "/"
    ).replace(
        "__MATH_FONT_PATH__", latex_font_path(MATH_FONT_DIR) + "/"
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_file = os.path.join(tmpdir, "tikz2svg_temp.tex")
        with open(tex_file, "w", encoding="utf-8") as f:
            f.write(latex_template)

        try:
            proc = subprocess.run([
                    "xelatex", "-interaction=nonstopmode", "tikz2svg_temp.tex"],
                cwd=tmpdir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            if proc.returncode != 0:
                subprocess.run([
                        "lualatex", "-interaction=nonstopmode", "tikz2svg_temp.tex"],
                    cwd=tmpdir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            pdf_file = os.path.join(tmpdir, "tikz2svg_temp.pdf")
            if os.path.exists(pdf_file):
                subprocess.run(
                    ["pdftocairo", 
                     "-svg", 
                     "tikz2svg_temp.pdf", 
                     "tikz2svg_temp.svg"],
                    cwd=tmpdir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                
                svg_temp_path = os.path.join(tmpdir, "tikz2svg_temp.svg")
                if os.path.exists(svg_temp_path):
                    shutil.copy2(svg_temp_path, output_path)
                    return True
        except Exception as e:
            print(f"TikZ_Error: {e}")
            
    return False
