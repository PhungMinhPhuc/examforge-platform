"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import useScrollRestoration from "@/lib/useScrollRestoration";
import { toast } from "@/lib/toastStore";
import { Icon } from "@/components/icons";
import Checkbox from "@/components/Checkbox";
import MessageBar from "@/components/MessageBar";
import { confirmDialog } from "@/lib/confirmDialog";
import AnchoredOverlay from "@/components/AnchoredOverlay";
import { Spinner } from "@/components/Loading";
import ViewModeToggle from "@/components/ViewModeToggle";
import { CollectionItem, CollectionView } from "@/components/CollectionView";
import useViewModePreference from "@/lib/useViewModePreference";

interface Student {
  id: number;
  name: string;
  email: string;
  joined_at: string;
}

interface Contest {
  id: number;
  title: string;
  status: string;
  time_limit: number | null;
  due_at?: string | null;
  assignment_type: "contest" | "coding";
}

// Không hạn nộp thì ghi không giới hạn, có hạn thì ghi thời gian làm + hạn nộp
function scheduleLabel(item: Contest) {
  if (!item.due_at) return "Không giới hạn thời gian";
  const due = new Date(item.due_at).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const doing = item.time_limit
    ? `${item.time_limit} phút`
    : "Không giới hạn thời gian làm bài";
  return `${doing} · Hạn ${due}`;
}

interface AvailableAssignment extends Contest {
  assigned: boolean;
}

// coding_assignment_students.status
const CODING_PROGRESS_LABELS: Record<string, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang làm",
  completed: "Đã hoàn thành",
};

interface ClassDetail {
  id: number;
  public_id: string;
  class_name: string;
  description: string;
  teacher_id: number;
  teacher_name?: string;
  create_at: string;
  students: Student[];
  contests: Contest[];
}

type Tab = "overview" | "contests" | "students";

