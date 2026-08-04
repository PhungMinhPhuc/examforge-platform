export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (data: object) =>
    apiFetch("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  getDashboard: () => apiFetch("/auth/dashboard"),

  // Questions
  getQuestions: (params: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return apiFetch(`/questions?${query}`);
  },

  getQuestion: (id: number) => apiFetch(`/questions/${id}`),
  createQuestion: (data: object) =>
    apiFetch(`/questions`, { method: "POST", body: JSON.stringify(data) }),

  updateQuestion: (id: number, data: object) =>
    apiFetch(`/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteQuestion: (id: number) =>
    apiFetch(`/questions/${id}`, { method: "DELETE" }),

  deleteAllQuestions: () => apiFetch("/questions/all", { method: "DELETE" }),

  getSubjects: () => apiFetch("/questions/subjects/list"),

  getMetadataFilters: () => apiFetch("/questions/metadata/filters"),

  // Upload
  uploadTex: (formData: FormData) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return fetch(`${API_URL}/upload/tex`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Upload failed");
      }
      return res.json();
    });
  },

  confirmUpload: (data: object) =>
    apiFetch("/upload/confirm", { method: "POST", body: JSON.stringify(data) }),

  confirmUploadAsContest: (data: object) =>
    apiFetch("/upload/confirm-as-contest", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Classes
  getClasses: () => apiFetch("/classes"),

  createClass: (data: object) =>
    apiFetch("/classes", { method: "POST", body: JSON.stringify(data) }),

  getClass: (id: number) => apiFetch(`/classes/${id}`),

  getAvailableClassAssignments: (id: number) =>
    apiFetch(`/classes/${id}/available-assignments`),

  assignExistingToClass: (
    classId: number,
    assignmentType: "contest" | "coding",
    assignmentId: number,
  ) =>
    apiFetch(`/classes/${classId}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        assignment_type: assignmentType,
        assignment_id: assignmentId,
      }),
    }),

  deleteClass: (id: number) => apiFetch(`/classes/${id}`, { method: "DELETE" }),

  joinClass: (classPublicId: string) =>
    apiFetch("/classes/join", {
      method: "POST",
      body: JSON.stringify({ class_public_id: classPublicId }),
    }),

  addStudentToClass: (classId: number, identifier: string) =>
    apiFetch(`/classes/${classId}/students`, {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  searchStudents: (query: string) =>
    apiFetch(`/classes/students/search?q=${encodeURIComponent(query)}`),

  // Contests
  getContests: () => apiFetch("/contests"),

  createContest: (data: object) =>
    apiFetch("/contests", { method: "POST", body: JSON.stringify(data) }),

  createRandomContest: (data: object) =>
    apiFetch("/contests/random", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getContest: (id: number) => apiFetch(`/contests/${id}`),
  resolvePublicContest: (publicId: string) =>
    apiFetch(`/contests/public/${publicId}`),
  autosaveContestAnswer: (contestId: number, data: object) =>
    apiFetch(`/contests/${contestId}/answers/autosave`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateContest: (id: number, data: object) =>
    apiFetch(`/contests/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  getContestSubmissions: (id: number) =>
    apiFetch(`/contests/${id}/submissions`),

  deleteResult: (id: number) =>
    apiFetch(`/contests/results/${id}`, { method: "DELETE" }),

  startContest: (id: number, data: object) =>
    apiFetch(`/contests/${id}/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  submitContest: (id: number, data: object) =>
    apiFetch(`/contests/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getResult: (resultId: number) => apiFetch(`/contests/results/${resultId}`),

  updateContestStatus: (id: number, status: string) =>
    apiFetch(`/contests/${id}/status?status=${status}`, { method: "PATCH" }),

  // Coding module (independent from timed contests)
  getCodingQuestions: () => apiFetch("/coding/questions"),
  getCodingAssignments: () => apiFetch("/coding/assignments"),
  getCodingAssignment: (id: number) => apiFetch(`/coding/assignments/${id}`),
  resolvePublicCodingAssignment: (publicId: string) =>
    apiFetch(`/coding/public/${publicId}`),
  updateCodingAssignment: (id: number, data: object) =>
    apiFetch(`/coding/assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  addCodingAssignmentQuestion: (id: number, data: object) =>
    apiFetch(`/coding/assignments/${id}/questions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeCodingAssignmentQuestion: (assignmentId: number, questionId: number) =>
    apiFetch(`/coding/assignments/${assignmentId}/questions/${questionId}`, {
      method: "DELETE",
    }),
  createCodingAssignment: (data: object) =>
    apiFetch("/coding/assignments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCodingAssignmentStatus: (id: number, status: string) =>
    apiFetch(`/coding/assignments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  startCodingAssignment: (id: number) =>
    apiFetch(`/coding/assignments/${id}/start`, { method: "POST" }),
  submitCodingCode: (assignmentId: number, questionId: number, data: object) =>
    apiFetch(
      `/coding/assignments/${assignmentId}/questions/${questionId}/submit`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  getCodingSubmissionHistory: (assignmentId: number, questionId: number) =>
    apiFetch(
      `/coding/assignments/${assignmentId}/questions/${questionId}/submissions`,
    ),
  getCodingStudentSubmissions: (assignmentId: number, studentId: number) =>
    apiFetch(
      `/coding/assignments/${assignmentId}/students/${studentId}/submissions`,
    ),

  exportContest: (id: number, data: object) =>
    apiFetch(`/export/exam/${id}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getContestPreviewHTML: (id: number, data: object) =>
    apiFetch(`/export/exam/${id}/preview`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getExportStatus: (taskId: string) => apiFetch(`/export/status/${taskId}`),
};

export default api;
