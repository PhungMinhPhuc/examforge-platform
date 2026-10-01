"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Combobox from "@/components/Combobox";
import DatePicker from "@/components/DatePicker";
import DateTimePicker from "@/components/DateTimePicker";
import TimePicker from "@/components/TimePicker";
import Checkbox from "@/components/Checkbox";
import Radio from "@/components/Radio";
import NumberInput from "@/components/NumberInput";
import RichLatexEditor from "@/components/rich-latex-editor";
import RibbonScroller from "@/components/RibbonScroller";
import { ProgressBar, Skeleton, Spinner } from "@/components/Loading";
import Toast from "@/components/Toast";
import MessageBar from "@/components/MessageBar";
import { COMMANDS_BY_TAB } from "@/components/rich-latex-editor/commands/definitions";
import type { TreeDoc } from "@/lib/docTree";
import {
  GoogleIcon,
  Icon,
  MicrosoftIcon,
  filledIconMarkup,
  strokeIconPaths,
  type IconName,
} from "@/components/icons";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import styles from "./page.module.css";
import ViewModeToggle, { type ViewMode } from "@/components/ViewModeToggle";
import { CollectionItem, CollectionView } from "@/components/CollectionView";

const options = [
  { value: "algebra", label: "Đại số", group: "Toán học", secondary: "12 câu" },
  { value: "geometry", label: "Hình học", group: "Toán học", secondary: "8 câu" },
  { value: "physics", label: "Vật lý", group: "Khoa học", secondary: "15 câu" },
  { value: "disabled", label: "Mục bị vô hiệu hóa", group: "Khoa học", disabled: true },
];

const strokeIconNames = Object.keys(strokeIconPaths) as IconName[];
const filledIconNames = Object.keys(filledIconMarkup) as IconName[];

const exportGeneralInfoPreview: TreeDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "+ Cho biết: π = 3,14; T(K) = t(°C) + 273; R = 8,31 J.mol⁻¹.K⁻¹.", marks: ["italic"] }] },
    { type: "paragraph", content: [{ type: "text", text: "+ Không làm tròn kết quả các phép tính trung gian.", marks: ["italic"] }] },
  ],
};

type TokenEntry = { name: string; value: string };

function tokenGroup(name: string) {
  if (/^--(?:bg|accent|text|border|code|tone|type|complexity|badge|answer|overlay|gradient|editor|auth-glass|focus-outline-color|control-border|icon-brand|icon-file)/.test(name)) return "Color";
  if (/^--font|^--line-height/.test(name)) return "Typography";
  if (/^--space/.test(name)) return "Spacing";
  if (/radius|border-width|outline-width|outline-offset|halo-width/.test(name)) return "Shape and border";
  if (/^--shadow/.test(name)) return "Elevation";
  if (/duration|transition|ease/.test(name)) return "Motion";
  if (/icon/.test(name)) return "Icon";
  if (/control|input|button|combobox|picker|calendar|field|checkbox|radio|switch|slider|avatar|accordion|breadcrumb|dropdown|toolbar|ribbon|tab/.test(name)) return "Component";
  return "Other";
}

