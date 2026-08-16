"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import Link from "next/link";
import useScrollRestoration from "@/lib/useScrollRestoration";
import { toast } from "@/lib/toastStore";

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
  const [error, setError] = useState("");
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

  useEffect(() => {
    if (!studentIdentifier.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await api.searchStudents(studentIdentifier.trim());
        setSearchResults(results);
        setShowDropdown(true);
      } catch (err) {
        console.error("Search failed", err);
        toast.error("Lỗi khi tìm học sinh");
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [studentIdentifier]);

  const fetchClassData = () => {
    setLoading(true);
    api
      .getClass(classId)
      .then((res: any) => {
        setClassData(res);
      })
      .catch((err) => {
        setError(err.message || "Không thể tải thông tin lớp học");
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
      !confirm(
        `Gỡ "${item.title}" khỏi lớp ${classData?.class_name || "này"}?\n\n` +
          `Học sinh trong lớp sẽ không còn thấy và không vào làm được ${isCoding ? "bài" : "đề"} này nữa. ` +
          "Bài đã nộp vẫn giữ nguyên.",
      )
    )
      return;
    setRemovingKey(`${item.assignment_type}-${item.id}`);
    try {
      await api.unassignFromClass(classId, item.assignment_type, item.id);
      await fetchClassData();
      toast.success("Đã gỡ khỏi lớp");
    } catch (err: any) {
      setError(err.message || "Không thể gỡ khỏi lớp");
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
        className="spinner"
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
        <div className="page-header">
          <div>
            <p className="page-sub" style={{ marginBottom: "0.35rem" }}>
              <Link href="/classes">Lớp học</Link> / Chi tiết
            </p>
            <h1 className="page-title">
              {loading ? "Đang tải..." : classData?.class_name || "Lớp học"}
            </h1>
            {classData?.teacher_name && (
              <p className="page-sub">Giáo viên: {classData.teacher_name}</p>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {user?.role === "teacher" &&
              classData &&
              user?.user_id === classData.teacher_id && (
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (
                      !confirm(
                        `Xóa lớp "${classData.class_name}"?\nHọc sinh sẽ bị gỡ khỏi lớp và các đề thi của lớp sẽ chuyển thành không gán lớp (đề và kết quả vẫn được giữ). Không thể hoàn tác.`,
                      )
                    )
                      return;
                    try {
                      await api.deleteClass(classData.id);
                      router.push("/classes");
                    } catch (e: unknown) {
                      setError(e instanceof Error ? e.message : "Lỗi xóa lớp");
                      toast.error(e instanceof Error ? e.message : "Lỗi xóa lớp");
                    }
                  }}
                >
                  Xóa lớp
                </button>
              )}
            <button
              className="btn btn-secondary"
              onClick={() => router.push("/classes")}
            >
              Quay lại
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            <div
              className="skeleton"
              style={{ height: "160px", borderRadius: "var(--radius-lg)" }}
            />
            <div
              className="skeleton"
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
                    className="btn btn-secondary btn-sm btn-block"
                    onClick={copyCode}
                  >
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
                  {user?.role === "teacher" && (
                    <button
                      className="btn btn-primary"
                      onClick={openAssignmentPicker}
                    >
                      Giao bài mới
                    </button>
                  )}
                </div>

                {contestCount === 0 ? (
                  <div className="empty-state">
                    <h3>Chưa có bài tập</h3>
                    <p>Lớp này chưa có bài tập hay đề thi nào.</p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(340px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    {classData.contests.map((c) => (
                      <div
                        key={`${c.assignment_type}-${c.id}`}
                        className="card"
                        style={{
                          height: "100%",
                          padding: "1.15rem 1.25rem",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <Link
                          href={
                            c.assignment_type === "coding"
                              ? `/coding/${c.id}`
                              : `/contests/${c.id}`
                          }
                          style={{ textDecoration: "none" }}
                        >
                          <h4
                            style={{
                              marginBottom: "0.7rem",
                              color: "var(--text-primary)",
                              fontSize: "1.05rem",
                            }}
                          >
                            {c.title}
                          </h4>
                        </Link>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.45rem",
                            alignItems: "center",
                            flexWrap: "wrap",
                            marginBottom: ".65rem",
                          }}
                        >
                          <span
                            className={`badge ${c.assignment_type === "coding" ? "badge-cd" : ""}`}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {c.assignment_type === "coding"
                              ? "Lập trình"
                              : "Đề thi"}
                          </span>
                          <span
                            className={`badge ${c.status === "published" || c.status === "active" ? "badge-active" : "badge-inactive"}`}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {c.status === "published" || c.status === "active"
                              ? "Đang mở"
                              : "Bản nháp"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: ".82rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {scheduleLabel(c)}
                        </div>
                        {user?.role === "teacher" && (
                          <div
                            style={{
                              display: "flex",
                              gap: ".5rem",
                              marginTop: "auto",
                              paddingTop: ".8rem",
                            }}
                          >
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openClassSubmissions(c)}
                            >
                              Bài làm của lớp
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--accent-danger)" }}
                              disabled={
                                removingKey === `${c.assignment_type}-${c.id}`
                              }
                              onClick={() => removeFromClass(c)}
                            >
                              {removingKey === `${c.assignment_type}-${c.id}`
                                ? "Đang gỡ…"
                                : "Gỡ khỏi lớp"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
                    <div style={{ position: "relative" }}>
                      <form
                        onSubmit={handleAddStudent}
                        style={{ display: "flex", gap: "0.5rem" }}
                      >
                        <input
                          type="text"
                          className="input"
                          placeholder="ID, Tên hoặc Email..."
                          value={studentIdentifier}
                          onChange={(e) => setStudentIdentifier(e.target.value)}
                          onFocus={() => {
                            if (searchResults.length > 0) setShowDropdown(true);
                          }}
                          onBlur={() =>
                            setTimeout(() => setShowDropdown(false), 200)
                          }
                          style={{ width: "240px", marginBottom: 0 }}
                          disabled={addStudentLoading}
                        />
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={
                            addStudentLoading || !studentIdentifier.trim()
                          }
                        >
                          {addStudentLoading ? "Đang thêm..." : "Thêm"}
                        </button>
                      </form>
                      {showDropdown && (
                        <ul
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: "80px", // leave space for the button
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-md)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            zIndex: 10,
                            listStyle: "none",
                            padding: "0.5rem 0",
                            margin: "0.25rem 0 0 0",
                            maxHeight: "200px",
                            overflowY: "auto",
                          }}
                        >
                          {searchLoading ? (
                            <li
                              style={{
                                padding: "0.5rem 1rem",
                                color: "var(--text-muted)",
                                fontSize: "0.85rem",
                                textAlign: "center",
                              }}
                            >
                              Đang tìm...
                            </li>
                          ) : searchResults.length === 0 ? (
                            <li
                              style={{
                                padding: "0.5rem 1rem",
                                color: "var(--text-muted)",
                                fontSize: "0.85rem",
                                textAlign: "center",
                              }}
                            >
                              Không tìm thấy
                            </li>
                          ) : (
                            searchResults.map((st) => (
                              <li
                                key={st.id}
                                onMouseDown={() =>
                                  handleAddStudentById(st.id.toString())
                                }
                                style={{
                                  padding: "0.5rem 1rem",
                                  cursor: "pointer",
                                  borderBottom: "1px solid var(--border)",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background =
                                    "var(--bg-hover)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background =
                                    "transparent")
                                }
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: "0.9rem",
                                  }}
                                >
                                  [ID: {st.id}] {st.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  {st.email}
                                </div>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {addStudentError && (
                  <div
                    className="alert alert-error"
                    style={{ marginBottom: "1rem" }}
                  >
                    {addStudentError}
                  </div>
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
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAssignmentPicker(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "var(--overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2.5vh",
          }}
        >
          <div
            className="card modal-wide-responsive"
            style={{
              width: "95vw",
              maxWidth: 1400,
              height: "95vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  Giao bài cho {classData?.class_name || "lớp học"}
                </h2>
                <p className="page-sub" style={{ margin: ".25rem 0 0" }}>
                  Chọn một đề đã tạo; cùng một đề có thể giao cho nhiều lớp.
                </p>
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <Link
                  className="btn btn-primary"
                  href={`/contests/new?class_id=${classId}`}
                >
                  Tạo đề thi
                </Link>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAssignmentPicker(false)}
                >
                  Đóng
                </button>
              </div>
            </div>
            <div
              style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}
            >
              {pickerError && (
                <div
                  className="alert alert-error"
                  style={{ marginBottom: "1rem" }}
                >
                  {pickerError}
                </div>
              )}
              {pickerLoading ? (
                <div className="spinner" style={{ margin: "4rem auto" }} />
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
                          <input
                            type="checkbox"
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
                              <input
                                type="checkbox"
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
                className="btn btn-primary"
                disabled={!selectedAssignmentKeys.length || !!assigningKey}
                onClick={assignSelected}
              >
                {assigningKey ? "Đang thêm…" : "Thêm vào lớp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bài làm của riêng lớp này */}
      {submissionModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "var(--overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2.5vh",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSubmissionModal(null);
          }}
        >
          <div
            className="card modal-wide-responsive"
            style={{
              width: "90vw",
              maxWidth: 1100,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
                  Bài làm của lớp · {submissionModal.item.title}
                </h2>
                <p className="page-sub" style={{ margin: ".25rem 0 0" }}>
                  {classData?.class_name} · {distinctDoerCount}/{studentCount}{" "}
                  học sinh đã làm
                  {submissionModal.item.assignment_type !== "coding" &&
                  submissionModal.rows.length !== distinctDoerCount
                    ? ` · ${submissionModal.rows.length} lượt thi`
                    : ""}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSubmissionModal(null)}
              >
                Đóng
              </button>
            </div>
            <div
              style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}
            >
              {submissionModal.error ? (
                <div className="alert alert-error">{submissionModal.error}</div>
              ) : submissionModal.loading ? (
                <div className="spinner" style={{ margin: "3rem auto" }} />
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
                              className="btn btn-secondary btn-sm"
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
                              className="btn btn-secondary btn-sm"
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