export default function ClassDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const classId = Number(params.id);

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // giữ tab trong URL, không thì quay lại trang là rơi về Tổng quan
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) || "overview",
  );
  const [copied, setCopied] = useState(false);
  const [showAssignmentPicker, setShowAssignmentPicker] = useState(false);
  const [availableAssignments, setAvailableAssignments] = useState<
    AvailableAssignment[]
  >([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [assigningKey, setAssigningKey] = useState("");
  const [selectedAssignmentKeys, setSelectedAssignmentKeys] = useState<
    string[]
  >([]);
  const [pickerError, setPickerError] = useState("");
  const [removingKey, setRemovingKey] = useState("");
  const [assignmentViewMode, setAssignmentViewMode] = useViewModePreference(
    "ui.class-assignments.view-mode",
    "grid",
  );
  const [submissionModal, setSubmissionModal] = useState<{
    item: Contest;
    rows: any[];
    maxScore?: number | null;
    loading: boolean;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  useScrollRestoration(!!classData);

  const [studentIdentifier, setStudentIdentifier] = useState("");
  const [addStudentLoading, setAddStudentLoading] = useState(false);
  const [addStudentError, setAddStudentError] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeStudentIndex, setActiveStudentIndex] = useState(-1);
  const studentSearchRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!studentIdentifier.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchLoading(true);
      setAddStudentError("");
      try {
        const results = await api.searchStudents(studentIdentifier.trim());
        setSearchResults(results);
        setActiveStudentIndex(-1);
        setShowDropdown(true);
      } catch (err) {
        console.error("Search failed", err);
        setAddStudentError("Lỗi khi tìm học sinh");
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [studentIdentifier]);

  const fetchClassData = () => {
    setLoading(true);
    setLoadError("");
    api
      .getClass(classId)
      .then((res: any) => {
        setClassData(res);
      })
      .catch((err) => {
        setLoadError(err.message || "Không thể tải thông tin lớp học");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isNaN(classId)) return;
    fetchClassData();
  }, [classId]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentIdentifier.trim()) return;

    setAddStudentLoading(true);
    setAddStudentError("");
    try {
      await api.addStudentToClass(classId, studentIdentifier.trim());
      setStudentIdentifier("");
      setShowDropdown(false);
      fetchClassData();
    } catch (err: any) {
      setAddStudentError(err.message || "Không thể thêm học sinh");
    } finally {
      setAddStudentLoading(false);
    }
  };

  const handleAddStudentById = async (studentId: string) => {
    setAddStudentLoading(true);
    setAddStudentError("");
    try {
      await api.addStudentToClass(classId, studentId);
      setStudentIdentifier("");
      setShowDropdown(false);
      fetchClassData();
    } catch (err: any) {
      setAddStudentError(err.message || "Không thể thêm học sinh");
    } finally {
      setAddStudentLoading(false);
    }
  };

  const copyCode = () => {
    if (!classData) return;
    navigator.clipboard.writeText(classData.public_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Gỡ đề khỏi lớp: học sinh lớp này hết truy cập được, bài đã nộp vẫn giữ
  const removeFromClass = async (item: Contest) => {
    const isCoding = item.assignment_type === "coding";
    if (
      !(await confirmDialog(
        `Gỡ "${item.title}" khỏi lớp ${classData?.class_name || "này"}?\n\n` +
          `Học sinh trong lớp sẽ không còn thấy và không vào làm được ${isCoding ? "bài" : "đề"} này nữa. ` +
          "Bài đã nộp vẫn giữ nguyên.",
        { title: "Gỡ bài khỏi lớp", confirmLabel: "Gỡ bài", intent: "danger" },
      ))
    )
      return;
    setRemovingKey(`${item.assignment_type}-${item.id}`);
    try {
      await api.unassignFromClass(classId, item.assignment_type, item.id);
      await fetchClassData();
      toast.success("Đã gỡ khỏi lớp");
    } catch (err: any) {
      toast.error(err.message || "Không thể gỡ khỏi lớp");
    } finally {
      setRemovingKey("");
    }
  };

  // Bài làm của riêng lớp này: lọc theo thành viên hiện tại của lớp.
  const openClassSubmissions = async (item: Contest) => {
    setSubmissionModal({ item, rows: [], loading: true, error: "" });
    try {
      if (item.assignment_type === "coding") {
        const data: any = await api.getCodingAssignment(item.id, classId);
        setSubmissionModal({
          item,
          rows: data.students || [],
          loading: false,
          error: "",
        });
      } else {
        const data: any = await api.getContestSubmissions(item.id, classId);
        setSubmissionModal({
          item,
          rows: data.submissions || [],
          maxScore: data.max_score ?? null,
          loading: false,
          error: "",
        });
      }
    } catch (err: any) {
      setSubmissionModal({
        item,
        rows: [],
        loading: false,
        error: err.message || "Không thể tải bài làm",
      });
    }
  };

  const openAssignmentPicker = async () => {
    setShowAssignmentPicker(true);
    setSelectedAssignmentKeys([]);
    setPickerLoading(true);
    setPickerError("");
    try {
      const data: any = await api.getAvailableClassAssignments(classId);
      setAvailableAssignments([
        ...(data.contests || []),
        ...(data.coding || []),
      ]);
    } catch (err: any) {
      setPickerError(err.message || "Không thể tải danh sách đề");
    } finally {
      setPickerLoading(false);
    }
  };

  const assignSelected = async () => {
    const selected = availableAssignments.filter(
      (item) =>
        selectedAssignmentKeys.includes(`${item.assignment_type}-${item.id}`) &&
        !item.assigned,
    );
    if (!selected.length) return;
    setAssigningKey("batch");
    setPickerError("");
    try {
      await Promise.all(
        selected.map((item) =>
          api.assignExistingToClass(classId, item.assignment_type, item.id),
        ),
      );
      setAvailableAssignments((items) =>
        items.map((item) =>
          selectedAssignmentKeys.includes(`${item.assignment_type}-${item.id}`)
            ? { ...item, assigned: true }
            : item,
        ),
      );
      setSelectedAssignmentKeys([]);
      fetchClassData();
    } catch (err: any) {
      setPickerError(err.message || "Không thể giao các đề đã chọn");
    } finally {
      setAssigningKey("");
    }
  };

  const studentCount = classData?.students?.length || 0;
  const contestCount = classData?.contests?.length || 0;

  // đếm theo student_id, một học sinh thi nhiều lượt vẫn là một người
  const distinctDoerCount = new Set(
    (submissionModal?.rows || []).map(
      (row: any) => row.student_id ?? `result-${row.result_id ?? row.id}`,
    ),
  ).size;

  // "chọn tất cả" chỉ tính trên đề chưa có trong lớp
  const selectableKeys = availableAssignments
    .filter((item) => !item.assigned)
    .map((item) => `${item.assignment_type}-${item.id}`);
  const allSelected =
    selectableKeys.length > 0 &&
    selectableKeys.every((key) => selectedAssignmentKeys.includes(key));
  const toggleAssignmentKey = (key: string, on: boolean) =>
    setSelectedAssignmentKeys((keys) =>
      on ? [...new Set([...keys, key])] : keys.filter((x) => x !== key),
    );

  if (authLoading) {
    return (
      <div
        className="ui-spinner"
        style={{ margin: "5rem auto", display: "block" }}
      />
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Tổng quan" },
    { key: "contests", label: `Bài tập (${contestCount})` },
    { key: "students", label: `Học sinh (${studentCount})` },
  ];

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        {/* Header */}
        <PageHeader
          breadcrumbs={[{ label: "Lớp học", href: "/classes" }, { label: classData?.class_name || "Chi tiết lớp", truncate: true }]}
          title={loading ? "Đang tải..." : classData?.class_name || "Lớp học"}
          description={classData?.teacher_name ? `Giáo viên: ${classData.teacher_name}` : undefined}
          actions={<>
            {user?.role === "teacher" &&
              classData &&
              user?.user_id === classData.teacher_id && (
                <button
                  className="ui-button ui-button--danger"
                  onClick={async () => {
                    if (
                      !(await confirmDialog(
                        `Xóa lớp "${classData.class_name}"?\nHọc sinh sẽ bị gỡ khỏi lớp và các đề thi của lớp sẽ chuyển thành không gán lớp (đề và kết quả vẫn được giữ). Không thể hoàn tác.`,
                        { title: "Xóa lớp học", confirmLabel: "Xóa lớp", intent: "danger" },
                      ))
                    )
                      return;
                    try {
                      await api.deleteClass(classData.id);
                      router.push("/classes");
                    } catch (e: unknown) {
                      toast.error(
                        e instanceof Error ? e.message : "Lỗi xóa lớp",
                      );
                    }
                  }}
                >
                  <Icon name="trash" />
                  Xóa lớp
                </button>
              )}
          </>}
        />

        {loadError && (
          <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => router.push("/classes")}>
            {loadError}
          </MessageBar>
        )}

        {loading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            <div
              className="ui-skeleton"
              style={{ height: "160px", borderRadius: "var(--radius-lg)" }}
            />
            <div
              className="ui-skeleton"
              style={{ height: "360px", borderRadius: "var(--radius-lg)" }}
            />
          </div>
        ) : classData ? (
          <>
            {/* Info card */}
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: "2rem",
                  alignItems: "start",
                }}
                className="class-info-grid"
              >
                <div>
                  {classData.description ? (
                    <p
                      style={{
                        color: "var(--text-secondary)",
                        lineHeight: 1.6,
                      }}
                    >
                      {classData.description}
                    </p>
                  ) : (
                    <p style={{ color: "var(--text-muted)" }}>
                      Chưa có mô tả cho lớp học này.
                    </p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: "2.5rem",
                      marginTop: "1.5rem",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                        {studentCount}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Học sinh
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                        {contestCount}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Bài tập
                      </div>
                    </div>
                  </div>
                </div>

                {/* Join code */}
                <div
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "1rem",
                    minWidth: "240px",
                  }}
                >
                  <div
                    className="form-label"
                    style={{ marginBottom: "0.6rem" }}
                  >
                    Mã tham gia lớp
                  </div>
                  <code
                    style={{
                      display: "block",
                      background: "var(--bg-base)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.8rem",
                      wordBreak: "break-all",
                      marginBottom: "0.6rem",
                    }}
                  >
                    {classData.public_id}
                  </code>
                  <button
                    className="ui-button ui-button--secondary ui-button--small ui-button--block"
                    onClick={copyCode}
                  >
                    <Icon name={copied ? "check" : "copy"} />
                    {copied ? "Đã sao chép" : "Sao chép mã"}
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: "1.75rem",
                borderBottom: "1px solid var(--border)",
                marginBottom: "1.5rem",
              }}
            >
              {tabs.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setActiveTab(t.key);
                      router.replace(`?tab=${t.key}`, { scroll: false });
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0.75rem 0",
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      color: active
                        ? "var(--accent-primary)"
                        : "var(--text-secondary)",
                      borderBottom: active
                        ? "2px solid var(--accent-primary)"
                        : "2px solid transparent",
                      marginBottom: "-1px",
                      transition: "all var(--transition)",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <div className="card">
                <h3 style={{ marginBottom: "0.75rem" }}>Lớp học đã sẵn sàng</h3>
                <p style={{ color: "var(--text-secondary)" }}>
                  Chuyển sang tab <strong>Bài tập</strong> để xem các đề thi đã
                  giao, hoặc tab <strong>Học sinh</strong> để quản lý danh sách
                  lớp.
                </p>
              </div>
            )}

            {/* Contests */}
            {activeTab === "contests" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1.25rem",
                  }}
                >
                  <h3 style={{ margin: 0 }}>Danh sách bài tập</h3>
                  <div className="ui-collection-controls">
                    <ViewModeToggle
                      value={assignmentViewMode}
                      onChange={setAssignmentViewMode}
                    />
                    {user?.role === "teacher" && (
                      <button
                        className="ui-button ui-button--primary"
                        onClick={openAssignmentPicker}
                      >
                        Giao bài mới
                      </button>
                    )}
                  </div>
                </div>

                {contestCount === 0 ? (
                  <div className="empty-state">
                    <h3>Chưa có bài tập</h3>
                    <p>Lớp này chưa có bài tập hay đề thi nào.</p>
                  </div>
                ) : (
                  <CollectionView
                    items={classData.contests}
                    mode={assignmentViewMode}
                    getKey={(c) => `${c.assignment_type}-${c.id}`}
                    ariaLabel="Danh sách bài tập"
                    renderItem={(c) => (
                      <CollectionItem
                        href={c.assignment_type === "coding" ? `/coding/${c.id}` : `/contests/${c.id}`}
                        badges={(
                          <>
                            <span className={`badge ${c.assignment_type === "coding" ? "badge-cd" : ""}`}>
                              {c.assignment_type === "coding" ? "Lập trình" : "Đề thi"}
                            </span>
                            <span className={`badge ${c.status === "published" || c.status === "active" ? "badge-active" : "badge-inactive"}`}>
                              {c.status === "published" || c.status === "active" ? "Đang mở" : "Bản nháp"}
                            </span>
                          </>
                        )}
                        title={<Link href={c.assignment_type === "coding" ? `/coding/${c.id}` : `/contests/${c.id}`}>{c.title}</Link>}
                        metadata={<span>{scheduleLabel(c)}</span>}
                        actions={user?.role === "teacher" ? (
                          <>
                            <button className="ui-button ui-button--secondary ui-button--small" onClick={() => openClassSubmissions(c)}>Bài làm của lớp</button>
                            <button
                              className="ui-button ui-button--danger ui-button--small"
                              disabled={removingKey === `${c.assignment_type}-${c.id}`}
                              onClick={() => removeFromClass(c)}
                            >
                              {removingKey === `${c.assignment_type}-${c.id}` ? "Đang gỡ…" : "Gỡ khỏi lớp"}
                            </button>
                          </>
                        ) : undefined}
                      />
                    )}
                  />
                )}
              </div>
            )}

            {/* Students */}
            {activeTab === "students" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1.25rem",
                  }}
                >
                  <h3 style={{ margin: 0 }}>Danh sách học sinh</h3>
                  {user?.role === "teacher" && (
                    <div>
                      <form
                        onSubmit={handleAddStudent}
                        style={{ display: "flex", gap: "0.5rem" }}
                      >
                        <span
                          ref={studentSearchRef}
                          className="ui-input"
                          style={{ width: "var(--combobox-min-width)" }}
                        >
                          <span className="ui-input__before" aria-hidden="true">
                            <Icon name="search" size="var(--control-icon-size)" />
                          </span>
                          <input
                            type="search"
                            role="combobox"
                            className="ui-input__control"
                            placeholder="ID, tên hoặc email..."
                            value={studentIdentifier}
                            aria-autocomplete="list"
                            aria-expanded={showDropdown}
                            aria-controls="student-search-results"
                            aria-activedescendant={
                              activeStudentIndex >= 0
                                ? `student-search-option-${activeStudentIndex}`
                                : undefined
                            }
                            onChange={(e) => setStudentIdentifier(e.target.value)}
                            onFocus={() => {
                              if (studentIdentifier.trim()) setShowDropdown(true);
                            }}
                            onBlur={() =>
                              setTimeout(() => setShowDropdown(false), 200)
                            }
                            onKeyDown={(event) => {
                              if (
                                (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                                searchResults.length
                              ) {
                                event.preventDefault();
                                const step = event.key === "ArrowDown" ? 1 : -1;
                                setShowDropdown(true);
                                setActiveStudentIndex((current) =>
                                  (current + step + searchResults.length) % searchResults.length,
                                );
                              } else if (
                                event.key === "Enter" &&
                                showDropdown &&
                                activeStudentIndex >= 0
                              ) {
                                event.preventDefault();
                                handleAddStudentById(
                                  searchResults[activeStudentIndex].id.toString(),
                                );
                              } else if (event.key === "Escape") {
                                setShowDropdown(false);
                              }
                            }}
                            disabled={addStudentLoading}
                          />
                          {studentIdentifier && (
                            <button
                              className="ui-input__after"
                              type="button"
                              aria-label="Xóa nội dung tìm kiếm"
                              onClick={() => {
                                setStudentIdentifier("");
                                setSearchResults([]);
                                setShowDropdown(false);
                                setActiveStudentIndex(-1);
                              }}
                            >
                              <Icon name="x" size="var(--control-icon-size)" />
                            </button>
                          )}
                        </span>
                        <button
                          type="submit"
                          className="ui-button ui-button--primary"
                          disabled={
                            addStudentLoading || !studentIdentifier.trim()
                          }
                        >
                          {!addStudentLoading && <Icon name="user-plus" />}
                          {addStudentLoading ? "Đang thêm..." : "Thêm"}
                        </button>
                      </form>
                      {showDropdown && (
                        <AnchoredOverlay
                          anchorRef={studentSearchRef}
                          id="student-search-results"
                          className="ui-combobox__listbox ui-combobox__listbox--portal"
                          role="listbox"
                          style={{ width: "var(--combobox-min-width)" }}
                        >
                          {searchLoading ? (
                            <div className="ui-combobox__loading">
                              <Spinner size="small" label="Đang tìm…" />
                            </div>
                          ) : searchResults.length === 0 ? (
                            <div className="ui-combobox__empty">
                              Không tìm thấy
                            </div>
                          ) : (
                            searchResults.map((st, index) => (
                              <div
                                key={st.id}
                                id={`student-search-option-${index}`}
                                className={`ui-combobox__option ui-combobox__option--stacked ${activeStudentIndex === index ? "ui-combobox__option--active" : ""}`}
                                role="option"
                                aria-selected="false"
                                onMouseEnter={() => setActiveStudentIndex(index)}
                                onMouseDown={() =>
                                  handleAddStudentById(st.id.toString())
                                }
                              >
                                <span>
                                  {st.id} - {st.name}
                                </span>
                                <span className="ui-combobox__option-secondary">
                                  {st.email}
                                </span>
                              </div>
                            ))
                          )}
                        </AnchoredOverlay>
                      )}
                    </div>
                  )}
                </div>

                {addStudentError && (
                  <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setAddStudentError("")}>
                    {addStudentError}
                  </MessageBar>
                )}

                {studentCount === 0 ? (
                  <div className="empty-state">
                    <h3>Chưa có học sinh</h3>
                    <p>Lớp học hiện chưa có học sinh nào tham gia.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="problem-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Họ và tên</th>
                          <th>Email</th>
                          <th>Ngày tham gia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classData.students.map((s) => (
                          <tr key={s.id}>
                            <td style={{ fontFamily: "monospace" }}>{s.id}</td>
                            <td
                              className="col-text"
                              style={{ fontWeight: 500 }}
                            >
                              {s.name}
                            </td>
                            <td className="col-text">{s.email}</td>
                            <td>
                              {new Date(s.joined_at).toLocaleDateString(
                                "vi-VN",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </main>
      {showAssignmentPicker && (
        <div
          className="ui-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAssignmentPicker(false);
          }}
        >
          <div
            className="ui-modal ui-modal--large"
          >
            <header className="ui-modal__header">
              <div className="ui-modal__heading">
                <h2 className="ui-modal__title">
                  Giao bài cho {classData?.class_name || "lớp học"}
                </h2>
                <p className="ui-modal__description">
                  Chọn một đề đã tạo; cùng một đề có thể giao cho nhiều lớp.
                </p>
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <Link
                  className="ui-button ui-button--primary"
                  href={`/contests/new?class_id=${classId}`}
                >
                  <Icon name="plus" />
                  Tạo đề thi
                </Link>
                <button
                  className="ui-modal__close"
                  type="button"
                  aria-label="Đóng"
                  onClick={() => setShowAssignmentPicker(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
            </header>
            <div
              style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}
            >
              {pickerError && (
                <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setPickerError("")}>
                  {pickerError}
                </MessageBar>
              )}
              {pickerLoading ? (
                <div className="ui-spinner" style={{ margin: "4rem auto" }} />
              ) : availableAssignments.length === 0 ? (
                <div className="empty-state">
                  <h3>Chưa có đề để giao</h3>
                  <p>Hãy tạo đề thi hoặc bài tập lập trình trước.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="problem-table pick-table">
                    <colgroup>
                      <col className="pick-col" />
                      <col style={{ width: "38%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "18%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>
                          <Checkbox
                            aria-label="Chọn tất cả"
                            disabled={!selectableKeys.length}
                            checked={allSelected}
                            onChange={(e) =>
                              setSelectedAssignmentKeys(
                                e.target.checked ? selectableKeys : [],
                              )
                            }
                          />
                        </th>
                        <th>Đề / bài</th>
                        <th>Loại</th>
                        <th>Thời lượng</th>
                        <th>Trạng thái</th>
                        <th>Trong lớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableAssignments.map((item) => {
                        const key = `${item.assignment_type}-${item.id}`;
                        const selected = selectedAssignmentKeys.includes(key);
                        return (
                          <tr
                            key={key}
                            className={
                              item.assigned
                                ? "is-assigned"
                                : selected
                                  ? "is-selected"
                                  : undefined
                            }
                            onClick={() =>
                              !item.assigned &&
                              toggleAssignmentKey(key, !selected)
                            }
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                aria-label={`Chọn ${item.title}`}
                                disabled={item.assigned}
                                checked={item.assigned || selected}
                                onChange={(e) =>
                                  toggleAssignmentKey(key, e.target.checked)
                                }
                              />
                            </td>
                            <td className="col-text">
                              <strong>{item.title}</strong>
                            </td>
                            <td>
                              <span
                                className={`badge ${item.assignment_type === "coding" ? "badge-cd" : "badge-mode"}`}
                              >
                                {item.assignment_type === "coding"
                                  ? "Lập trình"
                                  : "Đề thi"}
                              </span>
                            </td>
                            <td>
                              {item.time_limit
                                ? `${item.time_limit} phút`
                                : "Không giới hạn"}
                            </td>
                            <td>
                              <span
                                className={`badge ${item.status === "active" ? "badge-active" : "badge-inactive"}`}
                              >
                                {item.status === "active" ? "Đang mở" : "Đóng"}
                              </span>
                            </td>
                            <td>
                              {item.assigned ? (
                                <span className="badge badge-active">
                                  Đã có
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div
              style={{
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong>Đã chọn: {selectedAssignmentKeys.length} đề/bài</strong>
              <button
                className="ui-button ui-button--primary"
                disabled={!selectedAssignmentKeys.length || !!assigningKey}
                onClick={assignSelected}
              >
                {!assigningKey && <Icon name="plus" />}
                {assigningKey ? "Đang thêm…" : "Thêm vào lớp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bài làm của riêng lớp này */}
      {submissionModal && (
        <div
          className="ui-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSubmissionModal(null);
          }}
        >
          <div
            className="ui-modal ui-modal--large"
          >
            <header className="ui-modal__header">
              <div className="ui-modal__heading">
                <h2 className="ui-modal__title">
                  Bài làm của lớp · {submissionModal.item.title}
                </h2>
                <p className="ui-modal__description">
                  {classData?.class_name} · {distinctDoerCount}/{studentCount}{" "}
                  học sinh đã làm
                  {submissionModal.item.assignment_type !== "coding" &&
                  submissionModal.rows.length !== distinctDoerCount
                    ? ` · ${submissionModal.rows.length} lượt thi`
                    : ""}
                </p>
              </div>
              <button
                className="ui-modal__close"
                type="button"
                aria-label="Đóng"
                onClick={() => setSubmissionModal(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div
              style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}
            >
              {submissionModal.error ? (
                <MessageBar
                  intent="error"
                  onDismiss={() =>
                    setSubmissionModal((current) =>
                      current ? { ...current, error: "" } : current,
                    )
                  }
                >
                  {submissionModal.error}
                </MessageBar>
              ) : submissionModal.loading ? (
                <div className="ui-spinner" style={{ margin: "3rem auto" }} />
              ) : submissionModal.rows.length === 0 ? (
                <div className="empty-state">
                  <p>Chưa có học sinh nào trong lớp làm bài này.</p>
                </div>
              ) : submissionModal.item.assignment_type === "coding" ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="problem-table people-table">
                    <colgroup>
                      <col style={{ width: "34%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "15%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Học sinh</th>
                        <th>Trạng thái</th>
                        <th>Lượt nộp</th>
                        <th>Lần nộp cuối</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissionModal.rows.map((s: any) => (
                        <tr key={s.id}>
                          <td className="col-text">
                            <strong>{s.student_name}</strong>
                            <span className="cell-sub">{s.email}</span>
                          </td>
                          <td>
                            {s.has_late_submission ? (
                              <span className="badge badge-late">Nộp muộn</span>
                            ) : (
                              <span
                                className={`badge ${s.status === "completed" ? "badge-active" : "badge-inactive"}`}
                              >
                                {CODING_PROGRESS_LABELS[s.status] || s.status}
                              </span>
                            )}
                          </td>
                          <td>{s.submission_count}</td>
                          <td>
                            {s.last_submission_at
                              ? new Date(s.last_submission_at).toLocaleString(
                                  "vi-VN",
                                )
                              : "—"}
                          </td>
                          <td>
                            <Link
                              href={`/coding/${submissionModal.item.id}`}
                              className="ui-button ui-button--secondary ui-button--small"
                            >
                              Chi tiết
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="problem-table people-table">
                    <colgroup>
                      <col style={{ width: "34%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "15%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Thí sinh</th>
                        <th>Trạng thái</th>
                        <th>Thời gian nộp</th>
                        <th>Điểm số</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissionModal.rows.map((sub: any) => (
                        <tr key={sub.result_id}>
                          <td className="col-text">
                            <strong>{sub.student_name}</strong>
                            <span className="cell-sub">
                              {sub.student_email || "Thí sinh tự do"}
                            </span>
                          </td>
                          <td>
                            {!sub.end_time ? (
                              <span className="badge badge-inactive">
                                Đang làm
                              </span>
                            ) : sub.submitted_late ? (
                              <span className="badge badge-late">Nộp muộn</span>
                            ) : (
                              <span className="badge badge-active">Đã nộp</span>
                            )}
                          </td>
                          <td>
                            {sub.end_time
                              ? new Date(sub.end_time).toLocaleString("vi-VN")
                              : "—"}
                          </td>
                          <td className="cell-score">
                            {sub.total_score != null
                              ? Number(sub.total_score).toFixed(2)
                              : "—"}
                            {submissionModal.maxScore != null && (
                              <small>
                                /{Number(submissionModal.maxScore).toFixed(2)}
                              </small>
                            )}
                          </td>
                          <td>
                            <Link
                              href={`/results/${sub.result_id}`}
                              className="ui-button ui-button--secondary ui-button--small"
                            >
                              Chi tiết
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