export default function ComponentPreviewPage() {
  const [single, setSingle] = useState<string | number>("geometry");
  const [multiple, setMultiple] = useState<Array<string | number>>(["algebra", "physics"]);
  const [search, setSearch] = useState("Định luật");
  const [number, setNumber] = useState(5);
  const [time, setTime] = useState("09:30");
  const [clockHour, setClockHour] = useState(8);
  const [clockPeriod, setClockPeriod] = useState<"SA" | "CH">("SA");
  const [showPreviewPassword, setShowPreviewPassword] = useState(false);
  const [sliderValue, setSliderValue] = useState(62);
  const [previewTab, setPreviewTab] = useState("overview");
  const [collectionView, setCollectionView] = useState<ViewMode>("grid");
  const [ribbonPreviewTab, setRibbonPreviewTab] = useState<"edit" | "table">("edit");
  const [ribbonPreviewExpanded, setRibbonPreviewExpanded] = useState(true);
  const [accordionOpen, setAccordionOpen] = useState(true);
  const [authPreviewTab, setAuthPreviewTab] = useState<"login" | "register" | "guest">("login");
  const [trueFalsePreview, setTrueFalsePreview] = useState<boolean | null>(null);
  const [verticalTrueFalsePreview, setVerticalTrueFalsePreview] = useState<boolean | null>(null);
  const [correctAnswerPreview, setCorrectAnswerPreview] = useState<string[]>([]);
  const [showExportProposal, setShowExportProposal] = useState(false);
  const [exportProposalStep, setExportProposalStep] = useState(0);
  const [proposalFormats, setProposalFormats] = useState({ word: true, pdf: false, latex: false });
  const [proposalDepartment, setProposalDepartment] = useState("BỘ GIÁO DỤC VÀ ĐÀO TẠO");
  const [proposalExamTitle, setProposalExamTitle] = useState("");
  const [proposalExamType, setProposalExamType] = useState("ĐỀ THI CHÍNH THỨC");
  const [proposalSubject, setProposalSubject] = useState("TOÁN");
  const [proposalDuration, setProposalDuration] = useState(50);
  const [proposalEquationFormat, setProposalEquationFormat] = useState<"omml" | "mathtype">("omml");
  const [proposalOriginalCode, setProposalOriginalCode] = useState("000");
  const [proposalShuffleCount, setProposalShuffleCount] = useState(0);
  const [proposalCodeType, setProposalCodeType] = useState<"incremental" | "random">("incremental");
  const [proposalStartingCode, setProposalStartingCode] = useState("0101");
  const [proposalCodeStep, setProposalCodeStep] = useState(1);
  const [proposalRandomLength, setProposalRandomLength] = useState(3);
  const [proposalShuffleMode, setProposalShuffleMode] = useState<"both" | "order" | "options">("both");
  const [proposalGeneralInfoEnabled, setProposalGeneralInfoEnabled] = useState(false);
  const [proposalGeneralInfo, setProposalGeneralInfo] = useState<TreeDoc>(exportGeneralInfoPreview);
  const [proposalZoom, setProposalZoom] = useState(100);
  const [proposalExported, setProposalExported] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [tokens, setTokens] = useState<TokenEntry[]>([]);

  useEffect(() => {
    // Đồng bộ nút preview với data-theme đã được script trong layout áp dụng.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    const names = new Set<string>();
    const visitRules = (rules: CSSRuleList) => {
      Array.from(rules).forEach((rule) => {
        if ("style" in rule && rule.style instanceof CSSStyleDeclaration) {
          Array.from(rule.style).forEach((property) => {
            if (property.startsWith("--")) names.add(property);
          });
        }
        if ("cssRules" in rule) visitRules((rule as CSSGroupingRule).cssRules);
      });
    };
    Array.from(document.styleSheets).forEach((sheet) => {
      try { visitRules(sheet.cssRules); } catch { /* Ignore inaccessible external sheets. */ }
    });
    const computed = getComputedStyle(document.documentElement);
    // The token catalog is a snapshot of the browser's loaded stylesheets for the active theme.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTokens(Array.from(names).sort().map((name) => ({ name, value: computed.getPropertyValue(name).trim() })));
  }, [theme]);

  useEffect(() => {
    if (!showExportProposal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowExportProposal(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showExportProposal]);

  const groupedTokens = tokens.reduce<Record<string, TokenEntry[]>>((groups, token) => {
    const group = tokenGroup(token.name);
    (groups[group] ??= []).push(token);
    return groups;
  }, {});
  const ribbonPreviewCommands = COMMANDS_BY_TAB[ribbonPreviewTab];
  const ribbonPreviewGroups = Array.from(
    new Set(ribbonPreviewCommands.map((command) => command.group)),
  );

  const changeTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1>Form components preview</h1>
            <p>Trang tạm để kiểm tra trực tiếp các component dùng token và class <code>.ui-*</code>. Không có dấu tick; trạng thái chọn được thể hiện bằng màu.</p>
          </div>
          <div className="ui-button-group" aria-label="Chế độ màu">
            <button type="button" className={`ui-button ${theme === "light" ? "ui-button--primary" : "ui-button--secondary"}`} aria-pressed={theme === "light"} onClick={() => changeTheme("light")}><Icon name="sun" size="var(--control-icon-size)" />Sáng</button>
            <button type="button" className={`ui-button ${theme === "dark" ? "ui-button--primary" : "ui-button--secondary"}`} aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}><Icon name="moon" size="var(--control-icon-size)" />Tối</button>
          </div>
        </div>
      </header>

      <div className={styles.sections}>
        <section className={styles.section}>
          <h2>Design tokens</h2>
          <p className={styles.note}>Toàn bộ CSS custom properties đang được tải trong hệ thống. Giá trị được đọc trực tiếp theo theme hiện tại.</p>
          <div className={styles.tokenIndex}>
            {Object.entries(groupedTokens).map(([group, entries]) => (
              <details className={styles.tokenGroup} open={group === "Color" || group === "Typography"} key={group}>
                <summary>{group}<span>{entries.length}</span></summary>
                <div className={styles.tokenGrid}>
                  {entries.map((token) => (
                    <div className={styles.tokenItem} key={token.name}>
                      {group === "Color" ? <span className={styles.colorSwatch} style={{ background: `var(${token.name})` }} /> : null}
                      {group === "Typography" && token.name.startsWith("--font-size") ? <span className={styles.typeSample} style={{ fontSize: `var(${token.name})` }}>Aa</span> : null}
                      {group === "Spacing" ? <span className={styles.sizeSample} style={{ width: `var(${token.name})` }} /> : null}
                      {group === "Elevation" ? <span className={styles.shadowSample} style={{ boxShadow: `var(${token.name})` }} /> : null}
                      <span className={styles.tokenText}><code>{token.name}</code><small>{token.value || "(unresolved)"}</small></span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Collection view</h2>
          <p className={styles.note}>Mẫu card chuẩn dùng chung cho Đề thi, Lập trình, Lớp học và Bài tập trong lớp. Các trang chỉ truyền dữ liệu vào cùng các slot; Grid đặt thao tác ở đáy, List căn thao tác giữa theo chiều dọc.</p>
          <div className={styles.stack}>
            <ViewModeToggle value={collectionView} onChange={setCollectionView} />
            <CollectionView
              mode={collectionView}
              ariaLabel="Mẫu collection dùng chung"
              items={[
                { id: 1, kind: "Đề thi", title: "THPT 2024 - Mã đề 117 - 25/9/2026", meta: "45 phút · 50 câu", status: "Bản nháp", active: false },
                { id: 2, kind: "Lập trình", title: "Kiểm tra thuật toán và cấu trúc dữ liệu", meta: "90 phút · 4 bài · Lớp 12A", status: "Đang mở", active: true },
                { id: 3, kind: "Bài tập", title: "Ôn tập Hình học", meta: "Không giới hạn thời gian · 20 câu · Hạn 20/10/2026", status: "Đã đóng", active: false },
              ]}
              getKey={(item) => item.id}
              renderItem={(item) => (
                <CollectionItem
                  interactive
                  badges={<><span className="badge badge-mode">{item.kind}</span><span className={`badge ${item.active ? "badge-active" : "badge-inactive"}`}>{item.status}</span></>}
                  title={item.title}
                  metadata={item.meta}
                  actions={<><button className="ui-button ui-button--primary ui-button--small" type="button">Chi tiết</button><button className="ui-button ui-button--secondary ui-button--icon ui-button--small" type="button" aria-label="Thao tác khác"><Icon name="more-horizontal" /></button></>}
                />
              )}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2>Button</h2>
          <div className={styles.stack}>
            <div>
              <span className={styles.sampleLabel}>Variants</span>
              <div className={styles.buttonRow}>
                <button className="ui-button" type="button">Default</button>
                <button className="ui-button ui-button--primary" type="button">Primary</button>
                <button className="ui-button ui-button--secondary" type="button">Secondary</button>
                <button className="ui-button ui-button--outline" type="button">Outline</button>
                <button className="ui-button ui-button--tonal" type="button">Tonal</button>
                <button className="ui-button ui-button--ghost" type="button">Ghost</button>
                <button className="ui-button ui-button--subtle" type="button">Subtle</button>
                <button className="ui-button ui-button--transparent" type="button">Transparent</button>
                <button className="ui-button ui-button--danger" type="button">Danger</button>
                <button className="ui-button ui-button--danger-tonal" type="button">Danger tonal</button>
                <button className="ui-button ui-button--danger-solid" type="button">Danger solid</button>
              </div>
            </div>

            <div>
              <span className={styles.sampleLabel}>Sizes and icons</span>
              <div className={styles.buttonRow}>
                <button className="ui-button ui-button--primary ui-button--small" type="button"><Icon name="search" />Small</button>
                <button className="ui-button ui-button--primary" type="button"><Icon name="search" />Medium</button>
                <button className="ui-button ui-button--primary ui-button--large" type="button"><Icon name="search" />Large</button>
                <button className="ui-button ui-button--secondary ui-button--icon ui-button--small" type="button" aria-label="Tìm kiếm nhỏ"><Icon name="search" /></button>
                <button className="ui-button ui-button--secondary ui-button--icon" type="button" aria-label="Tìm kiếm"><Icon name="search" /></button>
                <button className="ui-button ui-button--secondary ui-button--icon ui-button--large" type="button" aria-label="Tìm kiếm lớn"><Icon name="search" /></button>
              </div>
            </div>

            <div>
              <span className={styles.sampleLabel}>Shape, state and loading</span>
              <div className={styles.buttonRow}>
                <button className="ui-button ui-button--tonal ui-button--square" type="button">Square</button>
                <button className="ui-button ui-button--tonal ui-button--rounded" type="button">Rounded</button>
                <button className="ui-button ui-button--primary ui-button--icon ui-button--circular" type="button" aria-label="Thêm"><Icon name="plus" /></button>
                <button className="ui-button ui-button--secondary" type="button" aria-pressed="true">Pressed</button>
                <button className="ui-button ui-button--secondary" type="button" aria-pressed="mixed">Mixed</button>
                <button className="ui-button ui-button--selected" type="button">Selected</button>
                <button className="ui-button ui-button--primary" type="button" disabled>Disabled</button>
                <button className="ui-button ui-button--primary" type="button" aria-busy="true"><span className="ui-button__spinner" aria-hidden="true" />Loading</button>
              </div>
            </div>

            <div className={styles.grid}>
              <div>
                <span className={styles.sampleLabel}>Compound</span>
                <div className={styles.buttonRow}>
                  <button className="ui-button ui-button--compound" type="button"><span>Tạo đề thi</span><span className="ui-button__secondary-text">Từ ngân hàng câu hỏi</span></button>
                  <button className="ui-button ui-button--primary ui-button--compound" type="button"><span>Lưu thay đổi</span><span className="ui-button__secondary-text">Cập nhật ngay</span></button>
                  <button className="ui-button ui-button--danger-solid ui-button--compound" type="button"><span>Xóa kỳ thi</span><span className="ui-button__secondary-text">Không thể hoàn tác</span></button>
                </div>
              </div>
              <div>
                <span className={styles.sampleLabel}>Button group</span>
                <div className="ui-button-group" role="group" aria-label="Chế độ hiển thị">
                  <button className="ui-button ui-button--secondary" type="button" aria-pressed="true">Danh sách</button>
                  <button className="ui-button ui-button--secondary" type="button">Lưới</button>
                  <button className="ui-button ui-button--secondary" type="button">Bảng</button>
                </div>
              </div>
              <div>
                <span className={styles.sampleLabel}>Split button</span>
                <div className="ui-split-button">
                  <button className="ui-button ui-button--primary" type="button">Tạo mới</button>
                  <button className="ui-button ui-button--primary" type="button" aria-label="Mở thêm lựa chọn"><Icon name="chevron-down" /></button>
                </div>
              </div>
              <div>
                <span className={styles.sampleLabel}>Provider button</span>
                <button className="ui-button ui-provider-button" type="button"><Icon name="lock" />Tiếp tục với nhà cung cấp</button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Loading</h2>
          <p className={styles.note}>Các mẫu chờ theo Fluent 2: spinner cho tác vụ ngắn, progress bar khi biết tiến độ và skeleton khi đã biết cấu trúc nội dung.</p>
          <div className={styles.loadingGrid}>
            <div className={styles.loadingDemo}>
              <span className={styles.sampleLabel}>Spinner · size</span>
              <div className={styles.spinnerRow}>
                {(["small", "medium", "large"] as const).map((size) => (
                  <div className={styles.spinnerSample} key={size}>
                    <Spinner size={size} />
                    <span>{size}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.loadingDemo}>
              <span className={styles.sampleLabel}>Spinner · label</span>
              <div className={styles.spinnerLabel}>
                <Spinner label="Đang tải câu hỏi …" />
              </div>
              <div className={styles.spinnerLabel}>
                <Spinner size="small" label="Đang lưu thay đổi …" />
              </div>
            </div>

            <div className={styles.loadingDemo}>
              <span className={styles.sampleLabel}>Progress bar · determinate</span>
              <div className={styles.progressHeader}><strong>Đang xuất đề thi&nbsp;…</strong><span>64%</span></div>
              <ProgressBar value={64} label="Tiến độ xuất đề thi" />
              <small className={styles.loadingStatus}>8 / 12 trang đã hoàn tất</small>
            </div>

            <div className={styles.loadingDemo}>
              <span className={styles.sampleLabel}>Progress bar · indeterminate</span>
              <strong>Đang chuẩn bị bản xem trước&nbsp;…</strong>
              <ProgressBar label="Đang chuẩn bị bản xem trước" />
              <small className={styles.loadingStatus}>Vui lòng giữ cửa sổ này mở</small>
            </div>

            <div className={`${styles.loadingDemo} ${styles.skeletonDemo}`} aria-busy="true" aria-label="Đang tải thẻ đề thi">
              <span className={styles.sampleLabel}>Skeleton · wave</span>
              <div className={styles.skeletonCard}>
                <Skeleton className={styles.skeletonAvatar} circle />
                <div className={styles.skeletonLines}>
                  <Skeleton className={styles.skeletonTitle} />
                  <Skeleton className={styles.skeletonText} />
                  <Skeleton className={styles.skeletonTextShort} />
                </div>
              </div>
            </div>

            <div className={styles.loadingDemo}>
              <span className={styles.sampleLabel}>Loading surface</span>
              <div className={styles.loadingSurface} aria-busy="true">
                <div className={styles.loadingSurfaceContent} aria-hidden="true"><strong>Danh sách câu hỏi</strong><span>Nội dung giữ nguyên ngữ cảnh phía sau</span></div>
                <div className={styles.loadingSurfaceIndicator}>
                  <Spinner label="Đang cập nhật …" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Toast and inline alert</h2>
          <p className={styles.note}>Toast bên dưới được render từ component <code>Toast.tsx</code> mới để duyệt thiết kế; <code>ToastViewport.tsx</code> đang chạy trong hệ thống chưa sử dụng component này. Cảnh báo tại chỗ bám theo cấu trúc MessageBar của Microsoft Fluent 2.</p>

          <div className={styles.feedbackGrid}>
            <div className={styles.feedbackColumn}>
              <div>
                <span className={styles.sampleLabel}>Tokenized toast · light/dark theo theme</span>
                <div className={styles.toastStage} aria-label="Bản xem trước snackbar">
                  <Toast kind="info" onDismiss={() => undefined}>Đang xử lý công thức MathType…</Toast>
                  <Toast kind="success" onDismiss={() => undefined}>Đã lưu 24 câu hỏi vào ngân hàng.</Toast>
                  <Toast kind="warning" onDismiss={() => undefined}>Bài tập còn 10 phút là hết hạn nộp.</Toast>
                  <Toast kind="error" actionLabel="Thử lại" onAction={() => undefined} onDismiss={() => undefined}>Không xuất được đề thi: máy chủ dựng PDF hết thời gian chờ.</Toast>
                </div>
              </div>
              <p className={styles.feedbackGuidance}>Không còn mã màu fix cứng: nền dùng <code>--bg-elevated</code>, chữ dùng <code>--text-primary</code>, icon dùng các token <code>--accent-*</code>. Chuyển nút Sáng/Tối ở đầu trang để xem cả hai bản.</p>
            </div>

            <div className={styles.feedbackColumn}>
              <div>
                <span className={styles.sampleLabel}>Fluent 2 MessageBar · 4 intent</span>
                <div className={styles.alertStack}>
                  <MessageBar intent="error" onDismiss={() => undefined}>Sai email hoặc mật khẩu</MessageBar>
                  <MessageBar intent="error" title="Không lưu được câu hỏi" actionLabel="Xem lỗi" onAction={() => undefined} onDismiss={() => undefined}>Kiểm tra các trường bắt buộc trước khi tiếp tục.</MessageBar>
                  <MessageBar intent="warning" title="Đề thi đang được sử dụng" actionLabel="Xem lớp" onAction={() => undefined} onDismiss={() => undefined}>Sửa nội dung có thể ảnh hưởng đến 2 lớp đang làm bài.</MessageBar>
                  <MessageBar intent="success" title="128 câu hỏi đã sẵn sàng" onDismiss={() => undefined}>Dữ liệu từ tệp Word đã được nhập vào ngân hàng.</MessageBar>
                  <MessageBar intent="info" title="Câu hỏi ở chế độ nháp" onDismiss={() => undefined}>Nội dung sẽ không xuất hiện trong ngân hàng cho đến khi được công bố.</MessageBar>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.feedbackVariants}>
            <span className={styles.sampleLabel}>MessageBar · multiline reflow</span>
            <MessageBar intent="error" title="Mất kết nối với máy chủ" actionLabel="Kết nối lại" onAction={() => undefined} onDismiss={() => undefined}>Những thay đổi chưa lưu vẫn được giữ trong trình duyệt. Hãy thử kết nối lại trước khi rời khỏi trang này để tránh mất dữ liệu.</MessageBar>
          </div>
          <p className={styles.feedbackGuidance}><strong>Quy tắc Fluent 2:</strong> action chỉ xuất hiện khi có cách xử lý phù hợp; MessageBar luôn có thể đóng; nội dung không bị cắt và action chuyển xuống hàng dưới trên màn hình hẹp.</p>
        </section>

        <section className={styles.section}>
          <h2>Segmented control</h2>
          <p className={styles.note}>Chuẩn <code>.ui-segmented</code> đang dùng cho Đăng nhập, Đăng ký và Thi thử.</p>
          <div className={styles.grid}>
            <div>
              <span className={styles.sampleLabel}>Interactive with icons</span>
              <div className="ui-segmented" role="tablist" aria-label="Auth preview">
                <button className="ui-segmented__item" role="tab" aria-selected={authPreviewTab === "login"} type="button" onClick={() => setAuthPreviewTab("login")}><Icon name="login-arrow" />Đăng nhập</button>
                <button className="ui-segmented__item" role="tab" aria-selected={authPreviewTab === "register"} type="button" onClick={() => setAuthPreviewTab("register")}><Icon name="user-plus" />Đăng ký</button>
                <button className="ui-segmented__item" role="tab" aria-selected={authPreviewTab === "guest"} type="button" onClick={() => setAuthPreviewTab("guest")}><Icon name="exam-paper" />Thi thử</button>
              </div>
            </div>
            <div>
              <span className={styles.sampleLabel}>Text and disabled state</span>
              <div className="ui-segmented" role="group" aria-label="View preview">
                <button className="ui-segmented__item" aria-pressed="true" type="button">Danh sách</button>
                <button className="ui-segmented__item" aria-pressed="false" type="button">Lưới</button>
                <button className="ui-segmented__item" aria-pressed="false" type="button" disabled>Bảng</button>
              </div>
            </div>
            <div>
              <span className={styles.sampleLabel}>Đúng/Sai theo nghiệp vụ đáp án</span>
              <div
                className="ui-segmented ui-segmented--fit ui-binary-choice"
                role="group"
                aria-label="Chọn đáp án đúng hoặc sai"
              >
                <button
                  className="ui-segmented__item ui-binary-choice__true"
                  type="button"
                  aria-pressed={trueFalsePreview === true}
                  onClick={() => setTrueFalsePreview(true)}
                >
                  Đúng
                </button>
                <button
                  className="ui-segmented__item ui-binary-choice__false"
                  type="button"
                  aria-pressed={trueFalsePreview === false}
                  onClick={() => setTrueFalsePreview(false)}
                >
                  Sai
                </button>
              </div>
              <p className={styles.choiceStatus} aria-live="polite">
                {trueFalsePreview === null
                  ? "Chưa chọn đáp án"
                  : trueFalsePreview
                    ? "Đáp án hiện tại: Đúng"
                    : "Đáp án hiện tại: Sai"}
              </p>
              <button
                className="ui-button ui-button--transparent ui-button--small"
                type="button"
                disabled={trueFalsePreview === null}
                onClick={() => setTrueFalsePreview(null)}
              >
                Bỏ chọn
              </button>
            </div>
            <div>
              <span className={styles.sampleLabel}>Đúng/Sai dạng dọc</span>
              <div
                className="ui-segmented ui-segmented--fit ui-binary-choice ui-binary-choice--vertical"
                role="group"
                aria-label="Chọn đáp án đúng hoặc sai theo chiều dọc"
              >
                <button
                  className="ui-segmented__item ui-binary-choice__true"
                  type="button"
                  aria-pressed={verticalTrueFalsePreview === true}
                  onClick={() => setVerticalTrueFalsePreview(true)}
                >
                  Đúng
                </button>
                <button
                  className="ui-segmented__item ui-binary-choice__false"
                  type="button"
                  aria-pressed={verticalTrueFalsePreview === false}
                  onClick={() => setVerticalTrueFalsePreview(false)}
                >
                  Sai
                </button>
              </div>
              <p className={styles.choiceStatus} aria-live="polite">
                {verticalTrueFalsePreview === null
                  ? "Chưa chọn đáp án"
                  : verticalTrueFalsePreview
                    ? "Đáp án hiện tại: Đúng"
                    : "Đáp án hiện tại: Sai"}
              </p>
              <button
                className="ui-button ui-button--transparent ui-button--small"
                type="button"
                disabled={verticalTrueFalsePreview === null}
                onClick={() => setVerticalTrueFalsePreview(null)}
              >
                Bỏ chọn
              </button>
            </div>
            <div>
              <span className={styles.sampleLabel}>Đáp án đúng · cho phép chọn nhiều</span>
              <div
                className="ui-segmented ui-segmented--fit ui-answer-choice"
                role="group"
                aria-label="Chọn một hoặc nhiều đáp án đúng"
                aria-describedby="correct-answer-preview-status"
              >
                {["A", "B", "C", "D"].map((answer) => {
                  const selected = correctAnswerPreview.includes(answer);
                  return (
                    <button
                      key={answer}
                      className="ui-segmented__item"
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Đáp án ${answer}${selected ? ", đang được chọn" : ""}`}
                      onClick={() =>
                        setCorrectAnswerPreview((current) =>
                          current.includes(answer)
                            ? current.filter((item) => item !== answer)
                            : [...current, answer],
                        )
                      }
                    >
                      {answer}
                    </button>
                  );
                })}
              </div>
              <p
                className={styles.choiceStatus}
                id="correct-answer-preview-status"
                aria-live="polite"
              >
                {correctAnswerPreview.length > 0
                  ? `Đáp án đúng hiện tại: ${correctAnswerPreview.join(", ")}`
                  : "Chưa chọn đáp án đúng"}
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Specialized buttons</h2>
          <p className={styles.note}>Cac mau de duyet truoc khi thay the cac he button rieng trong ung dung.</p>
          <div className={styles.stack}>
            <div>
              <span className={styles.sampleLabel}>OAuth / provider</span>
              <div className={styles.buttonRow}>
                <button className="ui-button ui-provider-button ui-provider-button--google" type="button"><GoogleIcon size="var(--control-icon-size)" />Tiep tuc voi Google</button>
                <button className="ui-button ui-provider-button ui-provider-button--microsoft" type="button"><MicrosoftIcon size="var(--control-icon-size)" />Tiep tuc voi Microsoft</button>
              </div>
            </div>
            <div>
              <span className={styles.sampleLabel}>Formatting / editor / image zoom</span>
              <div className={styles.buttonRow}>
                {(["bold", "italic", "underline", "highlight", "subscript", "superscript", "table", "image", "zoom-out", "zoom-in"] as IconName[]).map((name) => (
                  <button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label={name} title={name} key={name}><Icon name={name} /></button>
                ))}
              </div>
            </div>
            <div>
              <span className={styles.sampleLabel}>Pagination / history / chatbot</span>
              <div className={styles.buttonRow}>
                <button className="ui-button ui-button--secondary ui-button--icon" type="button" aria-label="Trang truoc"><Icon name="chevron-left" /></button>
                <button className="ui-button ui-button--selected ui-button--icon" type="button">2</button>
                <button className="ui-button ui-button--secondary ui-button--icon" type="button" aria-label="Trang sau"><Icon name="chevron-right" /></button>
                <button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label="Quay lai"><Icon name="chevron-left" /></button>
                <button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label="Di toi"><Icon name="chevron-right" /></button>
                <button className="ui-button ui-button--primary ui-button--icon ui-button--circular ui-button--large" type="button" aria-label="Mo tro ly"><Icon name="sparkle" /></button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Icon and logo catalog</h2>
          <p className={styles.note}>Logo thuong hieu duoc giu nguyen. Icon thao tac duoc lay tu registry dung chung.</p>
          <div className={styles.stack}>
            <div>
              <span className={styles.sampleLabel}>Brand logos</span>
              <div className={styles.iconGrid}>
                <div className={styles.iconSample}><GoogleIcon size="var(--icon-size-lg)" title="Google" /><span>Google</span></div>
                <div className={styles.iconSample}><MicrosoftIcon size="var(--icon-size-lg)" title="Microsoft" /><span>Microsoft</span></div>
              </div>
            </div>
            <div>
              <span className={styles.sampleLabel}>Action icons - stroke</span>
              <div className={styles.iconGrid}>{strokeIconNames.map((name) => <div className={styles.iconSample} key={name}><Icon name={name} title={name} /><span>{name}</span></div>)}</div>
            </div>
            <div>
              <span className={styles.sampleLabel}>Editor and file icons - filled</span>
              <div className={styles.iconGrid}>{filledIconNames.map((name) => <div className={styles.iconSample} key={name}><Icon name={name} title={name} /><span>{name}</span></div>)}</div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Combobox</h2>
          <div className={styles.grid}>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Sizes</span>
              <Combobox size="small" value={single} onChange={setSingle} options={options} clearable />
              <Combobox size="medium" value={single} onChange={setSingle} options={options} clearable />
              <Combobox size="large" value={single} onChange={setSingle} options={options} clearable />
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Appearance</span>
              <Combobox appearance="underline" value={single} onChange={setSingle} options={options} />
              <Combobox appearance="filled" value={single} onChange={setSingle} options={options} />
              <Combobox appearance="filled-lighter" value={single} onChange={setSingle} options={options} />
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>States and multiple</span>
              <Combobox multiple clearable value={multiple} onChange={setMultiple} options={options} />
              <Combobox invalid value="" onChange={() => undefined} options={options} placeholder="Giá trị không hợp lệ" />
              <Combobox disabled value="physics" onChange={() => undefined} options={options} />
              <Combobox loading value="" onChange={() => undefined} options={options} placeholder="Mở để xem loading" />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Field and Input</h2>
          <div className={styles.grid}>
            <label className="ui-field ui-field--medium">
              <span className="ui-field__label">Tên đề thi<span className="ui-field__required">*</span></span>
              <span className="ui-input ui-input--medium"><input className="ui-input__control" defaultValue="Kiểm tra giữa kỳ" /></span>
              <span className="ui-field__hint">Tên hiển thị với học sinh.</span>
            </label>
            <label className="ui-field ui-field--medium">
              <span className="ui-field__label">Mã truy cập</span>
              <span className="ui-input ui-input--medium ui-input--invalid"><span className="ui-input__before">#</span><input className="ui-input__control" defaultValue="ABC" aria-invalid="true" /></span>
              <span className="ui-field__validation ui-field__validation--error" role="alert"><Icon className="ui-field__validation-icon" name="x-circle" />Mã phải có ít nhất 6 ký tự.</span>
            </label>
            <label className="ui-field ui-field--medium">
              <span className="ui-field__label">Trạng thái hợp lệ</span>
              <span className="ui-input ui-input--medium"><input className="ui-input__control" defaultValue="Đã xác nhận" /></span>
              <span className="ui-field__validation ui-field__validation--success"><Icon className="ui-field__validation-icon" name="check-circle" />Dữ liệu hợp lệ.</span>
            </label>
            <label className="ui-field ui-field--medium">
              <span className="ui-field__label">Số lượng câu hỏi</span>
              <span className="ui-input ui-input--medium"><input className="ui-input__control" defaultValue="8" /></span>
              <span className="ui-field__validation ui-field__validation--warning" role="alert"><Icon className="ui-field__validation-icon" name="warning" />Ít câu hỏi hơn khuyến nghị (30).</span>
            </label>
          </div>
          <div className={styles.stack} style={{ marginTop: "var(--space-4)" }}>
            <span className="ui-input ui-input--small"><input className="ui-input__control" placeholder="Small — 13px" /></span>
            <span className="ui-input ui-input--medium ui-input--underline"><input className="ui-input__control" placeholder="Medium underline — 14px" /></span>
            <span className="ui-input ui-input--large ui-input--filled"><span className="ui-input__before"><Icon name="lock" size="var(--control-icon-size)" /></span><input className="ui-input__control" type={showPreviewPassword ? "text" : "password"} defaultValue="password" /><button className="ui-input__after" type="button" aria-label={showPreviewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPreviewPassword((current) => !current)}><Icon name={showPreviewPassword ? "eye-off" : "eye"} size="var(--control-icon-size)" /></button></span>
            <span className="ui-input ui-input--medium ui-input--disabled"><input className="ui-input__control" disabled defaultValue="Disabled" /></span>
          </div>
        </section>

        <section className={styles.section}>
          <h2>SearchBox</h2>
          <div className={styles.grid}>
            {(["small", "medium", "large"] as const).map((size) => (
              <span className={`ui-input ui-input--${size} ui-searchbox`} key={size}>
                <span className="ui-input__before ui-searchbox__icon"><Icon name="search" size="var(--control-icon-size)" /></span>
                <input className="ui-input__control ui-searchbox__input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${size}`} />
                <button className="ui-input__after ui-searchbox__dismiss" type="button" aria-label="Xóa tìm kiếm" hidden={!search} onClick={() => setSearch("")}><Icon name="x" size="var(--control-icon-size)" /></button>
              </span>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Dropdown and Select</h2>
          <div className={styles.grid}>
            <div className="ui-combobox ui-combobox--medium ui-dropdown">
              <button className="ui-dropdown__button" type="button">Hành động đã chọn</button>
              <span className="ui-combobox__actions"><button className="ui-combobox__expand" type="button" aria-label="Mở dropdown"><Icon name="chevron-down" size="var(--control-icon-size)" /></button></span>
            </div>
            <div>
              <div className="ui-combobox ui-combobox--medium ui-combobox--open">
                <button className="ui-select__button" type="button">Hình học</button>
                <span className="ui-combobox__actions"><button className="ui-combobox__expand" type="button" aria-label="Đóng select"><Icon name="chevron-down" size="var(--control-icon-size)" /></button></span>
              </div>
              <div className={`ui-combobox__listbox ${styles.staticPopup}`} role="listbox">
                <div className="ui-combobox__group-label">Toán học</div>
                <div className="ui-combobox__option">Đại số</div>
                <div className="ui-combobox__option ui-combobox__option--selected">Hình học</div>
                <div className="ui-combobox__group-label">Khoa học</div>
                <div className="ui-combobox__option ui-combobox__option--disabled">Mục bị vô hiệu hóa</div>
              </div>
            </div>
            <div>
              <span className={styles.sampleLabel}>Action menu with description</span>
              <div className={`ui-dropdown__menu ${styles.dropdownMenuPreview}`} role="menu">
                <button className="ui-dropdown__option" type="button" role="menuitem"><strong className="ui-dropdown__label">Tạo câu hỏi mới</strong><span className="ui-dropdown__description">Nhập nội dung và đáp án thủ công</span></button>
                <button className="ui-dropdown__option" type="button" role="menuitem"><strong className="ui-dropdown__label">Nhập câu hỏi</strong><span className="ui-dropdown__description">Nhập nhiều câu hỏi từ tài liệu</span></button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>SpinButton</h2>
          <div className={styles.grid}>
            {(["small", "medium", "large"] as const).map((size) => (
              <span className={`ui-input ui-input--${size} ui-spin-button ui-spin-button--${size}`} key={size}>
                <input className="ui-input__control ui-spin-button__input" type="text" inputMode="numeric" value={number} onChange={(event) => setNumber(Number(event.target.value))} />
                <button className="ui-spin-button__increment" type="button" aria-label="Tăng" onClick={() => setNumber((value) => Math.min(10, value + 1))}><Icon name="chevron-up" size="var(--control-icon-size)" /></button>
                <button className="ui-spin-button__decrement" type="button" aria-label="Giảm" onClick={() => setNumber((value) => Math.max(0, value - 1))}><Icon name="chevron-down" size="var(--control-icon-size)" /></button>
              </span>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>TimePicker</h2>
          <div className={styles.grid}>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Appearance</span>
              <TimePicker value={time} onChange={setTime} placeholder="Outline" />
              <TimePicker value="" onChange={() => undefined} appearance="underline" placeholder="Underline" />
              <TimePicker value="" onChange={() => undefined} appearance="filled-lighter" placeholder="Filled lighter" />
              <TimePicker value="" onChange={() => undefined} appearance="filled-darker" placeholder="Filled darker" />
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Sizes and states</span>
              <TimePicker size="small" value="" onChange={() => undefined} placeholder="Small" />
              <TimePicker size="medium" value={time} onChange={setTime} clearable placeholder="Chọn giờ nộp bài" />
              <TimePicker size="large" value="" onChange={() => undefined} placeholder="Large" />
              <TimePicker value="" onChange={() => undefined} invalid placeholder="Trường bắt buộc" />
              <TimePicker value="" onChange={() => undefined} disabled placeholder="Không khả dụng" />
            </div>
            <div className="ui-time-picker__clock-popup">
              <div className="ui-time-picker__readout">{String(clockHour).padStart(2, "0")}:00<span className="ui-time-picker__period">{clockPeriod}</span></div>
              <div className="ui-time-picker__clock">
                <span className="ui-time-picker__clock-hand" style={{ transform: "rotate(" + (clockHour * 30 + 180) + "deg)" }} />
                <span className="ui-time-picker__clock-center" />
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => {
                  const angle = hour * 30 - 90;
                  const radians = angle * Math.PI / 180;
                  const left = (100 + 75 * Math.cos(radians)).toFixed(4);
                  const top = (100 + 75 * Math.sin(radians)).toFixed(4);
                  return <button className={"ui-time-picker__clock-number " + (hour === clockHour ? "ui-time-picker__clock-number--selected" : "")} style={{ left: left + "px", top: top + "px" }} type="button" key={hour} onClick={() => setClockHour(hour)}>{hour}</button>;
                })}
              </div>
              <div className="ui-time-picker__period-group">
                {(["SA", "CH"] as const).map((period) => <button className={"ui-button ui-button--small ui-button--subtle " + (clockPeriod === period ? "ui-button--selected" : "")} type="button" key={period} onClick={() => setClockPeriod(period)}>{period}</button>)}
              </div>
              <div className="ui-time-picker__clock-actions">
                <button className="ui-button ui-button--small ui-button--subtle" type="button">Huỷ</button>
                <button className="ui-button ui-button--small ui-button--primary" type="button">Xong</button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>DatePicker and Calendar</h2>
          <div className={styles.grid}>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Default · day and month panels</span>
              <DatePicker defaultValue={new Date(2026, 8, 22)} />
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Monday first · week numbers · boundaries</span>
              <DatePicker allowTextInput required firstDayOfWeek={1} showWeekNumbers minDate={new Date(2026, 8, 10)} maxDate={new Date(2026, 8, 25)} defaultValue={new Date(2026, 8, 14)} rangeType="week" />
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Month picker as overlay</span>
              <DatePicker overlayMonthPicker appearance="filled-lighter" />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>DateTimePicker</h2>
          <div className={styles.grid}>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Custom date · native browser time</span>
              <DateTimePicker defaultDate={new Date(2026, 8, 22)} defaultTime="09:30" />
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Large</span>
              <DateTimePicker size="large" defaultDate={new Date(2026, 8, 22)} defaultTime="13:00" />
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Disabled</span>
              <DateTimePicker disabled defaultDate={new Date(2026, 8, 22)} defaultTime="09:30" />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Modal and close button</h2>
          <p className={styles.note}>Mẫu chuẩn đề xuất: icon X màu đỏ ở góc trên bên phải; Hủy và hành động chính vẫn đặt ở footer.</p>
          <div className={styles.grid}>
            <article className="ui-modal">
              <header className="ui-modal__header">
                <div className="ui-modal__heading">
                  <h3 className="ui-modal__title">Chi tiết câu hỏi</h3>
                  <p className="ui-modal__description">Modal chỉ đọc có thể đóng bằng nút X hoặc click ra ngoài.</p>
                </div>
                <button className="ui-modal__close" type="button" aria-label="Đóng"><Icon name="close" /></button>
              </header>
              <div className="ui-modal__body">Nội dung modal được đặt trong vùng body dùng token khoảng cách chung.</div>
            </article>

            <article className="ui-modal">
              <header className="ui-modal__header">
                <div className="ui-modal__heading">
                  <h3 className="ui-modal__title">Chỉnh sửa câu hỏi</h3>
                  <p className="ui-modal__description">X và Hủy cùng gọi quy trình kiểm tra thay đổi chưa lưu.</p>
                </div>
                <button className="ui-modal__close" type="button" aria-label="Đóng"><Icon name="close" /></button>
              </header>
              <div className="ui-modal__body">
                <label className="ui-field ui-field--medium">
                  <span className="ui-field__label">Tên hiển thị</span>
                  <span className="ui-input ui-input--medium"><input className="ui-input__control" defaultValue="Câu hỏi mẫu" /></span>
                </label>
              </div>
              <footer className="ui-modal__footer">
                <button className="ui-button ui-button--secondary" type="button">Hủy</button>
                <button className="ui-button ui-button--primary" type="button">Lưu thay đổi</button>
              </footer>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Page header</h2>
          <p className={styles.note}>Mẫu chuẩn đề xuất dùng <code>--space-4</code> cho cả khoảng cách giữa nội dung và khoảng cách phía dưới.</p>
          <div className={styles.pageHeaderPreview}>
            <header className="ui-page-header">
              <div className="ui-page-header__heading">
                <h3 className="ui-page-header__title">Đề thi và bài tập</h3>
                <p className="ui-page-header__description">41 đề thi</p>
              </div>
              <div className="ui-page-header__actions">
                <button className="ui-button ui-button--secondary" type="button">Nhập đề</button>
                <button className="ui-button ui-button--primary" type="button"><Icon name="plus" />Tạo đề thi</button>
              </div>
            </header>
            <div className="ui-tablist" role="tablist" aria-label="Loại đề thi preview">
              <button className="ui-tab" role="tab" aria-selected="true" type="button">Đề thi</button>
              <button className="ui-tab" role="tab" aria-selected="false" type="button">Lập trình</button>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Textarea</h2>
          <div className={styles.grid}>
            <label className="ui-field ui-field--medium">
              <span className="ui-field__label">Mô tả đề thi</span>
              <textarea className="ui-textarea" defaultValue="Nội dung nhiều dòng sử dụng toàn bộ token của Input và Field." />
              <span className="ui-field__hint">Có thể kéo để thay đổi chiều cao.</span>
            </label>
            <textarea className="ui-textarea" placeholder="Textarea trống" />
            <textarea className="ui-textarea" disabled defaultValue="Textarea bị vô hiệu hóa" />
          </div>
        </section>

        <section className={styles.section}>
          <h2>Checkbox, Switch and Radio</h2>
          <div className={styles.grid}>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Checkbox states and variants</span>
              <label className="ui-checkbox"><input className="ui-checkbox__input" type="checkbox" /><span className="ui-checkbox__indicator"><Icon name="check" /></span><span className="ui-checkbox__label">Chưa chọn</span></label>
              <label className="ui-checkbox"><input className="ui-checkbox__input" type="checkbox" defaultChecked /><span className="ui-checkbox__indicator"><Icon name="check" /></span><span className="ui-checkbox__label">Đã chọn</span></label>
              <label className="ui-checkbox"><input className="ui-checkbox__input" type="checkbox" ref={(node) => { if (node) node.indeterminate = true; }} /><span className="ui-checkbox__indicator"><Icon name="check" /></span><span className="ui-checkbox__label">Không xác định</span></label>
              <label className="ui-checkbox ui-checkbox--large ui-checkbox--circular"><input className="ui-checkbox__input" type="checkbox" defaultChecked /><span className="ui-checkbox__indicator"><Icon name="check" /></span><span className="ui-checkbox__label">Large circular</span></label>
              <label className="ui-checkbox ui-checkbox--label-before"><input className="ui-checkbox__input" type="checkbox" /><span className="ui-checkbox__indicator"><Icon name="check" /></span><span className="ui-checkbox__label">Nhãn phía trước</span></label>
              <label className="ui-checkbox ui-checkbox--disabled"><input className="ui-checkbox__input" type="checkbox" disabled defaultChecked /><span className="ui-checkbox__indicator"><Icon name="check" /></span><span className="ui-checkbox__label">Disabled</span></label>
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Switch states and placement</span>
              <label className="ui-switch"><input className="ui-switch__input" type="checkbox" /><span className="ui-switch__indicator" /><span className="ui-switch__label">Tắt</span></label>
              <label className="ui-switch"><input className="ui-switch__input" type="checkbox" defaultChecked /><span className="ui-switch__indicator" /><span className="ui-switch__label">Bật</span></label>
              <label className="ui-switch ui-switch--small ui-switch--label-before"><input className="ui-switch__input" type="checkbox" defaultChecked /><span className="ui-switch__indicator" /><span className="ui-switch__label">Small, label before</span></label>
              <label className="ui-switch ui-switch--label-above"><input className="ui-switch__input" type="checkbox" /><span className="ui-switch__indicator" /><span className="ui-switch__label">Label above</span></label>
              <label className="ui-switch ui-switch--disabled"><input className="ui-switch__input" type="checkbox" disabled defaultChecked /><span className="ui-switch__indicator" /><span className="ui-switch__label">Disabled</span></label>
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>RadioGroup layouts</span>
              <div className="ui-radio-group" role="radiogroup" aria-label="Mức độ">
                {['Cơ bản', 'Trung bình', 'Nâng cao'].map((label, index) => <label className="ui-radio" key={label}><input className="ui-radio__input" type="radio" name="level-preview" defaultChecked={index === 1} /><span className="ui-radio__indicator" /><span className="ui-radio__label">{label}</span></label>)}
                <label className="ui-radio ui-radio--disabled"><input className="ui-radio__input" type="radio" name="level-preview" disabled /><span className="ui-radio__indicator" /><span className="ui-radio__label">Disabled</span></label>
              </div>
              <div className="ui-radio-group ui-radio-group--horizontal" role="radiogroup" aria-label="Bố cục">
                <label className="ui-radio ui-radio--label-below"><input className="ui-radio__input" type="radio" name="layout-preview" defaultChecked /><span className="ui-radio__indicator" /><span className="ui-radio__label">Một cột</span></label>
                <label className="ui-radio ui-radio--label-below"><input className="ui-radio__input" type="radio" name="layout-preview" /><span className="ui-radio__indicator" /><span className="ui-radio__label">Hai cột</span></label>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Slider and TagPicker</h2>
          <div className={styles.grid}>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Interactive slider: {sliderValue}%</span>
              <span className="ui-slider" style={{ "--slider-progress": `${sliderValue}%` } as CSSProperties}><span className="ui-slider__rail" /><span className="ui-slider__thumb" /><input className="ui-slider__input" type="range" min="0" max="100" value={sliderValue} onChange={(event) => setSliderValue(Number(event.target.value))} /></span>
              <span className="ui-slider ui-slider--small" style={{ "--slider-progress": "35%" } as CSSProperties}><span className="ui-slider__rail" /><span className="ui-slider__thumb" /><input className="ui-slider__input" type="range" defaultValue="35" /></span>
              <span className="ui-slider" style={{ "--slider-progress": "70%" } as CSSProperties}><span className="ui-slider__rail" /><span className="ui-slider__thumb" /><input className="ui-slider__input" type="range" defaultValue="70" disabled /></span>
            </div>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Tag picker</span>
              <div className="ui-tag-picker"><div className="ui-tag-picker__control"><span className="ui-tag">Đại số<button type="button" aria-label="Xóa Đại số"><Icon name="x" /></button></span><span className="ui-tag">Hình học<button type="button" aria-label="Xóa Hình học"><Icon name="x" /></button></span><input className="ui-tag-picker__input" placeholder="Thêm thẻ..." /></div></div>
              <div className="ui-tag-picker ui-tag-picker--disabled"><div className="ui-tag-picker__control"><span className="ui-tag">Vật lý</span><input className="ui-tag-picker__input" disabled placeholder="Disabled" /></div></div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Tabs</h2>
          <div className={styles.grid}>
            <div className={styles.stack}>
              <span className={styles.sampleLabel}>Horizontal and subtle</span>
              <div className="ui-tablist ui-tablist--subtle" role="tablist">
                {[['overview', 'Tổng quan'], ['questions', 'Câu hỏi'], ['results', 'Kết quả']].map(([value, label]) => <button className="ui-tab" role="tab" type="button" aria-selected={previewTab === value} onClick={() => setPreviewTab(value)} key={value}><Icon name={value === 'overview' ? 'dashboard' : value === 'questions' ? 'exam-paper' : 'roster'} />{label}</button>)}
                <button className="ui-tab" role="tab" type="button" aria-selected="false" disabled>Disabled</button>
              </div>
            </div>
            <div className="ui-tablist ui-tablist--vertical" role="tablist" aria-label="Tab dọc">
              <button className="ui-tab" role="tab" type="button" aria-selected="true">Thông tin</button>
              <button className="ui-tab" role="tab" type="button" aria-selected="false">Cấu hình</button>
              <button className="ui-tab" role="tab" type="button" aria-selected="false">Phân quyền</button>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Toolbar and Ribbon</h2>
          <div className={styles.stack}>
            <div className="ui-toolbar ui-toolbar--small" role="toolbar" aria-label="Định dạng"><div className="ui-toolbar__group"><button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label="Đậm"><Icon name="bold" /></button><button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label="Nghiêng"><Icon name="italic" /></button><button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label="Gạch chân"><Icon name="underline" /></button></div><span className="ui-toolbar__divider" /><div className="ui-toolbar__group"><button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label="Hoàn tác"><Icon name="undo" /></button><button className="ui-button ui-button--transparent ui-button--icon ui-button--small" type="button" aria-label="Làm lại"><Icon name="redo" /></button></div></div>
            <div className="ui-toolbar ui-toolbar--large" role="toolbar" aria-label="Toolbar lớn"><button className="ui-button ui-button--secondary" type="button"><Icon name="save" />Lưu</button><button className="ui-button ui-button--secondary" type="button"><Icon name="upload" />Tải lên</button></div>
            <nav className={`ui-ribbon ${styles.ribbonPreview}`} aria-label="Ribbon hệ thống">
              <div className="ui-ribbon__tab-row">
                <div className="ui-ribbon__quick-actions" role="toolbar" aria-label="Thao tác nhanh">
                  <button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Hoàn tác"><Icon name="undo" /></button>
                  <button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Làm lại"><Icon name="redo" /></button>
                </div>
                <div className="ui-tablist ui-tablist--ribbon ui-ribbon__tab-list" role="tablist" aria-label="Nhóm công cụ">
                  <button className="ui-tab ui-tab--compact" type="button" role="tab" aria-selected={ribbonPreviewTab === "edit"} onClick={() => setRibbonPreviewTab("edit")}>Edit</button>
                  <button className="ui-tab ui-tab--compact ui-ribbon__tab--contextual" type="button" role="tab" aria-selected={ribbonPreviewTab === "table"} onClick={() => setRibbonPreviewTab("table")}>Table</button>
                </div>
                <button className="ui-ribbon__toggle" type="button" aria-expanded={ribbonPreviewExpanded} aria-label={ribbonPreviewExpanded ? "Thu thanh công cụ" : "Mở thanh công cụ"} onClick={() => setRibbonPreviewExpanded((value) => !value)}><Icon name="chevron-down" /></button>
              </div>
              {ribbonPreviewExpanded ? (
                <RibbonScroller role="tabpanel" resetKey={ribbonPreviewTab}>
                    {ribbonPreviewGroups.map((group) => (
                      <div
                        className="ui-ribbon__tool-group"
                        role="group"
                        aria-label={group}
                        key={group}
                      >
                        {ribbonPreviewCommands
                          .filter((command) => command.group === group)
                          .map((command) => (
                            <button
                              className="ui-ribbon__tool-button ui-ribbon__tool-button--icon"
                              type="button"
                              aria-label={command.label}
                              title={command.label}
                              aria-pressed={command.id === "bold" ? false : undefined}
                              key={command.id}
                            >
                              <Icon name={command.icon} />
                            </button>
                          ))}
                      </div>
                    ))}
                </RibbonScroller>
              ) : null}
            </nav>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Accordion</h2>
          <div className={styles.grid}>
            <div className="ui-accordion">
              <div className="ui-accordion__item"><h3 className="ui-accordion__header ui-accordion__header--lg"><button className="ui-accordion__button" type="button" aria-expanded={accordionOpen} onClick={() => setAccordionOpen((value) => !value)}><span className={`ui-accordion__expand-icon ui-accordion__expand-icon--start ${accordionOpen ? 'ui-accordion__expand-icon--open' : ''}`}><Icon name="chevron-right" /></span><span className="ui-accordion__leading-icon"><Icon name="info" /></span>Cấu hình đề thi</button></h3>{accordionOpen ? <div className="ui-accordion__panel"><p>Nội dung panel có thể đóng và mở.</p></div> : null}</div>
              <div className="ui-accordion__item"><h3 className="ui-accordion__header ui-accordion__header--sm ui-accordion__header--end-icon"><button className="ui-accordion__button" type="button" aria-expanded="false">Kích thước nhỏ<span className="ui-accordion__expand-icon ui-accordion__expand-icon--end"><Icon name="chevron-right" /></span></button></h3></div>
              <div className="ui-accordion__item"><h3 className="ui-accordion__header ui-accordion__header--disabled"><button className="ui-accordion__button" type="button" disabled>Accordion disabled</button></h3></div>
            </div>
            <div className="ui-accordion"><div className="ui-accordion__item"><h3 className="ui-accordion__header ui-accordion__header--xl ui-accordion__header--inline"><button className="ui-accordion__button" type="button" aria-expanded="true">Inline XL<span className="ui-accordion__expand-icon ui-accordion__expand-icon--end ui-accordion__expand-icon--open"><Icon name="chevron-right" /></span></button></h3><div className="ui-accordion__panel"><p>Mẫu heading lớn và inline.</p></div></div></div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Avatar and Breadcrumb</h2>
          <div className={styles.grid}>
            <div className={styles.stack}><span className={styles.sampleLabel}>Sizes, shapes and presence</span><div className={styles.buttonRow}><span className="ui-avatar ui-avatar--sm">MP</span><span className="ui-avatar">AN<span className="ui-avatar__presence" /></span><span className="ui-avatar ui-avatar--lg ui-avatar--purple">LT<span className="ui-avatar__presence ui-avatar__presence--busy" /></span><span className="ui-avatar ui-avatar--xl ui-avatar--brand">DB<span className="ui-avatar__presence ui-avatar__presence--away" /></span><span className="ui-avatar ui-avatar--lg ui-avatar--square ui-avatar--danger">QA<span className="ui-avatar__presence ui-avatar__presence--offline" /></span></div><div className="ui-avatar-group ui-avatar-group--stack"><span className="ui-avatar ui-avatar--brand">A</span><span className="ui-avatar ui-avatar--purple">B</span><span className="ui-avatar ui-avatar--neutral">+3</span></div><div className="ui-avatar-group ui-avatar-group--spread"><span className="ui-avatar">A</span><span className="ui-avatar ui-avatar--purple">B</span><span className="ui-avatar ui-avatar--danger">C</span></div><div className="ui-avatar-group ui-avatar-group--pie"><span className="ui-avatar ui-avatar--brand">A</span><span className="ui-avatar ui-avatar--purple">B</span><span className="ui-avatar ui-avatar--danger">C</span></div></div>
            <div className={styles.stack}><span className={styles.sampleLabel}>Breadcrumb sizes and states</span>{['sm', 'md', 'lg'].map((size) => <nav className={size === 'md' ? '' : `ui-breadcrumb--${size}`} aria-label={`Breadcrumb ${size}`} key={size}><ol className="ui-breadcrumb__list"><li className="ui-breadcrumb__item"><button className="ui-breadcrumb__button" type="button"><span className="ui-breadcrumb__icon"><Icon name="home" /></span>Trang chủ</button><span className="ui-breadcrumb__divider"><Icon name="chevron-right" /></span></li><li className="ui-breadcrumb__item"><button className="ui-breadcrumb__button ui-breadcrumb__button--truncated" type="button"><span className="ui-breadcrumb__label">Ngân hàng câu hỏi có tên rất dài</span></button><span className="ui-breadcrumb__divider"><Icon name="chevron-right" /></span></li><li className="ui-breadcrumb__item"><button className="ui-breadcrumb__button" type="button" aria-current="page">Chi tiết</button></li></ol></nav>)}</div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Export contest modal layout</h2>
          <p className={styles.note}>Bản đề xuất chạy như popup thật và chỉ nằm trong trang preview.</p>
          <div className={styles.proposalHeading}>
            <div>
              <span className={styles.sampleLabel}>Phương án đề xuất</span>
              <h3>Điều hướng theo nhóm, cấu hình tập trung, preview luôn hiển thị</h3>
            </div>
            <button className="ui-button ui-button--primary" type="button" onClick={() => { setProposalExported(false); setShowExportProposal(true); }}>
              <Icon name="exam-paper" />Mở popup xuất đề
            </button>
          </div>

          {showExportProposal ? (
            <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowExportProposal(false); }}>
              <div className={`ui-modal ui-modal--large ${styles.exportProposal}`} role="dialog" aria-modal="true" aria-labelledby="export-proposal-title">
                <header className="ui-modal__header">
                  <h3 className="ui-modal__title" id="export-proposal-title">Xuất đề thi: Đề thi giữa kỳ</h3>
                  <button className="ui-modal__close" type="button" aria-label="Đóng popup" onClick={() => setShowExportProposal(false)}><Icon name="close" /></button>
                </header>

                <div className={styles.exportProposalWorkspace}>
                  <nav className="ui-tablist ui-tablist--vertical" role="tablist" aria-label="Nhóm cấu hình xuất đề">
                    {([["Thông tin đề thi", "edit"], ["Định dạng & mã đề", "export"]] as const).map(([label, icon], index) => (
                      <button className="ui-tab" role="tab" type="button" aria-selected={index === exportProposalStep} onClick={() => setExportProposalStep(index)} key={label}>
                        <Icon name={icon} />{label}
                      </button>
                    ))}
                  </nav>

                  <div className={styles.exportProposalSettings}>
                    {exportProposalStep === 0 ? <>
                      <section className="export-contest-modal__panel">
                        <div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title"><span className={styles.exportProposalPanelTitle}><Icon name="edit" />Thông tin đề thi</span></strong></div>
                        <label className="ui-field"><span className="ui-field__label">Đơn vị</span><span className="ui-input ui-input--medium"><input className="ui-input__control" value={proposalDepartment} onChange={(event) => setProposalDepartment(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: BỘ GIÁO DỤC VÀ ĐÀO TẠO</span></label>
                        <label className="ui-field"><span className="ui-field__label">Loại đề</span><span className="ui-input ui-input--medium"><input className="ui-input__control" value={proposalExamType} onChange={(event) => setProposalExamType(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: ĐỀ THI CHÍNH THỨC</span></label>
                        <label className="ui-field"><span className="ui-field__label">Tên kỳ thi</span><span className="ui-input ui-input--medium"><input className="ui-input__control" placeholder="Để trống nếu không hiển thị" value={proposalExamTitle} onChange={(event) => setProposalExamTitle(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: KỲ THI TỐT NGHIỆP THPT</span></label>
                        <div className="export-contest-modal__basic-grid">
                          <label className="ui-field"><span className="ui-field__label">Môn thi</span><span className="ui-input ui-input--medium"><input className="ui-input__control" value={proposalSubject} onChange={(event) => setProposalSubject(event.target.value)} /></span><span className="ui-field__hint">Ví dụ: TOÁN</span></label>
                          <label className="ui-field"><span className="ui-field__label">Thời gian làm bài</span><span className="ui-input ui-input--medium"><NumberInput className="ui-input__control" min={1} value={proposalDuration} onChange={setProposalDuration} /></span><span className="ui-field__hint">Đơn vị: phút</span></label>
                        </div>
                      </section>

                      <section className="export-contest-modal__panel">
                        <div className="export-contest-modal__panel-header"><Checkbox checked={proposalGeneralInfoEnabled} onChange={(event) => setProposalGeneralInfoEnabled(event.target.checked)} label={<strong className={styles.exportProposalPanelTitle}><Icon name="info" />Thông tin chung (Ghi chú)</strong>} /></div>
                        {proposalGeneralInfoEnabled ? <div className={`export-contest-modal__editor-frame ${styles.exportProposalEditor}`}><RichLatexEditor content={proposalGeneralInfo} onChange={setProposalGeneralInfo} placeholder="Nhập thông tin chung..." minHeight="80px" maxHeight="220px" /></div> : <span className="ui-field__hint">Bật để thêm công thức, dữ kiện hoặc lưu ý chung vào đầu đề thi.</span>}
                      </section>
                    </> : null}

                    {exportProposalStep === 1 ? <>
                      <section className="export-contest-modal__panel">
                        <div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title"><span className={styles.exportProposalPanelTitle}><Icon name="export" />Định dạng xuất</span></strong></div>
                        <div className="export-contest-modal__choice-row">
                          <Checkbox checked={proposalFormats.word} onChange={(event) => setProposalFormats((value) => ({ ...value, word: event.target.checked }))} label={<span className={styles.exportFormatLabel}><Icon name="file-docx" />Word</span>} />
                          <Checkbox checked={proposalFormats.pdf} onChange={(event) => setProposalFormats((value) => ({ ...value, pdf: event.target.checked }))} label={<span className={styles.exportFormatLabel}><Icon name="file-pdf" />PDF</span>} />
                          <Checkbox checked={proposalFormats.latex} onChange={(event) => setProposalFormats((value) => ({ ...value, latex: event.target.checked }))} label={<span className={styles.exportFormatLabel}><Icon name="file-tex" />LaTeX</span>} />
                        </div>
                        {proposalFormats.word ? <fieldset className={styles.exportProposalGroup}><legend>Công thức trong Word</legend><Radio name="proposal-equation-format" checked={proposalEquationFormat === "omml"} onChange={() => setProposalEquationFormat("omml")} label="Word Equation (OMML)" /><Radio name="proposal-equation-format" checked={proposalEquationFormat === "mathtype"} onChange={() => setProposalEquationFormat("mathtype")} label="MathType 7 (OLE có thể chỉnh sửa)" /></fieldset> : null}
                      </section>

                      <section className="export-contest-modal__panel">
                        <div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title"><span className={styles.exportProposalPanelTitle}><Icon name="exam-paper" />Mã đề</span></strong></div>
                        <div className={styles.exportProposalInlineFields}><label className="ui-field"><span className="ui-field__label">Mã đề gốc</span><span className="ui-input ui-input--medium"><input className="ui-input__control" maxLength={32} value={proposalOriginalCode} onChange={(event) => setProposalOriginalCode(event.target.value)} /></span><span className="ui-field__hint">Mặc định: 000</span></label><label className="ui-field"><span className="ui-field__label">Số đề đảo</span><span className="ui-input ui-input--medium"><NumberInput className="ui-input__control" min={0} value={proposalShuffleCount} onChange={setProposalShuffleCount} /></span><span className="ui-field__hint">Nhập 0 nếu chỉ xuất đề gốc</span></label></div>
                        <fieldset className={styles.exportProposalGroup}><legend>Kiểu sinh mã</legend>
                          <div className={`export-contest-modal__option ${proposalCodeType === "incremental" ? "export-contest-modal__option--selected" : ""}`} onClick={() => setProposalCodeType("incremental")}><Radio name="proposal-code-type" checked={proposalCodeType === "incremental"} onChange={() => setProposalCodeType("incremental")} label="Tăng dần" /><div className="export-contest-modal__option-controls"><span>Từ</span><input className="ui-input-native export-contest-modal__compact-input--narrow" value={proposalStartingCode} onChange={(event) => setProposalStartingCode(event.target.value)} disabled={proposalCodeType !== "incremental"} /><span>Bước</span><NumberInput className="ui-input-native export-contest-modal__compact-input--narrow" min={1} value={proposalCodeStep} onChange={setProposalCodeStep} disabled={proposalCodeType !== "incremental"} /></div></div>
                          <div className={`export-contest-modal__option ${proposalCodeType === "random" ? "export-contest-modal__option--selected" : ""}`} onClick={() => setProposalCodeType("random")}><Radio name="proposal-code-type" checked={proposalCodeType === "random"} onChange={() => setProposalCodeType("random")} label="Ngẫu nhiên" /><div className="export-contest-modal__option-controls"><span>Số chữ số</span><NumberInput className="ui-input-native export-contest-modal__compact-input--narrow" min={1} max={6} value={proposalRandomLength} onChange={setProposalRandomLength} disabled={proposalCodeType !== "random"} /></div></div>
                        </fieldset>
                      </section>

                      <section className="export-contest-modal__panel">
                        <div className="export-contest-modal__panel-header"><strong className="export-contest-modal__panel-title"><span className={styles.exportProposalPanelTitle}><Icon name="rotate-cw" />Kiểu đảo</span></strong></div>
                        <div className={`ui-segmented export-contest-modal__segmented ${styles.exportShuffleMode}`} role="group" aria-label="Kiểu đảo">{([['both', 'Câu + đáp án'], ['order', 'Câu'], ['options', 'Đáp án']] as const).map(([value, label]) => <button className="ui-segmented__item" type="button" aria-pressed={proposalShuffleMode === value} onClick={() => setProposalShuffleMode(value)} key={value}>{label}</button>)}</div>
                        <span className="ui-field__hint">Áp dụng cho các đề đảo, không thay đổi đề gốc.</span>
                      </section>
                    </> : null}

                  </div>

                  <aside className={styles.exportProposalPreview}>
                    <div className={styles.exportProposalPreviewHeader}>
                      <div><strong>Xem trước đề thi</strong></div>
                      <nav className={`ui-ribbon ${styles.exportPreviewRibbon}`} aria-label="Công cụ xem trước đề thi">
                        <RibbonScroller ariaLabel="Công cụ xem trước đề thi">
                          <div className="ui-ribbon__tool-group"><span className={styles.exportPreviewPage}>Trang 1 / 4</span></div>
                          <div className="ui-ribbon__tool-group"><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="In đề thi" title="In đề thi" onClick={() => window.print()}><Icon name="printer" /></button></div>
                          <div className="ui-ribbon__tool-group"><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Vừa trang" title="Vừa trang" onClick={() => setProposalZoom(100)}><Icon name="fit-page" /></button></div>
                          <div className="ui-ribbon__tool-group"><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Thu nhỏ" title="Thu nhỏ" onClick={() => setProposalZoom((value) => Math.max(40, value - 10))}><Icon name="minus" /></button><span className="ui-input ui-input--small"><NumberInput className="ui-input__control" min={40} max={250} aria-label="Tỉ lệ xem trước" value={proposalZoom} onChange={setProposalZoom} /></span><span className="export-contest-modal__zoom-unit">%</span><button className="ui-ribbon__tool-button ui-ribbon__tool-button--icon" type="button" aria-label="Phóng to" title="Phóng to" onClick={() => setProposalZoom((value) => Math.min(250, value + 10))}><Icon name="plus" /></button></div>
                        </RibbonScroller>
                      </nav>
                    </div>
                    <div className={styles.exportProposalCanvas}><div className={styles.exportProposalPaper} style={{ "--export-preview-scale": proposalZoom / 100 } as CSSProperties}><span>{proposalDepartment}</span>{proposalExamTitle ? <span>{proposalExamTitle}</span> : null}<strong>{proposalExamType}</strong><small>Môn: {proposalSubject} · Thời gian: {proposalDuration} phút · Mã đề {proposalOriginalCode}</small><hr />{proposalGeneralInfoEnabled ? <p><i>Cho biết: π = 3,14. Không làm tròn kết quả trung gian.</i></p> : null}<p><b>Câu 1.</b> Chọn đáp án đúng trong các phương án sau.</p><p>A. Phương án thứ nhất</p><p>B. Phương án thứ hai</p><p>C. Phương án thứ ba</p></div></div>
                  </aside>
                </div>

                <footer className="ui-modal__footer export-contest-modal__footer">
                  <div className="export-contest-modal__tip">
                    <strong>Mẹo:</strong> Đối với file Word, do đặc thù tự động dàn trang, vui lòng nhấn tổ hợp <kbd>Ctrl</kbd> + <kbd>P</kbd> rồi nhấn <kbd>ESC</kbd> khi mở file để hệ thống tự động tính và cập nhật đúng tổng số trang vào phần &quot;Đề thi có ... trang&quot;.
                  </div>
                  <div className="export-contest-modal__actions">
                    <button className="ui-button ui-button--secondary" type="button" onClick={() => setShowExportProposal(false)}><Icon name="close" />Hủy</button>
                    <button className="ui-button ui-button--primary" type="button" disabled={!proposalFormats.word && !proposalFormats.pdf && !proposalFormats.latex} onClick={() => setProposalExported(true)}><Icon name="export" />{proposalExported ? "Đã xuất đề thi" : "Xuất đề thi"}</button>
                  </div>
                </footer>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
