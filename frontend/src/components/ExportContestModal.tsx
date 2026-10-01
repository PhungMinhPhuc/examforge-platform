"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import NumberInput from "@/components/NumberInput";
import Checkbox from "@/components/Checkbox";
import Radio from "@/components/Radio";
import RichLatexEditor from "@/components/rich-latex-editor";
import {
  BlockNode,
  CodeBlockNode,
  InlineNode,
  TableNode,
  TreeDoc,
  treeToHtml,
} from "@/lib/docTree";
import { toast } from "@/lib/toastStore";
import { Icon } from "@/components/icons";
import RibbonScroller from "@/components/RibbonScroller";
import { ProgressBar, Spinner } from "@/components/Loading";
import MessageBar from "@/components/MessageBar";

type ExportContest = { id: number; title: string };
type WordEquationFormat = "omml" | "mathtype";
type PreviewResponse = { html?: string };
type ExportResponse = { task_id: string };
type ExportStatusResponse = {
  progress?: number;
  total?: number;
  message?: string;
  status: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const PREVIEW_FONT_ORIGIN = "https://exam-fonts.local";

function resolvePreviewFontUrls(html: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
  const absoluteApiUrl = new URL(apiUrl, window.location.origin)
    .toString()
    .replace(/\/$/, "");
  return html.replaceAll(
    `${PREVIEW_FONT_ORIGIN}/`,
    `${absoluteApiUrl}/static/pdf-fonts/`,
  );
}

const DEFAULT_GENERAL_INFO =
  "+ Cho biết: $\\pi = 3{,}14$; $T(K) = t(^\\circ C) + 273$; $R = 8{,}31$ J.mol$^{-1}$.K$^{-1}$; $N_A = 6{,}02.10^{23}$ hạt/mol; $\\ln 2 = 0{,}693$.\n+ Không làm tròn kết quả các phép tính trung gian.";

function legacyGeneralInfoToTree(source: string): TreeDoc {
  const paragraphs: BlockNode[] = (source || DEFAULT_GENERAL_INFO)
    .replace(/^\\textit\{([\s\S]*)\}$/, "$1")
    .split(/\n+/)
    .filter((line) => line.trim())
    .map((line) => {
      const content: InlineNode[] = [];
      line
        .split(/(\$[^$]+\$)/g)
        .filter(Boolean)
        .forEach((part) => {
          if (part.startsWith("$") && part.endsWith("$")) {
            content.push({ type: "math", tex: part.slice(1, -1) });
          } else {
            content.push({ type: "text", text: part, marks: ["italic"] });
          }
        });
      return { type: "paragraph", content };
    });
  return { type: "doc", content: paragraphs };
}

function inlineToLatex(
  nodes: Array<InlineNode | TableNode | CodeBlockNode>,
): string {
  return (nodes || [])
    .map((node) => {
      if (node.type === "math") return `$${node.tex}$`;
      if (node.type === "math_block") return `\\[${node.tex}\\]`;
      if (node.type === "hard_break") return "\\\\\n";
      if (node.type === "image_inline") return "";
      if (node.type === "code_block")
        return `\\begin{verbatim}\n${node.text}\n\\end{verbatim}`;
      if (node.type === "table") return blocksToLatex([node]);
      let text = node.text.replace(/([%&#_{}])/g, "\\$1").replace(/\$/g, "\\$");
      (node.marks || []).forEach((mark) => {
        if (mark === "highlight") return;
        const command =
          mark === "bold"
            ? "textbf"
            : mark === "italic"
              ? "textit"
              : "underline";
        text = `\\${command}{${text}}`;
      });
      return text;
    })
    .join("");
}

function blocksToLatex(blocks: BlockNode[]): string {
  return (blocks || [])
    .map((block) => {
      if (block.type === "paragraph") return inlineToLatex(block.content);
      if (block.type === "math_block") return `\\[${block.tex}\\]`;
      if (block.type === "list") {
        const env = block.ordered ? "enumerate" : "itemize";
        const items = block.items
          .map((item) => `\\item ${blocksToLatex(item)}`)
          .join("\n");
        return `\\begin{${env}}\n${items}\n\\end{${env}}`;
      }
      if (block.type === "table") {
        const cols = Math.max(1, ...block.rows.map((row) => row.length));
        const rows = block.rows
          .map(
            (row) =>
              row.map((cell) => inlineToLatex(cell.content)).join(" & ") +
              " \\\\",
          )
          .join("\n\\hline\n");
        return `\\begin{tabular}{|${"c|".repeat(cols)}}\\hline\n${rows}\n\\hline\\end{tabular}`;
      }
      if (block.type === "code_block")
        return `\\begin{verbatim}\n${block.text}\n\\end{verbatim}`;
      if (block.type === "columns")
        return block.columns
          .map((column) => blocksToLatex(column.content))
          .join("\n");
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function generalInfoToLatex(doc: TreeDoc): string {
  return blocksToLatex(doc.content);
}

function generalInfoToPreviewHtml(doc: TreeDoc): string {
  return treeToHtml(doc, {}, (tex, display) => {
    const tag = display ? "div" : "span";
    const cls = display ? "math display" : "math";
    return `<${tag} class="${cls}">${tex
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</${tag}>`;
  });
}

export default function ExportContestModal({
  contest,
  onClose,
}: {
  contest: ExportContest;
  onClose: () => void;
}) {
  const [examTitle, setExamTitle] = useState("");
  const [department, setDepartment] = useState("BỘ GIÁO DỤC VÀ ĐÀO TẠO");
  const [examType, setExamType] = useState("ĐỀ THI CHÍNH THỨC");
  const [subject, setSubject] = useState("TOÁN");
  const [duration, setDuration] = useState(50);
  const [enableGeneralInfo, setEnableGeneralInfo] = useState(false);
  const [generalInfo, setGeneralInfo] = useState<TreeDoc>(() =>
    legacyGeneralInfoToTree(DEFAULT_GENERAL_INFO),
  );
  const [exportFormats, setExportFormats] = useState({
    word: true,
    pdf: false,
    latex: false,
  });
  const [wordEquationFormat, setWordEquationFormat] =
    useState<WordEquationFormat>("omml");
  const [mathTypeCapability, setMathTypeCapability] = useState<{
    available: boolean;
    reason?: string | null;
  } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewCurrentPage, setPreviewCurrentPage] = useState(1);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [numShuffles, setNumShuffles] = useState(0);
  const [originalCode, setOriginalCode] = useState("000");
  // Kiểu đảo: 'order' (đảo Câu) | 'options' (đảo Đáp án) | 'both' (Câu + Đáp án). Mặc định 'both', KHÔNG lưu.
  const [shuffleMode, setShuffleMode] = useState<"order" | "options" | "both">(
    "both",
  );
  const [codeType, setCodeType] = useState("incremental"); // 'incremental' | 'random'
  const [startingCode, setStartingCode] = useState("0101");
  const [codeStep, setCodeStep] = useState(1);
  const [randomLength, setRandomLength] = useState(3);
  const [activeSection, setActiveSection] = useState<0 | 1>(0);

  const [exporting, setExporting] = useState(false);
  const [exportTask, setExportTask] = useState<{
    id: string;
    progress: number;
    total: number;
    message: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    // Load saved settings
    const saved = localStorage.getItem("export_modal_defaults");
    let restoreFrame: number | null = null;
    if (saved) {
      try {
        const parsed: Record<string, unknown> = JSON.parse(saved);
        restoreFrame = window.requestAnimationFrame(() => {
          if (typeof parsed.examTitle === "string") setExamTitle(parsed.examTitle);
          if (typeof parsed.originalCode === "string")
            setOriginalCode(parsed.originalCode || "000");
          if (typeof parsed.department === "string") setDepartment(parsed.department);
          if (typeof parsed.examType === "string") setExamType(parsed.examType);
          if (typeof parsed.subject === "string") setSubject(parsed.subject);
          if (typeof parsed.duration === "number") setDuration(parsed.duration);
          if (typeof parsed.enableGeneralInfo === "boolean")
            setEnableGeneralInfo(parsed.enableGeneralInfo);
          if (parsed.generalInfo) {
            setGeneralInfo(
              typeof parsed.generalInfo === "string"
                ? legacyGeneralInfoToTree(parsed.generalInfo)
                : (parsed.generalInfo as TreeDoc),
            );
          }
          if (parsed.exportFormats && typeof parsed.exportFormats === "object") {
            const formats = parsed.exportFormats as Record<string, unknown>;
            setExportFormats({
              word: !!formats.word,
              pdf: !!formats.pdf,
              latex: !!formats.latex,
            });
          }
          if (
            parsed.wordEquationFormat === "mathtype" ||
            parsed.wordEquationFormat === "omml"
          ) setWordEquationFormat(parsed.wordEquationFormat);
          if (typeof parsed.numShuffles === "number") setNumShuffles(parsed.numShuffles);
          if (typeof parsed.codeType === "string") setCodeType(parsed.codeType);
          if (typeof parsed.startingCode === "string") setStartingCode(parsed.startingCode);
          if (typeof parsed.codeStep === "number") setCodeStep(parsed.codeStep);
          if (typeof parsed.randomLength === "number") setRandomLength(parsed.randomLength);
        });
      } catch {
        localStorage.removeItem("export_modal_defaults");
      }
    }
    return () => {
      if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
    };
  }, []);

  useEffect(() => {
    api
      .getExportCapabilities()
      .then((result: unknown) => {
        const capabilities = result as {
          word?: { mathtype?: { available: boolean; reason?: string | null } };
        };
        setMathTypeCapability(capabilities.word?.mathtype || null);
      })
      .catch(() =>
        setMathTypeCapability({
          available: false,
          reason: "Không kiểm tra được MathType worker",
        }),
      );
  }, []);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewScrollCleanupRef = useRef<(() => void) | null>(null);
  const previewScrollFrameRef = useRef<number | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncPreviewPagePosition = useCallback(() => {
    const frame = iframeRef.current;
    const win = frame?.contentWindow;
    const doc = frame?.contentDocument;
    if (!win || !doc) return;
    const pages = Array.from(
      doc.querySelectorAll<HTMLElement>(".pagedjs_page"),
    );
    if (!pages.length) return;
    setPreviewPageCount(pages.length);
    const viewportCenter = win.innerHeight / 2;
    let closestPage = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    pages.forEach((page, index) => {
      const rect = page.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = index;
      }
    });
    setPreviewCurrentPage(closestPage + 1);
  }, []);

  const bindPreviewPageTracking = useCallback(() => {
    previewScrollCleanupRef.current?.();
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const handleScroll = () => {
      if (previewScrollFrameRef.current != null) return;
      previewScrollFrameRef.current = window.requestAnimationFrame(() => {
        previewScrollFrameRef.current = null;
        syncPreviewPagePosition();
      });
    };
    win.addEventListener("scroll", handleScroll, { passive: true });
    previewScrollCleanupRef.current = () =>
      win.removeEventListener("scroll", handleScroll);
    syncPreviewPagePosition();
  }, [syncPreviewPagePosition]);

  useEffect(
    () => () => {
      previewScrollCleanupRef.current?.();
      if (previewScrollFrameRef.current != null) {
        window.cancelAnimationFrame(previewScrollFrameRef.current);
      }
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );
  const previewRequestRef = useRef(0);
  const headerHeightRef = useRef("");
  const relayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewLayoutRevision, setPreviewLayoutRevision] = useState(0);
  const previewFieldsRef = useRef({
    examTitle,
    department,
    examType,
    subject,
    duration,
    originalCode,
    enableGeneralInfo,
    generalInfo,
  });
  useEffect(() => {
    previewFieldsRef.current = {
      examTitle,
      department,
      examType,
      subject,
      duration,
      originalCode,
      enableGeneralInfo,
      generalInfo,
    };
  }, [
    examTitle,
    department,
    examType,
    subject,
    duration,
    originalCode,
    enableGeneralInfo,
    generalInfo,
  ]);
  const [zoomLevel, setZoomLevel] = useState<number | "fit">("fit");
  const [zoomPercent, setZoomPercent] = useState(100);

  // Chỉ fetch khi mốc bố cục tăng. Các trường header được sửa DOM trước rồi
  // đo chiều cao thực tế; effect phía dưới chỉ tăng revision nếu cao độ khác
  // header của lượt Paged.js gần nhất. Vì vậy đổi chữ mà không xuống/thêm dòng
  // sẽ không reload iframe.
  useEffect(() => {
    const requestId = ++previewRequestRef.current;
    void (async () => {
      try {
        const fields = previewFieldsRef.current;
        const res = (await api.getContestPreviewHTML(contest.id, {
          exam_title: fields.examTitle,
          department: fields.department,
          exam_type: fields.examType,
          subject: fields.subject,
          duration: fields.duration,
          general_info: fields.enableGeneralInfo
            ? generalInfoToLatex(fields.generalInfo)
            : "",
          original_code: fields.originalCode.trim() || "000",
        })) as PreviewResponse;
        if (requestId === previewRequestRef.current) {
          setPreviewHtml(resolvePreviewFontUrls(res.html || ""));
          setPreviewError("");
        }
      } catch (err: unknown) {
        if (requestId !== previewRequestRef.current) return;
        const message = errorMessage(err, "");
        if (message !== "Request failed" && message !== "Not Found") {
          console.error("Failed to fetch preview", err);
        }
        setPreviewError(
          "Lỗi kết nối Server. Vui lòng kiểm tra dịch vụ Backend rồi thử lại.",
        );
      }
    })();
  }, [contest.id, previewLayoutRevision]);

  // Hàm cập nhật DOM trực tiếp để không phải tải lại toàn bộ iframe khi chỉ
  // sửa vài trường tiêu đề (không cần Paged.js chạy lại từ đầu)
  const currentHeaderHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return "";
    return Array.from(
      doc.querySelectorAll<HTMLElement>(".pagedjs_pages .exam-header"),
    )
      .filter((header) => header.offsetHeight > 0)
      .map((header) => header.offsetHeight)
      .join(",");
  }, []);

  const syncPreviewDOM = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const updateText = (id: string, text: string) => {
      doc.querySelectorAll<HTMLElement>(`[id="${id}"]`).forEach((el) => {
        el.textContent = text;
      });
    };
    updateText("preview-department", department || "BỘ GIÁO DỤC VÀ ĐÀO TẠO");
    updateText(
      "preview-answer-department",
      department || "BỘ GIÁO DỤC VÀ ĐÀO TẠO",
    );
    updateText("preview-exam-type", examType || "ĐỀ THI CHÍNH THỨC");
    updateText("preview-answer-exam-type", examType || "ĐỀ THI CHÍNH THỨC");
    updateText("preview-exam-title", examTitle || contest.title);
    updateText("preview-answer-exam-title", examTitle || contest.title);
    updateText("preview-subject", subject || "...");
    updateText("preview-answer-subject", subject || "...");
    updateText("preview-duration", (duration || 50).toString());
    updateText("preview-answer-duration", (duration || 50).toString());
    updateText("preview-code", originalCode.trim() || "000");
    updateText("preview-answer-code", originalCode.trim() || "000");
  }, [contest.title, department, duration, examTitle, examType, originalCode, subject]);

  const scheduleRelayoutIfHeaderHeightChanged = useCallback(() => {
    const current = currentHeaderHeight();
    if (!current || !headerHeightRef.current) return;
    if (relayoutTimerRef.current) {
      clearTimeout(relayoutTimerRef.current);
      relayoutTimerRef.current = null;
    }
    if (current !== headerHeightRef.current) {
      relayoutTimerRef.current = setTimeout(() => {
        setPreviewLayoutRevision((revision) => revision + 1);
        relayoutTimerRef.current = null;
      }, 500);
    }
  }, [currentHeaderHeight]);

  const applyZoom = useCallback((zoom: number | "fit") => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    const doc = iframeRef.current.contentWindow.document;
    const pages = doc.querySelector(".pagedjs_pages") as HTMLElement;
    if (pages) {
      doc.documentElement.style.overflowX = "auto";
      doc.body.style.margin = "0";
      doc.body.style.padding = "0";
      doc.body.style.overflowX = "auto";

      const A4_WIDTH = 794;
      let scale = typeof zoom === "number" ? zoom : 1;

      if (zoom === "fit") {
        const iframeWidth = iframeRef.current.clientWidth;
        scale = Math.min((iframeWidth - 16) / A4_WIDTH, 1);
      }
      setZoomPercent(Math.round(scale * 100));

      const scaledPageWidth = A4_WIDTH * scale;
      const needsHorizontalScroll =
        scaledPageWidth > iframeRef.current.clientWidth;
      doc.body.style.minWidth = needsHorizontalScroll
        ? `${Math.ceil(scaledPageWidth)}px`
        : "";
      pages.style.width = `${A4_WIDTH}px`;
      pages.style.setProperty(
        "align-items",
        needsHorizontalScroll ? "flex-start" : "center",
        "important",
      );
      pages.style.marginLeft = needsHorizontalScroll ? "0" : "auto";
      pages.style.marginRight = needsHorizontalScroll ? "0" : "auto";

      // CSS zoom (không phải transform: scale) — thu nhỏ cả không gian layout
      // nên scrollbar tự động scale theo, kết hợp pagedjs_pages có display:flex
      // + align-items:center nên tự CĂN GIỮA TUYỆT ĐỐI.
      pages.style.zoom = scale.toString();
      pages.style.transform = "none";
    }
  }, []);

  useEffect(() => {
    applyZoom(zoomLevel);
  }, [applyZoom, zoomLevel]);

  // Nhận thông báo khi PagedJS render xong (bao gồm cả sau lượt reload dò-sửa
  // mồ côi, xem đoạn script nhúng trong preview.py) để apply zoom
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "PAGEDJS_READY") {
        // Mốc của đúng lượt vừa phân trang, trước khi chép các ký tự người
        // dùng có thể đã gõ trong lúc request/Paged.js đang chạy.
        headerHeightRef.current = currentHeaderHeight();
        syncPreviewDOM();
        requestAnimationFrame(scheduleRelayoutIfHeaderHeightChanged);
        applyZoom(zoomLevel);
        requestAnimationFrame(bindPreviewPageTracking);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    applyZoom,
    bindPreviewPageTracking,
    currentHeaderHeight,
    scheduleRelayoutIfHeaderHeightChanged,
    syncPreviewDOM,
    zoomLevel,
  ]);

  // Cập nhật lại scale khi kích thước cửa sổ thay đổi nếu đang ở chế độ 'fit'
  useEffect(() => {
    const handleResize = () => {
      if (zoomLevel === "fit") {
        applyZoom("fit");
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [applyZoom, zoomLevel]);

  useEffect(() => {
    syncPreviewDOM();
    requestAnimationFrame(scheduleRelayoutIfHeaderHeightChanged);
  }, [scheduleRelayoutIfHeaderHeightChanged, syncPreviewDOM]);

  // Đồng bộ Thông tin chung trực tiếp vào các trang đã dựng, rồi chỉ chạy lại
  // Paged.js khi chiều cao thực sự thay đổi. Trước đây mọi TreeDoc object mới
  // đều tăng revision dù nội dung vẫn chiếm đúng số dòng cũ.
  const generalLayoutFirst = useRef(true);
  const previousGeneralEnabledRef = useRef(enableGeneralInfo);
  const generalSyncRevisionRef = useRef(0);
  useEffect(() => {
    if (generalLayoutFirst.current) {
      generalLayoutFirst.current = false;
      previousGeneralEnabledRef.current = enableGeneralInfo;
      return;
    }
    if (relayoutTimerRef.current) clearTimeout(relayoutTimerRef.current);
    const enabledChanged =
      previousGeneralEnabledRef.current !== enableGeneralInfo;
    previousGeneralEnabledRef.current = enableGeneralInfo;
    const syncRevision = ++generalSyncRevisionRef.current;

    // Bật/tắt làm xuất hiện hoặc loại bỏ cả block, bắt buộc phân trang lại.
    if (enabledChanged) {
      relayoutTimerRef.current = setTimeout(() => {
        setPreviewLayoutRevision((revision) => revision + 1);
        relayoutTimerRef.current = null;
      }, 500);
    } else if (enableGeneralInfo) {
      const doc = iframeRef.current?.contentDocument;
      const win = iframeRef.current?.contentWindow as
        | (Window & {
            temml?: {
              render: (tex: string, el: Element, options?: object) => void;
            };
          })
        | null;
      const elements = Array.from(
        doc?.querySelectorAll<HTMLElement>("#preview-general-info") || [],
      ).filter((element) => element.offsetHeight > 0);

      if (!elements.length) {
        relayoutTimerRef.current = setTimeout(() => {
          setPreviewLayoutRevision((revision) => revision + 1);
          relayoutTimerRef.current = null;
        }, 500);
      } else {
        const beforeHeight = elements
          .map((element) => element.offsetHeight)
          .join(",");
        const html = generalInfoToPreviewHtml(generalInfo);
        elements.forEach((element) => {
          element.innerHTML = html;
          element.querySelectorAll<HTMLElement>(".math").forEach((math) => {
            // Khớp tuyệt đối với script render ban đầu trong preview.py.
            // Thiếu displaystyle làm hộp MathML có metrics/baseline khác và
            // công thức inline nhìn như bị tụt xuống so với chữ thường.
            const tex = `\\displaystyle ${math.textContent || ""}`;
            try {
              win?.temml?.render(tex, math, {
                displayMode: math.classList.contains("display"),
                throwOnError: false,
                macros: {
                  "\\hoac": "\\left[\\begin{aligned}#1\\end{aligned}\\right.",
                  "\\heva": "\\left\\{\\begin{aligned}#1\\end{aligned}\\right.",
                },
              });
            } catch {
              /* Giữ nguyên TeX nếu Temml chưa sẵn sàng. */
            }
          });
        });

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (syncRevision !== generalSyncRevisionRef.current) return;
            const afterHeight = elements
              .map((element) => element.offsetHeight)
              .join(",");
            if (afterHeight !== beforeHeight) {
              relayoutTimerRef.current = setTimeout(() => {
                setPreviewLayoutRevision((revision) => revision + 1);
                relayoutTimerRef.current = null;
              }, 500);
            }
          });
        });
      }
    }
    return () => {
      if (relayoutTimerRef.current) {
        clearTimeout(relayoutTimerRef.current);
        relayoutTimerRef.current = null;
      }
    };
  }, [enableGeneralInfo, generalInfo]);

  // Lưu chỉnh sửa "Thông tin chung" cuối của người dùng ngay khi sửa (không cần xuất đề)
  const giFirst = useRef(true);
  useEffect(() => {
    if (giFirst.current) {
      giFirst.current = false;
      return;
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem("export_modal_defaults") || "{}",
      );
      saved.generalInfo = generalInfo;
      localStorage.setItem("export_modal_defaults", JSON.stringify(saved));
    } catch {
      /* bỏ qua */
    }
  }, [generalInfo]);

  const handleExport = async () => {
    setExporting(true);

    // Save to localStorage
    const toSave = {
      examTitle,
      originalCode: originalCode.trim() || "000",
      department,
      examType,
      subject,
      duration,
      enableGeneralInfo,
      generalInfo,
      exportFormats,
      wordEquationFormat,
      numShuffles,
      codeType,
      startingCode,
      codeStep,
      randomLength,
    };
    localStorage.setItem("export_modal_defaults", JSON.stringify(toSave));

    try {
      const formats = (
        Object.keys(exportFormats) as Array<keyof typeof exportFormats>
      ).filter((format) => exportFormats[format]);
      // Word dùng đúng kết quả 4/2/1 mà preview đã đo theo bề rộng render
      // thực tế (gồm cả công thức), thay vì tự ước lượng lại bằng số ký tự.
      const wordOptionLayouts: Record<string, number> = {};
      if (formats.includes("word")) {
        const previewDoc = iframeRef.current?.contentDocument;
        previewDoc
          ?.querySelectorAll<HTMLElement>(
            ".options.cols-1, .options.cols-2, .options.cols-4",
          )
          .forEach((grid) => {
            const question = grid.closest<HTMLElement>(".question[id]");
            const match = question?.id.match(/^q-(\d+)$/);
            const cols = grid.classList.contains("cols-4")
              ? 4
              : grid.classList.contains("cols-2")
                ? 2
                : 1;
            if (match) wordOptionLayouts[match[1]] = cols;
          });
      }
      const res = (await api.exportContest(contest.id, {
        formats,
        word_equation_format: wordEquationFormat,
        num_shuffles: numShuffles,
        shuffle_mode: shuffleMode,
        exam_title: toSave.examTitle,
        original_code: toSave.originalCode,
        department: toSave.department,
        exam_type: toSave.examType,
        subject: toSave.subject,
        duration: toSave.duration,
        general_info: enableGeneralInfo ? generalInfoToLatex(generalInfo) : "",
        code_type: codeType,
        starting_code: startingCode,
        code_step: codeStep,
        random_length: randomLength,
        word_option_layouts: wordOptionLayouts,
      })) as ExportResponse;

      const taskId = res.task_id;
      setExportTask({
        id: taskId,
        progress: 0,
        total: 1,
        message: "Đang xếp hàng chờ...",
        status: "pending",
      });

      // Bắt đầu Polling
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = (await api.getExportStatus(
            taskId,
          )) as ExportStatusResponse;
          setExportTask({
            id: taskId,
            progress: statusRes.progress || 0,
            total: statusRes.total || 1,
            message: statusRes.message || "",
            status: statusRes.status,
          });

          if (statusRes.status === "completed") {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            // Endpoint tải xuống có kiểm tra đúng giáo viên tạo task, vì vậy
            // phải tải bằng fetch có Bearer token thay vì đổi window.location.
            const blob = await api.downloadExport(taskId);
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = `${contest.title || "Export"}.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(objectUrl);
            closeTimerRef.current = setTimeout(() => {
              onClose();
              setExportTask(null);
              setExporting(false);
              closeTimerRef.current = null;
            }, 1000);
          } else if (statusRes.status === "error") {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            toast.error("Lỗi xuất đề thi: " + statusRes.message);
            setExportTask(null);
            setExporting(false);
          }
        } catch (error: unknown) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          toast.error(
            "Lỗi khi lấy trạng thái: " +
              errorMessage(error, "Không xác định"),
          );
          setExportTask(null);
          setExporting(false);
        }
      }, 2000);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Lỗi khi yêu cầu xuất đề thi"));
      setExporting(false);
    }
  };

  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal ui-modal--large">
        <div className="ui-modal__header">
          <h3 className="ui-modal__title">Xuất đề thi: {contest.title}</h3>
          <button
            className="ui-modal__close"
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={exporting}
          >
            <Icon name="close" />
          </button>
        </div>

        {exportTask ? (
          <div className="export-contest-modal__progress">
            <Spinner size="large" />
            <h3 className="export-contest-modal__progress-title">
              Đang tạo đề thi... Vui lòng không đóng cửa sổ
            </h3>
            <ProgressBar
              className="export-contest-modal__progress-track"
              value={Math.max(0, exportTask.progress)}
              max={Math.max(1, exportTask.total)}
              label="Tiến độ tạo đề thi"
            />
            <div className="export-contest-modal__progress-message">
              {exportTask.message}
            </div>
          </div>
        ) : (
          <div className="export-contest-modal__workspace">
            <nav className="ui-tablist ui-tablist--vertical export-contest-modal__navigation" role="tablist" aria-label="Nhóm cấu hình xuất đề">
              <button className="ui-tab" role="tab" type="button" aria-selected={activeSection === 0} onClick={() => setActiveSection(0)}><Icon name="edit" />Thông tin đề thi</button>
              <button className="ui-tab" role="tab" type="button" aria-selected={activeSection === 1} onClick={() => setActiveSection(1)}><Icon name="export" />Định dạng &amp; mã đề</button>
            </nav>

            <div className="export-contest-modal__settings export-contest-modal__settings--organized">
              {activeSection === 0 ? <>
                <section className="export-contest-modal__panel">
                  <div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title export-contest-modal__title-with-icon"><Icon name="edit" />Thông tin đề thi</strong></div>
                  <label className="ui-field"><span className="ui-field__label">Đơn vị</span><span className="ui-input ui-input--medium"><input className="ui-input__control" value={department} onChange={(event) => setDepartment(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: BỘ GIÁO DỤC VÀ ĐÀO TẠO</span></label>
                  <label className="ui-field"><span className="ui-field__label">Loại đề</span><span className="ui-input ui-input--medium"><input className="ui-input__control" value={examType} onChange={(event) => setExamType(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: ĐỀ THI CHÍNH THỨC</span></label>
                  <label className="ui-field"><span className="ui-field__label">Tên kỳ thi</span><span className="ui-input ui-input--medium"><input className="ui-input__control" placeholder="Để trống nếu không hiển thị" value={examTitle} onChange={(event) => setExamTitle(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: KỲ THI TỐT NGHIỆP THPT</span></label>
                  <div className="export-contest-modal__basic-grid"><label className="ui-field"><span className="ui-field__label">Môn thi</span><span className="ui-input ui-input--medium"><input className="ui-input__control" value={subject} onChange={(event) => setSubject(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: TOÁN</span></label><label className="ui-field"><span className="ui-field__label">Thời gian làm bài</span><span className="ui-input ui-input--medium"><NumberInput className="ui-input__control export-contest-modal__duration-input" min={1} value={duration} onChange={setDuration} /></span><span className="ui-field__hint">Đơn vị: phút</span></label></div>
                </section>
                <section className="export-contest-modal__panel">
                  <div className="export-contest-modal__panel-header"><Checkbox checked={enableGeneralInfo} onChange={(event) => setEnableGeneralInfo(event.target.checked)} label={<strong className="export-contest-modal__title-with-icon"><Icon name="info" />Thông tin chung (Ghi chú)</strong>} /></div>
                  {enableGeneralInfo ? <div className="export-contest-modal__editor-frame"><RichLatexEditor content={generalInfo} onChange={setGeneralInfo} placeholder="Nhập thông tin chung..." minHeight="80px" maxHeight="220px" /></div> : <span className="ui-field__hint">Bật để thêm công thức, dữ kiện hoặc lưu ý chung vào đầu đề thi.</span>}
                </section>
              </> : <>
                <section className="export-contest-modal__panel">
                  <div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title export-contest-modal__title-with-icon"><Icon name="export" />Định dạng xuất</strong></div>
                  <div className="export-contest-modal__choice-row">
                    <Checkbox checked={exportFormats.word} onChange={(event) => setExportFormats((value) => ({ ...value, word: event.target.checked }))} label={<span className="export-contest-modal__format-label"><Icon name="file-docx" />Word</span>} />
                    <Checkbox checked={exportFormats.pdf} onChange={(event) => setExportFormats((value) => ({ ...value, pdf: event.target.checked }))} label={<span className="export-contest-modal__format-label"><Icon name="file-pdf" />PDF</span>} />
                    <Checkbox checked={exportFormats.latex} onChange={(event) => setExportFormats((value) => ({ ...value, latex: event.target.checked }))} label={<span className="export-contest-modal__format-label"><Icon name="file-tex" />LaTeX</span>} />
                  </div>
                  {exportFormats.word ? <fieldset className="export-contest-modal__group"><legend>Công thức trong Word</legend><Radio name="word-equation-format" checked={wordEquationFormat === "omml"} onChange={() => setWordEquationFormat("omml")} label="Word Equation (OMML)" /><Radio name="word-equation-format" checked={wordEquationFormat === "mathtype"} onChange={() => setWordEquationFormat("mathtype")} label="MathType 7 (OLE có thể chỉnh sửa)" />{wordEquationFormat === "mathtype" && mathTypeCapability?.available === false ? <small className="export-contest-modal__warning">{mathTypeCapability?.reason || "MathType worker chưa sẵn sàng"}. Hệ thống sẽ giữ công thức OMML nếu worker không hoạt động.</small> : null}</fieldset> : null}
                </section>
                <section className="export-contest-modal__panel">
                  <div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title export-contest-modal__title-with-icon"><Icon name="exam-paper" />Mã đề</strong></div>
                  <div className="export-contest-modal__basic-grid"><label className="ui-field"><span className="ui-field__label">Mã đề gốc</span><span className="ui-input ui-input--medium"><input className="ui-input__control" maxLength={32} value={originalCode} onChange={(event) => setOriginalCode(event.target.value)} /></span><span className="ui-field__hint">Mặc định: 000</span></label><label className="ui-field"><span className="ui-field__label">Số đề đảo</span><span className="ui-input ui-input--medium"><NumberInput className="ui-input__control" min={0} value={numShuffles} onChange={setNumShuffles} /></span><span className="ui-field__hint">Nhập 0 nếu chỉ xuất đề gốc</span></label></div>
                  <fieldset className="export-contest-modal__group"><legend>Kiểu sinh mã</legend><div className={`export-contest-modal__option ${codeType === "incremental" ? "export-contest-modal__option--selected" : ""}`} onClick={() => setCodeType("incremental")}><Radio name="code-type" checked={codeType === "incremental"} onChange={() => setCodeType("incremental")} label="Tăng dần" /><div className="export-contest-modal__option-controls"><span>Từ</span><input className="ui-input-native export-contest-modal__compact-input--narrow" value={startingCode} onChange={(event) => setStartingCode(event.target.value)} disabled={codeType !== "incremental"} /><span>Bước</span><NumberInput className="ui-input-native export-contest-modal__compact-input--narrow" min={1} value={codeStep} onChange={setCodeStep} disabled={codeType !== "incremental"} /></div></div><div className={`export-contest-modal__option ${codeType === "random" ? "export-contest-modal__option--selected" : ""}`} onClick={() => setCodeType("random")}><Radio name="code-type" checked={codeType === "random"} onChange={() => setCodeType("random")} label="Ngẫu nhiên" /><div className="export-contest-modal__option-controls"><span>Số chữ số</span><NumberInput className="ui-input-native export-contest-modal__compact-input--narrow" min={1} max={6} value={randomLength} onChange={setRandomLength} disabled={codeType !== "random"} /></div></div></fieldset>
                </section>
                <section className="export-contest-modal__panel"><div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title export-contest-modal__title-with-icon"><Icon name="rotate-cw" />Kiểu đảo</strong></div><div className="ui-segmented export-contest-modal__segmented export-contest-modal__shuffle-mode" role="group" aria-label="Kiểu đảo">{([['both', 'Câu + đáp án'], ['order', 'Câu'], ['options', 'Đáp án']] as const).map(([value, label]) => <button className="ui-segmented__item" type="button" aria-pressed={shuffleMode === value} onClick={() => setShuffleMode(value)} key={value}>{label}</button>)}</div><span className="ui-field__hint">Áp dụng cho các đề đảo, không thay đổi đề gốc.</span></section>
              </>}
            </div>

            {/* CỘT PHẢI: PREVIEW THÔNG QUA IFRAME (Paged.js, client-side) */}
            <div className="export-contest-modal__preview">
              <div className="export-contest-modal__preview-header">
                <h4 className="export-contest-modal__preview-title">
                  Xem trước đề thi
                </h4>
                <nav className="ui-ribbon export-contest-modal__preview-ribbon" aria-label="Công cụ xem trước đề thi"><RibbonScroller ariaLabel="Công cụ xem trước đề thi">
                  <div className="ui-ribbon__tool-group"><span className="export-contest-modal__page-count">Trang {previewCurrentPage} / {previewPageCount}</span></div>
                  <div className="ui-ribbon__tool-group"><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="In đề thi" title="In đề thi" disabled={!previewHtml} onClick={() => iframeRef.current?.contentWindow?.print()}><Icon name="printer" /></button></div>
                  <div className="ui-ribbon__tool-group"><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Vừa trang" title="Vừa trang" aria-pressed={zoomLevel === "fit"} onClick={() => setZoomLevel("fit")}><Icon name="fit-page" /></button></div>
                  <div className="ui-ribbon__tool-group"><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Thu nhỏ" title="Thu nhỏ" onClick={() => setZoomLevel((previous) => previous === "fit" ? Math.max(0.4, zoomPercent / 100 - 0.01) : Math.max(0.4, previous - 0.01))}><Icon name="minus" /></button><span className="ui-input ui-input--small"><NumberInput className="ui-input__control export-contest-modal__zoom-input" min={40} max={250} value={zoomPercent} onFocus={(event) => event.currentTarget.select()} onChange={(value) => { setZoomPercent(value); setZoomLevel(Math.min(2.5, Math.max(0.01, value / 100))); }} onBlur={() => { const value = Math.min(250, Math.max(40, zoomPercent)); setZoomPercent(value); setZoomLevel(value / 100); }} aria-label="Tỉ lệ xem trước" /></span><span className="export-contest-modal__zoom-unit">%</span><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Phóng to" title="Phóng to" onClick={() => setZoomLevel((previous) => previous === "fit" ? Math.min(2.5, zoomPercent / 100 + 0.01) : Math.min(2.5, previous + 0.01))}><Icon name="plus" /></button></div>
                </RibbonScroller></nav>
              </div>

              <div className="export-contest-modal__preview-frame">
                {previewError ? (
                  <MessageBar
                    intent="error"
                    actionLabel="Thử lại"
                    onAction={() => {
                      setPreviewError(null);
                      setPreviewLayoutRevision((revision) => revision + 1);
                    }}
                    onDismiss={() => setPreviewError("")}
                  >
                    {previewError}
                  </MessageBar>
                ) : previewHtml ? (
                  <iframe
                    ref={iframeRef}
                    onLoad={() => {
                      syncPreviewDOM();
                      bindPreviewPageTracking();
                    }}
                    srcDoc={previewHtml}
                    title="Preview"
                  />
                ) : previewError === null ? (
                  <div className="export-contest-modal__empty-preview">
                    <Spinner label="Đang tạo xem trước …" />
                  </div>
                ) : (
                  <div className="export-contest-modal__empty-preview">
                    Không có bản xem trước.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="ui-modal__footer export-contest-modal__footer">
          <div className="export-contest-modal__tip">
            <strong>Mẹo:</strong> Đối với file Word, do đặc thù tự động dàn
            trang, vui lòng nhấn tổ hợp <kbd>Ctrl</kbd> + <kbd>P</kbd> rồi nhấn{" "}
            <kbd>ESC</kbd> khi mở file để hệ thống tự động tính và cập nhật đúng
            tổng số trang vào phần &quot;Đề thi có ... trang&quot;.
          </div>
          <div className="export-contest-modal__actions">
            <button
              className="ui-button ui-button--secondary"
              onClick={onClose}
              disabled={exporting}
            >
              <Icon name="close" />Hủy
            </button>
            <button
              className="ui-button ui-button--primary"
              onClick={handleExport}
              disabled={exporting}
            >
              <Icon name="export" />{exporting ? "Đang xử lý..." : "Xuất đề thi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
