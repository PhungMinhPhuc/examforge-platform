"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import RichLatexEditor from "@/components/RichLatexEditor";
import LatexRenderer from "@/components/LatexRenderer";

type ExportContest = { id: number; title: string };

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
  const [generalInfo, setGeneralInfo] = useState(
    "+ Cho biết: $\\pi = 3{,}14$; $T(K) = t(^\\circ C) + 273$; $R = 8{,}31$ J.mol$^{-1}$.K$^{-1}$; $N_A = 6{,}02.10^{23}$ hạt/mol; $\\ln 2 = 0{,}693$.\n+ Không làm tròn kết quả các phép tính trung gian.",
  );
  const [exportFormats, setExportFormats] = useState({
    word: true,
    pdf: false,
    latex: false,
  });
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [numShuffles, setNumShuffles] = useState(0);
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
        if (parsed.examTitle) setExamTitle(parsed.examTitle);
        if (parsed.department) setDepartment(parsed.department);
        if (parsed.examType) setExamType(parsed.examType);
        if (parsed.subject) setSubject(parsed.subject);
        if (typeof parsed.duration === "number") setDuration(parsed.duration);
        if (typeof parsed.enableGeneralInfo === "boolean")
          setEnableGeneralInfo(parsed.enableGeneralInfo);
        if (parsed.generalInfo) setGeneralInfo(parsed.generalInfo);
        if (parsed.exportFormats) {
          setExportFormats({
            word: !!parsed.exportFormats.word,
            pdf: !!parsed.exportFormats.pdf,
            latex: !!parsed.exportFormats.latex,
          });
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

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number | "fit">("fit");

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = (await api.getContestPreviewHTML(contest.id, {
          exam_title: examTitle,
          department: department,
          exam_type: examType,
          subject: subject,
          duration: duration,
          general_info: enableGeneralInfo ? generalInfo : "",
        })) as any;
        setPreviewHtml(res.html || "");
      } catch (err: any) {
        if (err.message !== "Request failed" && err.message !== "Not Found") {
          console.error("Failed to fetch preview", err);
        }
        setPreviewHtml(
          '<div style="text-align: center; color: red; margin-top: 2rem;">Lỗi kết nối Server. Vui lòng khởi động lại Terminal chạy Backend (python).</div>',
        );
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [contest.id, enableGeneralInfo, generalInfo]); // CHỈ gọi API khi nội dung có LaTeX (thông tin chung) thay đổi

  // Hàm cập nhật DOM trực tiếp để không phải tải lại toàn bộ iframe
  const syncPreviewDOM = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const updateText = (id: string, text: string) => {
      const el = doc.getElementById(id);
      if (el) el.textContent = text;
    };
    updateText("preview-department", department || "BỘ GIÁO DỤC VÀ ĐÀO TẠO");
    updateText("preview-exam-type", examType || "ĐỀ THI CHÍNH THỨC");
    updateText("preview-exam-title", examTitle || contest.title);
    updateText("preview-subject", subject || "...");
    updateText("preview-duration", (duration || 50).toString());
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
        scale = Math.min((iframeWidth - 40) / A4_WIDTH, 1);
      }

      // Sử dụng CSS zoom thay cho transform: scale
      // Tính năng này làm thu nhỏ không gian layout, giúp scrollbar tự động scale theo
      // và nhờ pagedjs_pages có display: flex + align-items: center nên sẽ tự động CĂN GIỮA TUYỆT ĐỐI
      (pages.style as any).zoom = scale.toString();

      // Xóa các thuộc tính cũ của transform
      pages.style.transform = "none";
      pages.style.marginLeft = "auto";
      pages.style.marginRight = "auto";
    }
  };

  useEffect(() => {
    applyZoom(zoomLevel);
  }, [zoomLevel]);

  // Nhận thông báo khi PagedJS render xong để apply zoom
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "PAGEDJS_READY") {
        applyZoom(zoomLevel);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [zoomLevel]);

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
  }, [examTitle, department, examType, subject, duration, contest.title]);

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
      examTitle: examTitle.trim() ? examTitle : contest.title,
      department,
      examType,
      subject,
      duration,
      enableGeneralInfo,
      generalInfo,
      exportFormats,
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
      const res = await api.exportContest(contest.id, {
        formats,
        num_shuffles: numShuffles,
        shuffle_mode: shuffleMode,
        exam_title: toSave.examTitle,
        department: toSave.department,
        exam_type: toSave.examType,
        subject: toSave.subject,
        duration: toSave.duration,
        general_info: enableGeneralInfo ? generalInfo : "",
        code_type: codeType,
        starting_code: startingCode,
        code_step: codeStep,
        random_length: randomLength,
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
            // Kích hoạt download
            window.location.href = `${process.env.NEXT_PUBLIC_API_URL || "/api"}/export/download/${taskId}`;
            setTimeout(() => {
              onClose();
              setExportTask(null);
              setExporting(false);
            }, 1000);
          } else if (statusRes.status === "error") {
            clearInterval(interval);
            alert("Lỗi xuất đề: " + statusRes.message);
            setExportTask(null);
            setExporting(false);
          }
        } catch (e: any) {
          clearInterval(interval);
          alert("Lỗi khi lấy trạng thái: " + e.message);
          setExportTask(null);
          setExporting(false);
        }
      }, 2000);
    } catch (err: any) {
      alert(err.message || "Lỗi khi yêu cầu xuất đề");
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
            background: "#fff",
          }}
        >
          <h3
            className="modal-title"
            style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}
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
              background: "#fcfcfc",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "var(--accent-primary)",
                color: "white",
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
                fontSize: "1.25rem",
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
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(37, 91, 167, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(37, 91, 167, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(37, 91, 167, 0); }
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
                background: "#fcfcfc",
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
                      className="form-control"
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
                      className="form-control"
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
                    <input
                      type="number"
                      className="form-control"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
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
                      className="form-control"
                      placeholder={contest.title}
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
                      className="form-control"
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
                    background: "#fff",
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
                        fontSize: "1rem",
                        color: "var(--text-primary)",
                        margin: 0,
                      }}
                    >
                      Mã đề (Đề gốc - 000)
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
                        Số đề:
                      </span>
                      <input
                        type="number"
                        className="form-control"
                        value={numShuffles}
                        min={0}
                        onChange={(e) => setNumShuffles(Number(e.target.value))}
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
                            ? "rgba(37,91,167,0.06)"
                            : "#fff",
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
                          className="form-control"
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
                        <input
                          type="number"
                          className="form-control"
                          value={codeStep}
                          min={1}
                          onChange={(e) => setCodeStep(Number(e.target.value))}
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
                            ? "rgba(37,91,167,0.06)"
                            : "#fff",
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
                        <input
                          type="number"
                          className="form-control"
                          value={randomLength}
                          min={1}
                          max={6}
                          onChange={(e) =>
                            setRandomLength(Number(e.target.value))
                          }
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
                                : "#fff",
                            color:
                              shuffleMode === val
                                ? "#fff"
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
                    background: "#fff",
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
                        minHeight="60px"
                        maxHeight="120px"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CỘT PHẢI: PREVIEW THÔNG QUA IFRAME DOM FAST */}
            <div
              style={{
                flex: "1 1 50%",
                padding: "1rem 1.5rem",
                background: "#e5e7eb",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <h4
                  style={{
                    fontSize: "1rem",
                    margin: 0,
                    color: "var(--text-secondary)",
                  }}
                >
                  Xem trước Đề thi
                </h4>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() =>
                      setZoomLevel((prev) =>
                        prev === "fit"
                          ? 0.8
                          : Math.max(0.4, (prev as number) - 0.2),
                      )
                    }
                    style={{
                      width: "30px",
                      height: "30px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#fff",
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
                  <button
                    onClick={() => setZoomLevel("fit")}
                    style={{
                      padding: "0 0.75rem",
                      height: "30px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: zoomLevel === "fit" ? "#e2e8f0" : "#fff",
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
                          ? 1.2
                          : Math.min(2.5, (prev as number) + 0.2),
                      )
                    }
                    style={{
                      width: "30px",
                      height: "30px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#fff",
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
                      color: "#888",
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
            background: "#fff",
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
