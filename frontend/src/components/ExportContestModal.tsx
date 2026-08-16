"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import LatexRenderer from "@/components/LatexRenderer";
import NumberInput from "@/components/NumberInput";
import RichLatexEditor from "@/components/RichLatexEditor";
import { BlockNode, InlineNode, TreeDoc, treeToHtml } from "@/lib/docTree";
import { toast } from "@/lib/toastStore";

type ExportContest = { id: number; title: string };
type WordEquationFormat = "omml" | "mathtype";

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
      line.split(/(\$[^$]+\$)/g).filter(Boolean).forEach((part) => {
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

function inlineToLatex(nodes: InlineNode[]): string {
  return (nodes || []).map((node) => {
    if (node.type === "math") return `$${node.tex}$`;
    if (node.type === "hard_break") return "\\\\\n";
    if (node.type === "image_inline") return "";
    let text = node.text
      .replace(/([%&#_{}])/g, "\\$1")
      .replace(/\$/g, "\\$");
    (node.marks || []).forEach((mark) => {
      if (mark === "highlight") return;
      const command = mark === "bold" ? "textbf" : mark === "italic" ? "textit" : "underline";
      text = `\\${command}{${text}}`;
    });
    return text;
  }).join("");
}

function blocksToLatex(blocks: BlockNode[]): string {
  return (blocks || []).map((block) => {
    if (block.type === "paragraph") return inlineToLatex(block.content);
    if (block.type === "math_block") return `\\[${block.tex}\\]`;
    if (block.type === "list") {
      const env = block.ordered ? "enumerate" : "itemize";
      const items = block.items.map((item) => `\\item ${blocksToLatex(item)}`).join("\n");
      return `\\begin{${env}}\n${items}\n\\end{${env}}`;
    }
    if (block.type === "table") {
      const cols = Math.max(1, ...block.rows.map((row) => row.length));
      const rows = block.rows.map((row) => row.map((cell) => inlineToLatex(cell.content)).join(" & ") + " \\\\").join("\n\\hline\n");
      return `\\begin{tabular}{|${"c|".repeat(cols)}}\\hline\n${rows}\n\\hline\\end{tabular}`;
    }
    if (block.type === "code_block") return `\\begin{verbatim}\n${block.text}\n\\end{verbatim}`;
    if (block.type === "columns") return block.columns.map((column) => blocksToLatex(column.content)).join("\n");
    return "";
  }).filter(Boolean).join("\n\n");
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
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.examTitle === "string")
          setExamTitle(parsed.examTitle);
        if (typeof parsed.originalCode === "string")
          setOriginalCode(parsed.originalCode || "000");
        if (parsed.department) setDepartment(parsed.department);
        if (parsed.examType) setExamType(parsed.examType);
        if (parsed.subject) setSubject(parsed.subject);
        if (typeof parsed.duration === "number") setDuration(parsed.duration);
        if (typeof parsed.enableGeneralInfo === "boolean")
          setEnableGeneralInfo(parsed.enableGeneralInfo);
        if (parsed.generalInfo) {
          setGeneralInfo(
            typeof parsed.generalInfo === "string"
              ? legacyGeneralInfoToTree(parsed.generalInfo)
              : parsed.generalInfo,
          );
        }
        if (parsed.exportFormats) {
          setExportFormats({
            word: !!parsed.exportFormats.word,
            pdf: !!parsed.exportFormats.pdf,
            latex: !!parsed.exportFormats.latex,
          });
        }
        if (parsed.wordEquationFormat === "mathtype" || parsed.wordEquationFormat === "omml") {
          setWordEquationFormat(parsed.wordEquationFormat);
        }
        if (typeof parsed.numShuffles === "number")
          setNumShuffles(parsed.numShuffles);
        if (parsed.codeType) setCodeType(parsed.codeType);
        if (parsed.startingCode) setStartingCode(parsed.startingCode);
        if (typeof parsed.codeStep === "number") setCodeStep(parsed.codeStep);
        if (typeof parsed.randomLength === "number")
          setRandomLength(parsed.randomLength);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    api.getExportCapabilities()
      .then((result: unknown) => {
        const capabilities = result as {
          word?: { mathtype?: { available: boolean; reason?: string | null } };
        };
        setMathTypeCapability(capabilities.word?.mathtype || null);
      })
      .catch(() => setMathTypeCapability({ available: false, reason: "Không kiểm tra được MathType worker" }));
  }, []);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewRequestRef = useRef(0);
  const headerHeightRef = useRef("");
  const relayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewLayoutRevision, setPreviewLayoutRevision] = useState(0);
  const previewFieldsRef = useRef({
    examTitle, department, examType, subject, duration, originalCode,
    enableGeneralInfo, generalInfo,
  });
  previewFieldsRef.current = {
    examTitle, department, examType, subject, duration, originalCode,
    enableGeneralInfo, generalInfo,
  };
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
        })) as any;
        if (requestId === previewRequestRef.current) {
          setPreviewHtml(resolvePreviewFontUrls(res.html || ""));
        }
      } catch (err: any) {
        if (requestId !== previewRequestRef.current) return;
        if (err.message !== "Request failed" && err.message !== "Not Found") {
          console.error("Failed to fetch preview", err);
          toast.error("Lỗi kết nối Server khi tải bản xem trước.");
        }
        setPreviewHtml(
          '<div style="text-align: center; color: red; margin-top: 2rem;">Lỗi kết nối Server. Vui lòng khởi động lại Terminal chạy Backend (python).</div>',
        );
      }
    })();
  }, [contest.id, previewLayoutRevision]);

  // Hàm cập nhật DOM trực tiếp để không phải tải lại toàn bộ iframe khi chỉ
  // sửa vài trường tiêu đề (không cần Paged.js chạy lại từ đầu)
  const currentHeaderHeight = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return "";
    return Array.from(
      doc.querySelectorAll<HTMLElement>(".pagedjs_pages .exam-header"),
    )
      .filter((header) => header.offsetHeight > 0)
      .map((header) => header.offsetHeight)
      .join(",");
  };

  const syncPreviewDOM = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const updateText = (id: string, text: string) => {
      doc.querySelectorAll<HTMLElement>(`[id="${id}"]`).forEach((el) => {
        el.textContent = text;
      });
    };
    updateText("preview-department", department || "BỘ GIÁO DỤC VÀ ĐÀO TẠO");
    updateText("preview-answer-department", department || "BỘ GIÁO DỤC VÀ ĐÀO TẠO");
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
  };

  const scheduleRelayoutIfHeaderHeightChanged = () => {
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
  };

  const applyZoom = (zoom: number | "fit") => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    const doc = iframeRef.current.contentWindow.document;
    const pages = doc.querySelector(".pagedjs_pages") as HTMLElement;
    if (pages) {
      doc.body.style.margin = "0";
      doc.body.style.padding = "0";

      const A4_WIDTH = 794;
      let scale = typeof zoom === "number" ? zoom : 1;

      if (zoom === "fit") {
        const iframeWidth = iframeRef.current.clientWidth;
        scale = Math.min((iframeWidth - 16) / A4_WIDTH, 1);
      }
      setZoomPercent(Math.round(scale * 100));

      // CSS zoom (không phải transform: scale) — thu nhỏ cả không gian layout
      // nên scrollbar tự động scale theo, kết hợp pagedjs_pages có display:flex
      // + align-items:center nên tự CĂN GIỮA TUYỆT ĐỐI.
      (pages.style as any).zoom = scale.toString();
      pages.style.transform = "none";
      pages.style.marginLeft = "auto";
      pages.style.marginRight = "auto";
    }
  };

  useEffect(() => {
    applyZoom(zoomLevel);
  }, [zoomLevel]);

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
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    zoomLevel,
    examTitle,
    department,
    examType,
    subject,
    duration,
    originalCode,
    contest.title,
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
  }, [zoomLevel]);

  useEffect(() => {
    syncPreviewDOM();
    requestAnimationFrame(scheduleRelayoutIfHeaderHeightChanged);
  }, [examTitle, department, examType, subject, duration, originalCode, contest.title]);

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
    const enabledChanged = previousGeneralEnabledRef.current !== enableGeneralInfo;
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
        | (Window & { temml?: { render: (tex: string, el: Element, options?: object) => void } })
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
        const beforeHeight = elements.map((element) => element.offsetHeight).join(",");
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
      const formats = Object.keys(exportFormats).filter(
        (k) => (exportFormats as any)[k],
      );
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
      const res = await api.exportContest(contest.id, {
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
      });

      const taskId = res.task_id;
      setExportTask({
        id: taskId,
        progress: 0,
        total: 1,
        message: "Đang xếp hàng chờ...",
        status: "pending",
      });

      // Bắt đầu Polling
      const interval = setInterval(async () => {
        try {
          const statusRes = (await api.getExportStatus(taskId)) as any;
          setExportTask({
            id: taskId,
            progress: statusRes.progress || 0,
            total: statusRes.total || 1,
            message: statusRes.message || "",
            status: statusRes.status,
          });

          if (statusRes.status === "completed") {
            clearInterval(interval);
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
            setTimeout(() => {
              onClose();
              setExportTask(null);
              setExporting(false);
            }, 1000);
          } else if (statusRes.status === "error") {
            clearInterval(interval);
            toast.error("Lỗi xuất đề thi: " + statusRes.message);
            setExportTask(null);
            setExporting(false);
          }
        } catch (e: any) {
          clearInterval(interval);
          toast.error("Lỗi khi lấy trạng thái: " + e.message);
          setExportTask(null);
          setExporting(false);
        }
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi yêu cầu xuất đề thi");
      setExporting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-wide-responsive"
        style={{
          maxWidth: "1400px",
          width: "95vw",
          maxHeight: "95vh",
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="modal-header"
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "1rem 1.5rem",
            background: "var(--bg-surface)",
          }}
        >
          <h3
            className="modal-title"
            style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, margin: 0 }}
          >
            Xuất đề thi: {contest.title}
          </h3>
        </div>

        {exportTask ? (
          <div
            style={{
              padding: "4rem 2rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              background: "var(--bg-surface)",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "var(--accent-primary)",
                color: "var(--text-on-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                marginBottom: "1.5rem",
                animation: "pulse 2s infinite",
              }}
            >
              ⏳
            </div>
            <h3
              style={{
                marginBottom: "1.5rem",
                color: "var(--text-primary)",
                fontSize: "var(--font-size-lg)",
              }}
            >
              Đang tạo đề thi... Vui lòng không đóng cửa sổ
            </h3>
            <div
              style={{
                width: "100%",
                maxWidth: "500px",
                height: "12px",
                background: "var(--border)",
                borderRadius: "6px",
                overflow: "hidden",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "var(--accent-primary)",
                  width: `${Math.max(5, (exportTask.progress / exportTask.total) * 100)}%`,
                  transition: "width 0.5s ease",
                }}
              ></div>
            </div>
            <div
              style={{
                fontWeight: 600,
                color: "var(--text-secondary)",
                fontSize: "1.1rem",
              }}
            >
              {exportTask.message}
            </div>
            <style>{`
              @keyframes pulse {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(30, 63, 170, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(30, 63, 170, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(30, 63, 170, 0); }
              }
            `}</style>
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <div
              style={{
                flex: "1 1 55%",
                padding: "1rem 1.5rem",
                overflowY: "auto",
                borderRight: "1px solid var(--border)",
                background: "var(--bg-surface)",
              }}
            >
              {/* Phần 1: Các trường thông tin cơ bản (2 cột) */}
              <div
                style={{
                  display: "flex",
                  gap: "1.5rem",
                  marginBottom: "1.25rem",
                }}
              >
                {/* Cột 1 */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        marginBottom: "0.5rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      Đơn vị (VD: BỘ GIÁO DỤC VÀ ĐÀO TẠO)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      style={{ width: "100%", padding: "0.6rem" }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        marginBottom: "0.5rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      Loại đề (VD: ĐỀ THI CHÍNH THỨC)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={examType}
                      onChange={(e) => setExamType(e.target.value)}
                      style={{ width: "100%", padding: "0.6rem" }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        marginBottom: "0.5rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      Thời gian làm bài (phút): (VD: 50)
                    </label>
                    <NumberInput
                      className="input"
                      value={duration}
                      onChange={setDuration}
                      style={{ width: "100%", padding: "0.6rem" }}
                    />
                  </div>
                </div>

                {/* Cột 2 */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        marginBottom: "0.5rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      Tên kỳ thi (VD: KỲ THI TỐT NGHIỆP...)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Để trống nếu không cần hiển thị"
                      value={examTitle}
                      onChange={(e) => setExamTitle(e.target.value)}
                      style={{ width: "100%", padding: "0.6rem" }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        marginBottom: "0.5rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      Môn thi: (VD: TOÁN)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      style={{ width: "100%", padding: "0.6rem" }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        marginBottom: "0.5rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      Định dạng xuất
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: "1rem",
                        flexWrap: "wrap",
                        marginTop: "0.3rem",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={exportFormats.word}
                          onChange={(e) =>
                            setExportFormats({
                              ...exportFormats,
                              word: e.target.checked,
                            })
                          }
                        />{" "}
                        Word
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={exportFormats.pdf}
                          onChange={(e) =>
                            setExportFormats({
                              ...exportFormats,
                              pdf: e.target.checked,
                            })
                          }
                        />{" "}
                        PDF
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={exportFormats.latex}
                          onChange={(e) =>
                            setExportFormats({
                              ...exportFormats,
                              latex: e.target.checked,
                            })
                          }
                        />{" "}
                        Latex
                      </label>
                    </div>
                    {exportFormats.word && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.45rem",
                          marginTop: "0.75rem",
                          padding: "0.75rem",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                          Công thức trong Word
                        </span>
                        <label style={{ display: "flex", gap: "0.45rem", cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="word-equation-format"
                            checked={wordEquationFormat === "omml"}
                            onChange={() => setWordEquationFormat("omml")}
                          />
                          Word Equation (OMML)
                        </label>
                        <label style={{ display: "flex", gap: "0.45rem", cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="word-equation-format"
                            checked={wordEquationFormat === "mathtype"}
                            onChange={() => setWordEquationFormat("mathtype")}
                          />
                          MathType 7 (OLE có thể chỉnh sửa)
                        </label>
                        {wordEquationFormat === "mathtype" && mathTypeCapability?.available === false && (
                          <small style={{ color: "var(--accent-warning)", lineHeight: 1.4 }}>
                            {mathTypeCapability.reason || "MathType worker chưa sẵn sàng"}. Hệ thống sẽ giữ công thức OMML nếu worker không hoạt động.
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Phần 2: Các trường cấu hình phức tạp (1 cột full width) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                {/* Mã đề */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.1rem",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "1.1rem 1.25rem",
                    background: "var(--bg-surface)",
                  }}
                >
                  {/* Tiêu đề + Số đề */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <label
                      style={{
                        fontWeight: 600,
                        fontSize: "var(--font-size-md)",
                        color: "var(--text-primary)",
                        margin: 0,
                      }}
                    >
                      Mã đề
                    </label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Đề gốc (mặc định 000):
                      </span>
                      <input
                        type="text"
                        className="input"
                        value={originalCode}
                        placeholder="000"
                        maxLength={32}
                        onChange={(e) => setOriginalCode(e.target.value)}
                        style={{
                          width: "88px",
                          padding: "0.4rem",
                          textAlign: "center",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Số đề đảo:
                      </span>
                      <NumberInput
                        className="input"
                        value={numShuffles}
                        min={0}
                        onChange={setNumShuffles}
                        style={{
                          width: "72px",
                          padding: "0.4rem",
                          textAlign: "center",
                        }}
                      />
                    </div>
                  </div>

                  {/* Kiểu mã đề: 2 thẻ chọn */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.55rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Kiểu sinh mã
                    </span>

                    {/* Tăng dần */}
                    <div
                      onClick={() => setCodeType("incremental")}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        padding: "0.6rem 0.8rem",
                        borderRadius: "8px",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        border: `1px solid ${codeType === "incremental" ? "var(--accent-primary)" : "var(--border)"}`,
                        background:
                          codeType === "incremental"
                            ? "var(--accent-primary-soft)"
                            : "var(--bg-surface)",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                          fontWeight: codeType === "incremental" ? 600 : 400,
                        }}
                      >
                        <input
                          type="radio"
                          checked={codeType === "incremental"}
                          onChange={() => setCodeType("incremental")}
                        />
                        Tăng dần
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "0.88rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <span>Từ</span>
                        <input
                          type="text"
                          className="input"
                          value={startingCode}
                          onChange={(e) => setStartingCode(e.target.value)}
                          style={{
                            width: "64px",
                            padding: "0.35rem",
                            textAlign: "center",
                          }}
                          disabled={codeType !== "incremental"}
                        />
                        <span>bước</span>
                        <NumberInput
                          className="input"
                          value={codeStep}
                          min={1}
                          onChange={setCodeStep}
                          style={{
                            width: "56px",
                            padding: "0.35rem",
                            textAlign: "center",
                          }}
                          disabled={codeType !== "incremental"}
                        />
                      </div>
                    </div>

                    {/* Ngẫu nhiên */}
                    <div
                      onClick={() => setCodeType("random")}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        padding: "0.6rem 0.8rem",
                        borderRadius: "8px",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        border: `1px solid ${codeType === "random" ? "var(--accent-primary)" : "var(--border)"}`,
                        background:
                          codeType === "random"
                            ? "var(--accent-primary-soft)"
                            : "var(--bg-surface)",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                          fontWeight: codeType === "random" ? 600 : 400,
                        }}
                      >
                        <input
                          type="radio"
                          checked={codeType === "random"}
                          onChange={() => setCodeType("random")}
                        />
                        Ngẫu nhiên
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "0.88rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <span>Số chữ số</span>
                        <NumberInput
                          className="input"
                          value={randomLength}
                          min={1}
                          max={6}
                          onChange={setRandomLength}
                          style={{
                            width: "56px",
                            padding: "0.35rem",
                            textAlign: "center",
                          }}
                          disabled={codeType !== "random"}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Kiểu đảo: nút gạt */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Kiểu đảo
                    </span>
                    <div
                      style={{
                        display: "inline-flex",
                        alignSelf: "flex-start",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                    >
                      {(
                        [
                          ["both", "Câu + đáp án"],
                          ["order", "Câu"],
                          ["options", "Đáp án"],
                        ] as const
                      ).map(([val, label], i) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setShuffleMode(val)}
                          style={{
                            padding: "0.45rem 1rem",
                            fontSize: "0.9rem",
                            cursor: "pointer",
                            border: "none",
                            borderLeft:
                              i > 0 ? "1px solid var(--border)" : "none",
                            background:
                              shuffleMode === val
                                ? "var(--accent-primary)"
                                : "var(--bg-surface)",
                            color:
                              shuffleMode === val
                                ? "var(--text-on-accent)"
                                : "var(--text-primary)",
                            fontWeight: shuffleMode === val ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Thông tin chung */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    padding: "1rem",
                    background: "var(--bg-surface)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableGeneralInfo}
                      onChange={(e) => setEnableGeneralInfo(e.target.checked)}
                    />
                    Thông tin chung (Ghi chú):
                  </label>
                  {enableGeneralInfo && (
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                      }}
                    >
                      <RichLatexEditor
                        content={generalInfo}
                        onChange={setGeneralInfo}
                        placeholder="Nhập thông tin chung..."
                        minHeight="80px"
                        maxHeight="220px"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CỘT PHẢI: PREVIEW THÔNG QUA IFRAME (Paged.js, client-side) */}
            <div
              style={{
                flex: "1 1 50%",
                padding: "0.5rem 0.75rem",
                background: "var(--bg-hover)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <h4
                  style={{
                    fontSize: "var(--font-size-md)",
                    margin: 0,
                    color: "var(--text-secondary)",
                  }}
                >
                  Xem trước Đề thi
                </h4>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <button
                    onClick={() => setZoomLevel("fit")}
                    style={{
                      padding: "0 0.75rem",
                      height: "30px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background:
                        zoomLevel === "fit"
                          ? "var(--accent-primary-selected)"
                          : "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: zoomLevel === "fit" ? 600 : 400,
                    }}
                    title="Tự động vừa vặn với chiều ngang"
                  >
                    Vừa trang
                  </button>
                  <button
                    onClick={() =>
                      setZoomLevel((prev) =>
                        prev === "fit"
                          ? Math.max(0.4, zoomPercent / 100 - 0.01)
                          : Math.max(0.4, (prev as number) - 0.01),
                      )
                    }
                    style={{
                      width: "30px",
                      height: "30px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "1.2rem",
                      lineHeight: 1,
                    }}
                    title="Thu nhỏ"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={40}
                    max={250}
                    value={zoomPercent}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value) && value > 0) {
                        setZoomPercent(value);
                        setZoomLevel(Math.min(2.5, Math.max(0.01, value / 100)));
                      }
                    }}
                    onBlur={() => {
                      const value = Math.min(250, Math.max(40, zoomPercent));
                      setZoomPercent(value);
                      setZoomLevel(value / 100);
                    }}
                    style={{
                      width: "46px",
                      height: "30px",
                      textAlign: "center",
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                    title="Tỉ lệ xem trước (%)"
                  />
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>%</span>
                  <button
                    onClick={() =>
                      setZoomLevel((prev) =>
                        prev === "fit"
                          ? Math.min(2.5, zoomPercent / 100 + 0.01)
                          : Math.min(2.5, (prev as number) + 0.01),
                      )
                    }
                    style={{
                      width: "30px",
                      height: "30px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "1.2rem",
                      lineHeight: 1,
                    }}
                    title="Phóng to"
                  >
                    +
                  </button>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  background: "#fff",
                  borderRadius: "4px",
                  overflow: "hidden",
                  boxShadow:
                    "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                }}
              >
                {previewHtml ? (
                  <iframe
                    ref={iframeRef}
                    onLoad={syncPreviewDOM}
                    srcDoc={previewHtml}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    title="Preview"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    Đang tạo xem trước...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div
          className="modal-footer"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem",
            background: "var(--bg-surface)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              fontStyle: "italic",
              maxWidth: "60%",
            }}
          >
            <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
              Mẹo:
            </span>{" "}
            Đối với file Word, do đặc thù tự động dàn trang, vui lòng nhấn tổ
            hợp <kbd>Ctrl</kbd> + <kbd>P</kbd> rồi nhấn <kbd>ESC</kbd> khi mở
            file để hệ thống tự động tính và cập nhật đúng tổng số trang vào
            phần "Đề thi có ... trang".
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={exporting}
            >
              Hủy thao tác
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting}
              style={{ paddingLeft: "1.5rem", paddingRight: "1.5rem" }}
            >
              {exporting ? "Đang xử lý..." : "Xuất đề thi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
